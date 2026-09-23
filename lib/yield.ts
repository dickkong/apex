import { randomUUID } from 'node:crypto';
import { getDb, cashCaseSql } from './db';
import { round2 } from './money';

export const YIELD_RATE_KEY = 'daily_yield_rate';
export const DEFAULT_YIELD_RATE = 0.009;

export interface EffectPricePoint {
  price: number;
  source: string | null;
  obs_date: string | null;
  kind: 'real' | 'model';
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function endOfDayIso(dateOnly: string): string {
  return `${dateOnly}T23:59:59.999Z`;
}

function dateOnlyFromIso(iso: string): string {
  return iso.slice(0, 10);
}

function addDays(dateOnly: string, n: number): string {
  const ms = Date.UTC(+dateOnly.slice(0, 4), +dateOnly.slice(5, 7) - 1, +dateOnly.slice(8, 10)) + n * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

function dayDiff(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

export async function getDailyYieldRate(): Promise<number> {
  const db = await getDb();
  const row = await db.get<{ value: string }>(`SELECT value FROM settings WHERE key = $1`, [YIELD_RATE_KEY]);
  if (!row) return DEFAULT_YIELD_RATE;
  const n = Number(row.value);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_YIELD_RATE;
}

export async function setDailyYieldRate(rate: number): Promise<void> {
  const db = await getDb();
  await db.run(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [YIELD_RATE_KEY, String(rate)]
  );
}

function markSource(rate: number): string {
  return `model +${(rate * 100).toFixed(2)}%/day`;
}

async function effectivePriceRow(assetId: string, dateOnly: string): Promise<EffectPricePoint | null> {
  const db = await getDb();
  const row = await db.get<{ price: number; source: string; obs_date: string; kind: 'real' | 'model' }>(
    `SELECT price, source, obs_date, kind FROM (
       SELECT price, source, obs_date, 'real' AS kind FROM price_observations
        WHERE asset_id = $1 AND obs_date <= $2
       UNION ALL
       SELECT price, source, mark_date AS obs_date, 'model' AS kind FROM yield_marks
        WHERE asset_id = $3 AND mark_date <= $4
     )
     ORDER BY obs_date DESC, CASE kind WHEN 'real' THEN 0 ELSE 1 END ASC
     LIMIT 1`,
    [assetId, dateOnly, assetId, dateOnly]
  );
  if (!row) return null;
  return { price: row.price, source: row.source, obs_date: row.obs_date, kind: row.kind };
}

export async function getEffectivePriceAsOf(assetId: string, dateOnly: string): Promise<EffectPricePoint | null> {
  return effectivePriceRow(assetId, dateOnly);
}

// Roll forward the yield-program mark for every asset with an anchor, through `asOf`.
export async function ensureAssetMarks(asOfDate?: string): Promise<void> {
  const asOf = asOfDate ?? todayDateOnly();
  const rate = await getDailyYieldRate();
  if (rate <= 0) return;

  const db = await getDb();
  const assetIds = await db.all<{ asset_id: string }>(
    `SELECT asset_id FROM (
       SELECT asset_id FROM price_observations WHERE obs_date <= $1
       UNION SELECT asset_id FROM yield_marks WHERE mark_date <= $2
     )`,
    [asOf, asOf]
  );

  for (const { asset_id } of assetIds) {
    const anchor = await db.get<{ maxd: string | null }>(
      `SELECT MAX(d) AS maxd FROM (
         SELECT obs_date AS d FROM price_observations WHERE asset_id = $1 AND obs_date <= $2
         UNION SELECT mark_date AS d FROM yield_marks WHERE asset_id = $3 AND mark_date <= $4
       )`,
      [asset_id, asOf, asset_id, asOf]
    );

    if (!anchor || !anchor.maxd) continue;
    const start = addDays(anchor.maxd, 1);
    if (dayDiff(asOf, start) > 0) continue;

    for (let d = start; dayDiff(d, asOf) >= 0; d = addDays(d, 1)) {
      const prev = await effectivePriceRow(asset_id, addDays(d, -1));
      if (!prev || prev.price <= 0) continue;
      await db.run(
        `INSERT INTO yield_marks (id, asset_id, mark_date, price, rate, source, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (asset_id, mark_date) DO NOTHING`,
        [randomUUID(), asset_id, d, prev.price * (1 + rate), rate, markSource(rate), new Date().toISOString()]
      );
    }
  }
}

async function rawCashAsOf(userId: string, endOfDayIso: string): Promise<number> {
  const db = await getDb();
  const row = await db.get<{ c: number }>(
    `SELECT COALESCE(SUM(${cashCaseSql('')}), 0) AS c
     FROM ledger WHERE user_id = $1 AND created_at <= $2`,
    [userId, endOfDayIso]
  );
  return row?.c ?? 0;
}

// Credit the daily cash-side yield rows (rate × prior-day cash) through `asOf`.
export async function ensureDailyYield(userId: string, asOfDate?: string): Promise<void> {
  const asOf = asOfDate ?? todayDateOnly();
  const rate = await getDailyYieldRate();
  if (rate <= 0) return;

  const db = await getDb();
  await ensureAssetMarks(asOf);

  const firstCash = await db.get<{ t: string | null }>(
    `SELECT MIN(created_at) AS t FROM ledger
     WHERE user_id = $1 AND status = 'posted'
       AND ((kind = 'deposit' AND amount > 0) OR (kind = 'adjustment' AND amount > 0) OR kind = 'yield')`,
    [userId]
  );
  if (!firstCash || !firstCash.t) return;

  const lastRow = await db.get<{ last_d: string | null }>(
    `SELECT MAX(meta::jsonb ->> 'accrued_date') AS last_d FROM ledger
     WHERE user_id = $1 AND kind = 'yield'`,
    [userId]
  );

  let start = dateOnlyFromIso(firstCash.t);
  if (lastRow && lastRow.last_d) {
    const afterLast = addDays(lastRow.last_d, 1);
    if (dayDiff(afterLast, start) > 0) start = afterLast;
  }
  if (dayDiff(asOf, start) > 0) return;

  for (let d = start; dayDiff(d, asOf) >= 0; d = addDays(d, 1)) {
    const base = await rawCashAsOf(userId, endOfDayIso(addDays(d, -1)));
    if (base <= 0) continue;
    const amount = round2(base * rate);
    if (amount <= 0) continue;

    const dup = await db.get<{ x: number }>(
      `SELECT 1 AS x FROM ledger
       WHERE user_id = $1 AND kind = 'yield' AND (meta::jsonb ->> 'accrued_date') = $2`,
      [userId, d]
    );
    if (dup) continue;

    await db.run(
      `INSERT INTO ledger
         (user_id, kind, amount, status, note, asset_id, units, meta, created_at, resolved_at, resolved_by)
       VALUES ($1, 'yield', $2, 'posted', $3, NULL, NULL, $4, $5, $6, NULL)`,
      [
        userId,
        amount,
        `Daily yield · ${(rate * 100).toFixed(2)}% on cash`,
        JSON.stringify({ accrued_date: d, rate, base_cash: base }),
        `${d}T00:00:00.000Z`,
        `${d}T00:00:00.000Z`,
      ]
    );
  }
}

export interface YieldStats {
  rate: number;
  lastAccrued: string | null;
  rows: number;
  totalCredited: number;
}

export async function getYieldStats(): Promise<YieldStats> {
  const db = await getDb();
  const acc = await db.get<{ rows: number; total: number; last: string | null }>(
    `SELECT COUNT(*)::int AS rows,
            COALESCE(SUM(amount), 0) AS total,
            MAX(meta::jsonb ->> 'accrued_date') AS last
     FROM ledger WHERE kind = 'yield' AND status = 'posted'`
  );
  return {
    rate: await getDailyYieldRate(),
    lastAccrued: acc?.last ?? null,
    rows: acc?.rows ?? 0,
    totalCredited: round2(acc?.total ?? 0),
  };
}