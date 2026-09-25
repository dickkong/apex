'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSession, destroySession, getSessionUser } from '@/lib/auth';
import { getDb, getPool, PgRunner, type UserRow } from '@/lib/db';
import { round2 } from '@/lib/money';
import { hashPassword, verifyPassword } from '@/lib/password';
import { getCashBalance, getPriceAsOf } from '@/lib/portfolio';
import { depositValueError, MAX_DAILY_YIELD_PCT, MIN_DAILY_YIELD_PCT } from '@/lib/limits';
import { getWithdrawalLock, WITHDRAWAL_LOCK_DAYS } from '@/lib/lockdown';
import { getFirstDepositDate } from '@/lib/queries';
import { assertLegitEmail, sendOtpEmail, verifyOtpEmail } from '@/lib/email';
import { ensureDailyYield, getEffectivePriceAsOf, setDailyYieldRate } from '@/lib/yield';

export interface ActionState {
  ok: boolean;
  message?: string;
  needsEmailVerify?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowIso(): string {
  return new Date().toISOString();
}

function readForm(fd: FormData, name: string): string {
  return ((fd.get(name) as string) ?? '').trim();
}

function parseAmount(value: string): { amount: number; error?: string } {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return { amount: 0, error: 'Enter a positive amount.' };
  return { amount: round2(n) };
}

function parseQty(value: string): { amount: number; error?: string } {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return { amount: 0, error: 'Enter a positive amount.' };
  return { amount: Math.round(n * 1e6) / 1e6 };
}

async function requireVerifiedUser(): Promise<UserRow | null> {
  const user = await getSessionUser();
  if (!user || user.status !== 'verified') return null;
  return user;
}

async function requireAdmin(): Promise<UserRow | null> {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return null;
  return user;
}

async function postLedger(
  db: PgRunner,
  entry: {
    user_id: string;
    kind: 'deposit' | 'withdraw' | 'buy' | 'sell' | 'adjustment';
    amount: number;
    note?: string | null;
    asset_id?: string | null;
    units?: number | null;
    meta?: object | null;
    status?: 'pending' | 'verified' | 'posted';
    resolved_by?: string;
  },
  resolvedAt: string | null = nowIso()
): Promise<void> {
  const status = entry.status ?? 'posted';
  const resolved = status === 'posted' && resolvedAt ? resolvedAt : null;
  await db.run(
    `INSERT INTO ledger (user_id, kind, amount, status, note, asset_id, units, meta, created_at, resolved_at, resolved_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      entry.user_id,
      entry.kind,
      entry.amount,
      status,
      entry.note ?? null,
      entry.asset_id ?? null,
      entry.units ?? null,
      entry.meta ? JSON.stringify(entry.meta) : null,
      nowIso(),
      resolved,
      entry.resolved_by ?? null,
    ]
  );
}

export async function registerUserAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const name = readForm(formData, 'name');
  const email = readForm(formData, 'email').toLowerCase();
  const password = (formData.get('password') as string) ?? '';

  if (name.length < 2) return { ok: false, message: 'Enter your full name.' };
  if (!EMAIL_RE.test(email)) return { ok: false, message: 'Enter a valid email address.' };
  if (password.length < 8) return { ok: false, message: 'Password must be at least 8 characters.' };
  const confirmPassword = (formData.get('confirmPassword') as string) ?? '';
  if (password !== confirmPassword) return { ok: false, message: 'Passwords do not match.' };

  const legitError = await assertLegitEmail(email);
  if (legitError) return { ok: false, message: legitError };

  const db = await getDb();
  if (await db.get(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [email])) {
    return { ok: false, message: 'An account with this email already exists.' };
  }

  const { salt, hash } = hashPassword(password);
  const id = randomUUID();
  await db.run(
    `INSERT INTO users (id, email, name, role, status, password_hash, salt, created_at)
     VALUES ($1, $2, $3, 'investor', 'pending', $4, $5, $6)`,
    [id, email, name, hash, salt, nowIso()]
  );

  try {
    await sendOtpEmail(email);
  } catch (err) {
    await db.run(`DELETE FROM users WHERE id = $1`, [id]).catch(() => {});
    return { ok: false, message: (err as Error).message };
  }

  return {
    ok: true,
    needsEmailVerify: true,
    message: `We emailed a verification link to ${email}. Click it in your inbox to confirm your address. If your email shows a 6-digit code instead, enter it below.`,
  };
}

export async function verifyEmailAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = readForm(formData, 'email').toLowerCase();
  const code = readForm(formData, 'code');
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, message: 'If your email contained a 6-digit code, enter it here. Otherwise use the verification link we emailed.' };
  }

  const db = await getDb();
  const user = await db.get<UserRow>(`SELECT * FROM users WHERE LOWER(email) = LOWER($1)`, [email]);
  if (!user) return { ok: false, message: 'No account found for that email.' };
  if (user.email_verified_at) {
    return { ok: false, needsEmailVerify: false, message: 'This email is already verified — sign in.' };
  }

  let valid = false;
  try {
    valid = await verifyOtpEmail(email, code);
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  if (!valid) {
    return { ok: false, message: 'That code was incorrect or expired. Request a new code.' };
  }

  await db.run(
    `UPDATE users SET email_verified_at = $1 WHERE id = $2`,
    [nowIso(), user.id]
  );
  await createSession(user.id);
  redirect('/dashboard');
}

export async function resendCodeAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = readForm(formData, 'email').toLowerCase();
  if (!email) return { ok: false, message: 'Enter your email address.' };

  const db = await getDb();
  const user = await db.get<UserRow>(`SELECT * FROM users WHERE LOWER(email) = LOWER($1)`, [email]);
  if (!user) return { ok: false, message: 'No account found for that email.' };
  if (user.email_verified_at) {
    return { ok: false, needsEmailVerify: false, message: 'This email is already verified — sign in.' };
  }

  try {
    await sendOtpEmail(email);
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  return { ok: true, message: `A new verification email was sent to ${email}. Click the link in your inbox (and check spam).` };
}

export async function loginUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = readForm(formData, 'email').toLowerCase();
  const password = (formData.get('password') as string) ?? '';

  if (!email || !password) return { ok: false, message: 'Enter your email and password.' };

  const db = await getDb();
  const user = await db.get<UserRow>(`SELECT * FROM users WHERE LOWER(email) = LOWER($1)`, [email]);
  if (!user || !verifyPassword(password, user.salt, user.password_hash)) {
    return { ok: false, message: 'Incorrect email or password.' };
  }

  await createSession(user.id);
  redirect('/dashboard');
}

export async function logoutUserAction(): Promise<void> {
  await destroySession();
  redirect('/login');
}

export async function submitDepositAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireVerifiedUser();
  if (!user) return { ok: false, message: 'Your account is pending approval by an administrator.' };

  const methodId = readForm(formData, 'methodId');
  const txid = readForm(formData, 'txid');
  const qty = parseQty(readForm(formData, 'amount'));
  if (qty.error) return { ok: false, message: qty.error };
  if (txid.length < 4) {
    return { ok: false, message: 'Enter the transaction hash (TXID) of your transfer.' };
  }

  const db = await getDb();
  const method = await db.get<{
    symbol: string;
    name: string;
    asset_id: string;
    network: string;
    wallet_address: string;
  }>(
    `SELECT dm.symbol, dm.name, dm.asset_id, dm.network, dm.wallet_address
     FROM deposit_methods dm
     WHERE dm.id = $1 AND dm.enabled = 1`,
    [methodId]
  );
  if (!method) return { ok: false, message: 'Choose a deposit channel.' };
  if (!method.wallet_address) {
    return {
      ok: false,
      message: `${method.symbol} deposits are not accepting funds yet (no receiving address configured).`,
    };
  }

  const pricePoint = await getPriceAsOf(method.asset_id, todayDateOnly());
  if (pricePoint && pricePoint.price > 0) {
    const estimate = Math.round((qty.amount * pricePoint.price) * 1e6) / 1e6;
    const limitError = depositValueError(estimate);
    if (limitError) return { ok: false, message: limitError };
  }

  const note = readForm(formData, 'note') || null;
  await postLedger(
    db,
    {
      user_id: user.id,
      kind: 'deposit',
      amount: 0,
      note,
      asset_id: method.asset_id,
      units: qty.amount,
      meta: {
        channel: 'crypto',
        methodId,
        symbol: method.symbol,
        name: method.name,
        network: method.network,
        address: method.wallet_address,
        txid,
      },
      status: 'pending',
    },
    null
  );

  revalidatePath('/dashboard');
  revalidatePath('/transactions');
  revalidatePath('/oversight');
  return {
    ok: true,
    message: `${qty.amount.toLocaleString()} ${method.symbol} deposit submitted. It will be verified and valued from a real price observation.`,
  };
}

export async function requestWithdrawalAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireVerifiedUser();
  if (!user) return { ok: false, message: 'Your account is pending approval by an administrator.' };

  const parsed = parseAmount(readForm(formData, 'amount'));
  if (parsed.error) return { ok: false, message: parsed.error };

  const lock = getWithdrawalLock({ role: user.role, anchorDate: await getFirstDepositDate(user.id) });
  if (lock.locked) {
    const message = lock.pending
      ? `Withdrawals are locked under the anti-money-laundering policy. A 30-day money-bind is placed on your first deposit — it counts down from the day that deposit is approved and posted.`
      : `Withdrawals are locked under the anti-money-laundering policy for ${WITHDRAWAL_LOCK_DAYS} days from the day your first deposit was posted. Lockdown ends ${lock.untilDate} (${lock.daysRemaining} day${lock.daysRemaining === 1 ? '' : 's'} remaining). Your capital keeps accruing at the 0.5%–1% daily rate during this period.`;
    return { ok: false, message };
  }

  if (parsed.amount > (await getCashBalance(user.id)) + 0.001) {
    return { ok: false, message: 'Requested amount exceeds your available cash balance.' };
  }

  const destination = readForm(formData, 'destination') || (user.withdraw_address ?? '');
  if (destination.length < 3 || destination.length > 200) {
    return {
      ok: false,
      message: 'Set a payout destination (your default address, or override it on the form) so the payout can be sent somewhere.',
    };
  }

  const note = readForm(formData, 'note') || null;
  const db = await getDb();
  await postLedger(
    db,
    {
      user_id: user.id,
      kind: 'withdraw',
      amount: parsed.amount,
      note,
      meta: { destination },
      status: 'pending',
    },
    null
  );

  revalidatePath('/dashboard');
  revalidatePath('/transactions');
  revalidatePath('/oversight');
  return { ok: true, message: 'Withdrawal requested. An admin will verify and post it.' };
}

export async function updatePayoutAddressAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireVerifiedUser();
  if (!user) return { ok: false, message: 'Your account is pending approval by an administrator.' };

  const address = readForm(formData, 'address');
  if (address.length < 3 || address.length > 200) {
    return { ok: false, message: 'Enter a payout address between 3 and 200 characters.' };
  }

  const db = await getDb();
  await db.run(`UPDATE users SET withdraw_address = $1 WHERE id = $2`, [address, user.id]);

  revalidatePath('/dashboard');
  revalidatePath('/oversight');
  revalidatePath('/transactions');
  return { ok: true, message: 'Default payout address saved — withdrawals will default to it.' };
}

export async function buyAssetAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireVerifiedUser();
  if (!user) return { ok: false, message: 'Your account is pending approval by an administrator.' };

  const assetId = readForm(formData, 'assetId');
  const parsed = parseAmount(readForm(formData, 'amount'));
  if (parsed.error) return { ok: false, message: parsed.error };

  await ensureDailyYield(user.id);

  const db = await getDb();
  const asset = await db.get<{ id: string; name: string; currency: string }>(
    `SELECT * FROM assets WHERE id = $1`,
    [assetId]
  );
  if (!asset) return { ok: false, message: 'Choose an asset.' };

  const pricePoint = await getEffectivePriceAsOf(assetId, todayDateOnly());
  if (!pricePoint || pricePoint.price <= 0) {
    return { ok: false, message: 'This asset has no price observation yet. An admin must add one.' };
  }

  const cash = await getCashBalance(user.id);
  if (parsed.amount > cash + 0.001) {
    return { ok: false, message: 'Insufficient cash balance for this purchase.' };
  }

  const units = parsed.amount / pricePoint.price;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const tx = new PgRunner(client);
    await postLedger(tx, {
      user_id: user.id,
      kind: 'buy',
      amount: parsed.amount,
      note: `Purchased ${asset.name} @ ${pricePoint.price.toFixed(6)}`,
      asset_id: assetId,
      units,
      meta: { price: pricePoint.price, source: pricePoint.source },
      resolved_by: user.id,
    });

    const existing = await tx.get<{ id: string; units: number; avg_cost: number }>(
      `SELECT * FROM holdings WHERE user_id = $1 AND asset_id = $2`,
      [user.id, assetId]
    );

    if (existing) {
      const newUnits = existing.units + units;
      const newAvg = (existing.units * existing.avg_cost + parsed.amount) / newUnits;
      await tx.run(`UPDATE holdings SET units = $1, avg_cost = $2 WHERE id = $3`, [newUnits, newAvg, existing.id]);
    } else {
      await tx.run(
        `INSERT INTO holdings (id, user_id, asset_id, units, avg_cost, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), user.id, assetId, units, parsed.amount / units, nowIso()]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('buyAssetAction failed:', err);
    return { ok: false, message: 'Purchase failed due to an internal error.' };
  } finally {
    client.release();
  }

  revalidatePath('/dashboard');
  revalidatePath('/holdings');
  revalidatePath('/transactions');
  return { ok: true, message: `Purchased ${units.toLocaleString()} units of ${asset.name}.` };
}

export async function sellAssetAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireVerifiedUser();
  if (!user) return { ok: false, message: 'Your account is pending approval by an administrator.' };

  const holdingId = readForm(formData, 'holdingId');
  const unitsInput = Number(readForm(formData, 'units'));
  if (!Number.isFinite(unitsInput) || unitsInput <= 0) {
    return { ok: false, message: 'Enter a positive number of units.' };
  }

  const db = await getDb();
  const holding = await db.get<{ id: string; asset_id: string; units: number; avg_cost: number }>(
    `SELECT * FROM holdings WHERE id = $1 AND user_id = $2`,
    [holdingId, user.id]
  );
  if (!holding) return { ok: false, message: 'Holding not found.' };

  if (unitsInput > holding.units + 1e-9) {
    return { ok: false, message: 'You do not hold that many units.' };
  }

  await ensureDailyYield(user.id);

  const pricePoint = await getEffectivePriceAsOf(holding.asset_id, todayDateOnly());
  if (!pricePoint) return { ok: false, message: 'This asset has no price observation yet.' };

  const proceeds = round2(unitsInput * pricePoint.price);
  const realized = round2((pricePoint.price - holding.avg_cost) * unitsInput);

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const tx = new PgRunner(client);
    await postLedger(tx, {
      user_id: user.id,
      kind: 'sell',
      amount: proceeds,
      note: `Sold ${unitsInput.toLocaleString()} units @ ${pricePoint.price.toFixed(6)}`,
      asset_id: holding.asset_id,
      units: unitsInput,
      meta: { realized_pnl: realized, price: pricePoint.price, source: pricePoint.source },
      resolved_by: user.id,
    });

    const remaining = holding.units - unitsInput;
    if (remaining < 1e-9) {
      await tx.run(`DELETE FROM holdings WHERE id = $1`, [holding.id]);
    } else {
      await tx.run(`UPDATE holdings SET units = $1 WHERE id = $2`, [remaining, holding.id]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('sellAssetAction failed:', err);
    return { ok: false, message: 'Sale failed due to an internal error.' };
  } finally {
    client.release();
  }

  revalidatePath('/dashboard');
  revalidatePath('/holdings');
  revalidatePath('/transactions');
  return { ok: true, message: `Sold units for ${proceeds.toFixed(2)}.` };
}

export async function verifyUserAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!admin) throw new Error('Admin access required.');

  const userId = readForm(formData, 'userId');
  const decision = readForm(formData, 'decision');
  const status = decision === 'approve' ? 'verified' : decision === 'reject' ? 'rejected' : null;
  if (!userId || !status) throw new Error('Missing verification parameters.');

  const db = await getDb();
  await db.run(`UPDATE users SET status = $1, verified_at = $2 WHERE id = $3`, [
    status,
    status === 'verified' ? nowIso() : null,
    userId,
  ]);
  revalidatePath('/oversight');
}

export async function resolveDepositAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!admin) throw new Error('Admin access required.');

  const id = Number(readForm(formData, 'ledgerId'));
  const decision = readForm(formData, 'decision');
  const note = readForm(formData, 'note');
  if (!Number.isInteger(id) || !['approve', 'reject'].includes(decision)) {
    throw new Error('Missing resolution parameters.');
  }

  const db = await getDb();
  const ledger = await db.get<{
    id: number;
    user_id: string;
    amount: number;
    status: string;
    asset_id: string | null;
    units: number | null;
    meta: string | null;
    note: string | null;
  }>(`SELECT * FROM ledger WHERE id = $1 AND kind = $2`, [id, 'deposit']);
  if (!ledger) throw new Error('Deposit not found.');
  if (ledger.status !== 'pending') throw new Error('This deposit was already resolved.');

  let postAmount = ledger.amount;
  if (decision === 'approve') {
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(ledger.meta ?? '{}') as Record<string, unknown>;
    } catch {
      meta = {};
    }

    if (meta.channel === 'crypto' && ledger.asset_id) {
      const pricePoint = await getPriceAsOf(ledger.asset_id, todayDateOnly());
      if (!pricePoint || pricePoint.price <= 0) {
        const symbol = typeof meta.symbol === 'string' ? meta.symbol : 'the asset';
        throw new Error(
          `Record a ${symbol} price observation first so this deposit can be valued in USD.`
        );
      }
      postAmount = round2((ledger.units ?? 0) * pricePoint.price);
      const limitError = depositValueError(postAmount);
      if (limitError) throw new Error(limitError);
      meta.valuation = { price: pricePoint.price, source: pricePoint.source, obs_date: pricePoint.obs_date };
      await db.run(`UPDATE ledger SET meta = $1 WHERE id = $2`, [JSON.stringify(meta), ledger.id]);
    }
  }

  const status = decision === 'approve' ? 'posted' : 'rejected';
  await db.run(
    `UPDATE ledger SET status = $1, amount = $2, resolved_at = $3, resolved_by = $4, note = $5 WHERE id = $6`,
    [status, postAmount, nowIso(), admin.id, note || null, ledger.id]
  );

  revalidatePath('/dashboard');
  revalidatePath('/transactions');
  revalidatePath('/oversight');
}

export async function resolveWithdrawalAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!admin) throw new Error('Admin access required.');

  const id = Number(readForm(formData, 'ledgerId'));
  const decision = readForm(formData, 'decision');
  const note = readForm(formData, 'note');
  if (!Number.isInteger(id) || !['approve', 'reject'].includes(decision)) {
    throw new Error('Missing resolution parameters.');
  }

  const db = await getDb();
  const ledger = await db.get<{ id: number; user_id: string; amount: number; status: string }>(
    `SELECT * FROM ledger WHERE id = $1 AND kind = $2`,
    [id, 'withdraw']
  );
  if (!ledger) throw new Error('Withdrawal not found.');
  if (ledger.status !== 'pending') throw new Error('This withdrawal was already resolved.');

  if (decision === 'approve' && ledger.amount > (await getCashBalance(ledger.user_id)) + 0.001) {
    throw new Error('Insufficient cash to honour this withdrawal. Reject it instead.');
  }

  const status = decision === 'approve' ? 'posted' : 'rejected';
  await db.run(`UPDATE ledger SET status = $1, resolved_at = $2, resolved_by = $3, note = $4 WHERE id = $5`, [
    status,
    nowIso(),
    admin.id,
    note || null,
    ledger.id,
  ]);

  revalidatePath('/dashboard');
  revalidatePath('/transactions');
  revalidatePath('/oversight');
}

export async function createAssetAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!admin) throw new Error('Admin access required.');

  const name = readForm(formData, 'name');
  const ticker = readForm(formData, 'ticker') || null;
  const category = readForm(formData, 'category') || 'fund';
  const isin = readForm(formData, 'isin') || null;
  const description = readForm(formData, 'description') || null;
  if (!name) throw new Error('Asset name is required.');

  const db = await getDb();
  await db.run(
    `INSERT INTO assets (id, name, ticker, category, isin, currency, description, created_at)
     VALUES ($1, $2, $3, $4, $5, 'USD', $6, $7)`,
    [randomUUID(), name, ticker, category, isin, description, nowIso()]
  );

  revalidatePath('/oversight');
}

export async function addAssetPriceAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Admin access required.' };

  const assetId = readForm(formData, 'assetId');
  const date = readForm(formData, 'date');
  const source = readForm(formData, 'source') || 'manual';
  const parsed = parseAmount(readForm(formData, 'price'));
  if (parsed.error) return { ok: false, message: parsed.error };
  if (!DATE_RE.test(date)) return { ok: false, message: 'Date must be YYYY-MM-DD.' };

  const db = await getDb();
  const asset = await db.get(`SELECT id FROM assets WHERE id = $1`, [assetId]);
  if (!asset) return { ok: false, message: 'Choose an asset.' };

  await db.run(
    `INSERT INTO price_observations (id, asset_id, obs_date, price, source, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (asset_id, obs_date) DO UPDATE SET
       price = EXCLUDED.price, source = EXCLUDED.source, created_at = EXCLUDED.created_at`,
    [randomUUID(), assetId, date, parsed.amount, source, nowIso()]
  );

  await db.run(`DELETE FROM yield_marks WHERE asset_id = $1 AND mark_date >= $2`, [assetId, date]);

  revalidatePath('/oversight');
  revalidatePath('/dashboard');
  revalidatePath('/holdings');
  return { ok: true, message: `Recorded ${date} price ${parsed.amount.toFixed(2)} (source: ${source}).` };
}

export async function updateYieldSettingsAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Admin access required.' };

  const pct = Number(readForm(formData, 'rate'));
  if (!Number.isFinite(pct) || pct < 0) {
    return { ok: false, message: 'Enter a non-negative daily rate.' };
  }
  if (pct !== 0 && (pct < MIN_DAILY_YIELD_PCT || pct > MAX_DAILY_YIELD_PCT)) {
    return {
      ok: false,
      message: `Members are advised that daily interest is always between ${MIN_DAILY_YIELD_PCT}% and ${MAX_DAILY_YIELD_PCT}% per day. Set the rate within that band (or 0 to disable).`,
    };
  }

  await setDailyYieldRate(Math.round(pct * 100) / 100 / 100);

  revalidatePath('/oversight');
  revalidatePath('/dashboard');
  revalidatePath('/holdings');
  revalidatePath('/transactions');
  return {
    ok: true,
    message:
      pct === 0
        ? 'Yield program disabled. Existing accruals are frozen, not reversed.'
        : `Daily yield rate set to ${pct.toFixed(2)}%/day — it compounds from the latest price observations and prior-day cash.`,
  };
}

export async function adminAdjustBalanceAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Admin access required.' };

  const userId = readForm(formData, 'userId');
  const signed = Number(readForm(formData, 'amount'));
  const note = readForm(formData, 'note') || 'Admin adjustment';
  if (!Number.isFinite(signed) || signed === 0) {
    return { ok: false, message: 'Enter a non-zero signed amount.' };
  }

  const db = await getDb();
  const user = await db.get(`SELECT id FROM users WHERE id = $1`, [userId]);
  if (!user) return { ok: false, message: 'User not found.' };

  await postLedger(db, {
    user_id: userId,
    kind: 'adjustment',
    amount: round2(signed),
    note,
    resolved_by: admin.id,
  });

  revalidatePath('/oversight');
  revalidatePath('/dashboard');
  revalidatePath('/transactions');
  return { ok: true, message: `Posted signed adjustment of ${signed.toFixed(2)}.` };
}

export async function createDepositMethodAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!admin) throw new Error('Admin access required.');

  const symbol = readForm(formData, 'symbol').toUpperCase();
  const name = readForm(formData, 'name');
  const assetId = readForm(formData, 'assetId');
  const network = readForm(formData, 'network') || '';
  const walletAddress = readForm(formData, 'walletAddress') || '';
  const instructions = readForm(formData, 'instructions') || null;
  if (!symbol || !name || !assetId) throw new Error('Symbol, name and asset are required.');

  const db = await getDb();
  if (await db.get(`SELECT id FROM deposit_methods WHERE LOWER(symbol) = LOWER($1)`, [symbol])) {
    throw new Error(`A channel already exists for ${symbol}.`);
  }

  await db.run(
    `INSERT INTO deposit_methods (id, symbol, name, asset_id, wallet_address, network, instructions, enabled, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8)`,
    [randomUUID(), symbol, name, assetId, walletAddress, network, instructions, nowIso()]
  );

  revalidatePath('/oversight');
}

export async function updateDepositMethodAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!admin) throw new Error('Admin access required.');

  const methodId = readForm(formData, 'methodId');
  const walletAddress = readForm(formData, 'walletAddress') || '';
  const network = readForm(formData, 'network') || '';
  const instructions = readForm(formData, 'instructions') || null;
  const enabled = readForm(formData, 'enabled') === 'on' ? 1 : 0;
  if (!methodId) throw new Error('Missing channel.');

  const db = await getDb();
  await db.run(
    `UPDATE deposit_methods SET wallet_address = $1, network = $2, instructions = $3, enabled = $4 WHERE id = $5`,
    [walletAddress, network, instructions, enabled, methodId]
  );

  revalidatePath('/oversight');
  revalidatePath('/dashboard');
}

export async function createTicketAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: 'Sign in to raise a support ticket.' };

  const subject = readForm(formData, 'subject');
  const message = readForm(formData, 'message');
  if (subject.length < 3 || subject.length > 200) {
    return { ok: false, message: 'Enter a subject between 3 and 200 characters.' };
  }
  if (message.length < 10 || message.length > 4000) {
    return { ok: false, message: 'Describe your issue in at least 10 characters (max 4000).' };
  }

  const db = await getDb();
  const now = nowIso();
  const ticketId = randomUUID();
  await db.run(
    `INSERT INTO tickets (id, user_id, subject, status, created_at, updated_at, closed_at)
     VALUES ($1, $2, $3, 'open', $4, $4, NULL)`,
    [ticketId, user.id, subject, now]
  );
  await db.run(
    `INSERT INTO ticket_replies (id, ticket_id, author_id, author_type, message, created_at)
     VALUES ($1, $2, $3, 'user', $4, $5)`,
    [randomUUID(), ticketId, user.id, message, now]
  );

  revalidatePath('/support');
  revalidatePath('/oversight');
  return { ok: true, message: 'Ticket raised — an admin will respond here in the app.' };
}

export async function replyTicketAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: 'Sign in to reply to a ticket.' };

  const ticketId = readForm(formData, 'ticketId');
  const message = readForm(formData, 'message');
  if (!ticketId) return { ok: false, message: 'Missing ticket.' };
  if (message.length < 1 || message.length > 4000) {
    return { ok: false, message: 'Enter a message (max 4000 characters).' };
  }

  const db = await getDb();
  const ticket = await db.get<{ id: string; status: string }>(
    `SELECT id, status FROM tickets WHERE id = $1`,
    [ticketId]
  );
  if (!ticket) return { ok: false, message: 'Ticket not found.' };
  if (ticket.status === 'closed') {
    return { ok: false, message: 'This ticket is closed — raise a new one if you need further help.' };
  }
  const isAdmin = user.role === 'admin';
  const owned = await db.get<{ id: string }>(`SELECT id FROM tickets WHERE id = $1 AND user_id = $2`, [
    ticketId,
    user.id,
  ]);
  if (!isAdmin && !owned) {
    return { ok: false, message: 'You can only reply to your own tickets.' };
  }

  await db.run(
    `INSERT INTO ticket_replies (id, ticket_id, author_id, author_type, message, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), ticketId, user.id, isAdmin ? 'admin' : 'user', message, nowIso()]
  );
  await db.run(
    `UPDATE tickets SET updated_at = $1 WHERE id = $2`,
    [nowIso(), ticketId]
  );

  revalidatePath('/support');
  revalidatePath('/oversight');
  return { ok: true, message: 'Reply posted to the ticket.' };
}

export async function closeTicketAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!admin) throw new Error('Admin access required.');

  const ticketId = readForm(formData, 'ticketId');
  if (!ticketId) throw new Error('Missing ticket.');

  const db = await getDb();
  const now = nowIso();
  await db.run(
    `UPDATE tickets SET status = 'closed', closed_at = $1, updated_at = $1 WHERE id = $2`,
    [now, ticketId]
  );

  revalidatePath('/support');
  revalidatePath('/oversight');
}

export async function reopenTicketAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) throw new Error('Sign in.');

  const ticketId = readForm(formData, 'ticketId');
  if (!ticketId) throw new Error('Missing ticket.');

  const db = await getDb();
  const isAdmin = user.role === 'admin';
  const owned = await db.get<{ id: string }>(`SELECT id FROM tickets WHERE id = $1 AND user_id = $2`, [
    ticketId,
    user.id,
  ]);
  if (!isAdmin && !owned) throw new Error('You can only reopen your own tickets.');

  await db.run(
    `UPDATE tickets SET status = 'open', closed_at = NULL, updated_at = $1 WHERE id = $2`,
    [nowIso(), ticketId]
  );

  revalidatePath('/support');
  revalidatePath('/oversight');
}