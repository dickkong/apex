'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSession, destroySession, getSessionUser } from '@/lib/auth';
import { getDb, type UserRow } from '@/lib/db';
import { round2 } from '@/lib/money';
import { hashPassword, verifyPassword } from '@/lib/password';
import { getCashBalance, getPriceAsOf } from '@/lib/portfolio';
import { ensureDailyYield, getEffectivePriceAsOf, setDailyYieldRate } from '@/lib/yield';

export interface ActionState {
  ok: boolean;
  message?: string;
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

function postLedger(
  db: ReturnType<typeof getDb>,
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
) {
  const status = entry.status ?? 'posted';
  const resolved = status === 'posted' && resolvedAt ? resolvedAt : null;
  db.prepare(
    `INSERT INTO ledger (user_id, kind, amount, status, note, asset_id, units, meta, created_at, resolved_at, resolved_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
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
    entry.resolved_by ?? null
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

  const db = getDb();
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return { ok: false, message: 'An account with this email already exists.' };
  }

  const { salt, hash } = hashPassword(password);
  const id = randomUUID();
  db.prepare(
    `INSERT INTO users (id, email, name, role, status, password_hash, salt, created_at)
     VALUES (?, ?, ?, 'investor', 'pending', ?, ?, ?)`
  ).run(id, email, name, hash, salt, nowIso());

  await createSession(id);
  redirect('/dashboard');
}

export async function loginUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = readForm(formData, 'email').toLowerCase();
  const password = (formData.get('password') as string) ?? '';

  if (!email || !password) return { ok: false, message: 'Enter your email and password.' };

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
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
  if (!user) return { ok: false, message: 'Sign in with a verified account first.' };

  const methodId = readForm(formData, 'methodId');
  const txid = readForm(formData, 'txid');
  const qty = parseQty(readForm(formData, 'amount'));
  if (qty.error) return { ok: false, message: qty.error };
  if (txid.length < 4) {
    return { ok: false, message: 'Enter the transaction hash (TXID) of your transfer.' };
  }

  const db = getDb();
  const method = db
    .prepare(
      `SELECT dm.symbol, dm.name, dm.asset_id, dm.network, dm.wallet_address
       FROM deposit_methods dm
       WHERE dm.id = ? AND dm.enabled = 1`
    )
    .get(methodId) as
    | {
        symbol: string;
        name: string;
        asset_id: string;
        network: string;
        wallet_address: string;
      }
    | undefined;
  if (!method) return { ok: false, message: 'Choose a deposit channel.' };
  if (!method.wallet_address) {
    return {
      ok: false,
      message: `${method.symbol} deposits are not accepting funds yet (no receiving address configured).`,
    };
  }

  const note = readForm(formData, 'note') || null;
  postLedger(
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
  if (!user) return { ok: false, message: 'Sign in with a verified account first.' };

  const parsed = parseAmount(readForm(formData, 'amount'));
  if (parsed.error) return { ok: false, message: parsed.error };
  if (parsed.amount > getCashBalance(user.id) + 0.001) {
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
  const db = getDb();
  postLedger(
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
  if (!user) return { ok: false, message: 'Sign in with a verified account first.' };

  const address = readForm(formData, 'address');
  if (address.length < 3 || address.length > 200) {
    return { ok: false, message: 'Enter a payout address between 3 and 200 characters.' };
  }

  const db = getDb();
  db.prepare('UPDATE users SET withdraw_address = ? WHERE id = ?').run(address, user.id);

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
  if (!user) return { ok: false, message: 'Sign in with a verified account first.' };

  const assetId = readForm(formData, 'assetId');
  const parsed = parseAmount(readForm(formData, 'amount'));
  if (parsed.error) return { ok: false, message: parsed.error };

  ensureDailyYield(user.id);

  const db = getDb();
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(assetId) as
    | { id: string; name: string; currency: string }
    | undefined;
  if (!asset) return { ok: false, message: 'Choose an asset.' };

  const pricePoint = getEffectivePriceAsOf(assetId, todayDateOnly());
  if (!pricePoint || pricePoint.price <= 0) {
    return { ok: false, message: 'This asset has no price observation yet. An admin must add one.' };
  }

  const cash = getCashBalance(user.id);
  if (parsed.amount > cash + 0.001) {
    return { ok: false, message: 'Insufficient cash balance for this purchase.' };
  }

  const units = parsed.amount / pricePoint.price;
  db.exec('BEGIN');
  try {
    postLedger(db, {
      user_id: user.id,
      kind: 'buy',
      amount: parsed.amount,
      note: `Purchased ${asset.name} @ ${pricePoint.price.toFixed(6)}`,
      asset_id: assetId,
      units,
      meta: { price: pricePoint.price, source: pricePoint.source },
      resolved_by: user.id,
    });

    const existing = db
      .prepare('SELECT * FROM holdings WHERE user_id = ? AND asset_id = ?')
      .get(user.id, assetId) as
      | { id: string; units: number; avg_cost: number }
      | undefined;

    if (existing) {
      const newUnits = existing.units + units;
      const newAvg = (existing.units * existing.avg_cost + parsed.amount) / newUnits;
      db.prepare('UPDATE holdings SET units = ?, avg_cost = ? WHERE id = ?').run(
        newUnits,
        newAvg,
        existing.id
      );
    } else {
      db.prepare(
        'INSERT INTO holdings (id, user_id, asset_id, units, avg_cost, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(randomUUID(), user.id, assetId, units, parsed.amount / units, nowIso());
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('buyAssetAction failed:', err);
    return { ok: false, message: 'Purchase failed due to an internal error.' };
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
  if (!user) return { ok: false, message: 'Sign in with a verified account first.' };

  const holdingId = readForm(formData, 'holdingId');
  const unitsInput = Number(readForm(formData, 'units'));
  if (!Number.isFinite(unitsInput) || unitsInput <= 0) {
    return { ok: false, message: 'Enter a positive number of units.' };
  }

  const db = getDb();
  const holding = db
    .prepare('SELECT * FROM holdings WHERE id = ? AND user_id = ?')
    .get(holdingId, user.id) as
    | { id: string; asset_id: string; units: number; avg_cost: number }
    | undefined;
  if (!holding) return { ok: false, message: 'Holding not found.' };

  if (unitsInput > holding.units + 1e-9) {
    return { ok: false, message: 'You do not hold that many units.' };
  }

  ensureDailyYield(user.id);

  const pricePoint = getEffectivePriceAsOf(holding.asset_id, todayDateOnly());
  if (!pricePoint) return { ok: false, message: 'This asset has no price observation yet.' };

  const proceeds = round2(unitsInput * pricePoint.price);
  const realized = round2((pricePoint.price - holding.avg_cost) * unitsInput);

  db.exec('BEGIN');
  try {
    postLedger(db, {
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
      db.prepare('DELETE FROM holdings WHERE id = ?').run(holding.id);
    } else {
      db.prepare('UPDATE holdings SET units = ? WHERE id = ?').run(remaining, holding.id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('sellAssetAction failed:', err);
    return { ok: false, message: 'Sale failed due to an internal error.' };
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

  const db = getDb();
  db.prepare('UPDATE users SET status = ?, verified_at = ? WHERE id = ?').run(
    status,
    status === 'verified' ? nowIso() : null,
    userId
  );
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

  const db = getDb();
  const ledger = db.prepare('SELECT * FROM ledger WHERE id = ? AND kind = ?').get(id, 'deposit') as
    | {
        id: number;
        user_id: string;
        amount: number;
        status: string;
        asset_id: string | null;
        units: number | null;
        meta: string | null;
        note: string | null;
      }
    | undefined;
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
      const pricePoint = getPriceAsOf(ledger.asset_id, todayDateOnly());
      if (!pricePoint || pricePoint.price <= 0) {
        const symbol = typeof meta.symbol === 'string' ? meta.symbol : 'the asset';
        throw new Error(
          `Record a ${symbol} price observation first so this deposit can be valued in USD.`
        );
      }
      postAmount = round2((ledger.units ?? 0) * pricePoint.price);
      meta.valuation = { price: pricePoint.price, source: pricePoint.source, obs_date: pricePoint.obs_date };
      db.prepare('UPDATE ledger SET meta = ? WHERE id = ?').run(JSON.stringify(meta), ledger.id);
    }
  }

  const status = decision === 'approve' ? 'posted' : 'rejected';
  db.prepare(
    'UPDATE ledger SET status = ?, amount = ?, resolved_at = ?, resolved_by = ?, note = ? WHERE id = ?'
  ).run(status, postAmount, nowIso(), admin.id, note || null, ledger.id);

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

  const db = getDb();
  const ledger = db.prepare('SELECT * FROM ledger WHERE id = ? AND kind = ?').get(id, 'withdraw') as
    | { id: number; user_id: string; amount: number; status: string }
    | undefined;
  if (!ledger) throw new Error('Withdrawal not found.');
  if (ledger.status !== 'pending') throw new Error('This withdrawal was already resolved.');

  if (decision === 'approve' && ledger.amount > getCashBalance(ledger.user_id) + 0.001) {
    throw new Error('Insufficient cash to honour this withdrawal. Reject it instead.');
  }

  const status = decision === 'approve' ? 'posted' : 'rejected';
  db.prepare('UPDATE ledger SET status = ?, resolved_at = ?, resolved_by = ?, note = ? WHERE id = ?').run(
    status,
    nowIso(),
    admin.id,
    note || null,
    ledger.id
  );

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

  const db = getDb();
  db.prepare(
    `INSERT INTO assets (id, name, ticker, category, isin, currency, description, created_at)
     VALUES (?, ?, ?, ?, ?, 'USD', ?, ?)`
  ).run(randomUUID(), name, ticker, category, isin, description, nowIso());

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

  const db = getDb();
  const asset = db.prepare('SELECT id FROM assets WHERE id = ?').get(assetId);
  if (!asset) return { ok: false, message: 'Choose an asset.' };

  db.prepare(
    `INSERT INTO price_observations (id, asset_id, obs_date, price, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(asset_id, obs_date) DO UPDATE SET
       price = excluded.price, source = excluded.source, created_at = excluded.created_at`
  ).run(randomUUID(), assetId, date, parsed.amount, source, nowIso());

  db.prepare('DELETE FROM yield_marks WHERE asset_id = ? AND mark_date >= ?').run(assetId, date);

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
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    return { ok: false, message: 'Enter a daily rate between 0% and 100%.' };
  }

  setDailyYieldRate(Math.round(pct * 100) / 100 / 100);

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

  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return { ok: false, message: 'User not found.' };

  postLedger(db, {
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

  const db = getDb();
  if (db.prepare('SELECT id FROM deposit_methods WHERE symbol = ? COLLATE NOCASE').get(symbol)) {
    throw new Error(`A channel already exists for ${symbol}.`);
  }

  db.prepare(
    `INSERT INTO deposit_methods (id, symbol, name, asset_id, wallet_address, network, instructions, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(randomUUID(), symbol, name, assetId, walletAddress, network, instructions, nowIso());

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

  const db = getDb();
  db.prepare(
    `UPDATE deposit_methods SET wallet_address = ?, network = ?, instructions = ?, enabled = ? WHERE id = ?`
  ).run(walletAddress, network, instructions, enabled, methodId);

  revalidatePath('/oversight');
  revalidatePath('/dashboard');
}