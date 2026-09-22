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

export function getDailyYieldRate(): number {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(YIELD_RATE_KEY) as
    | { value: string }
    | undefined;
  if (!row) return DEFAULT_YIELD_RATE;
  const n = Number(row.value);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_YIELD_RATE;
}

export function setDailyYieldRate(rate: number): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(YIELD_RATE_KEY, String(rate));
}

function markSource(rate: number): string {
  return `model +${(rate * 100).toFixed(2)}%/day`;
}

function effectivePriceRow(assetId: string, dateOnly: string): EffectPricePoint | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT price, source, obs_date, kind FROM (
         SELECT price, source, obs_date, 'real' AS kind FROM price_observations
          WHERE asset_id = ? AND obs_date <= ?
         UNION ALL
         SELECT price, source, mark_date AS obs_date, 'model' AS kind FROM yield_marks
          WHERE asset_id = ? AND mark_date <= ?
       )
       ORDER BY obs_date DESC, CASE kind WHEN 'real' THEN 0 ELSE 1 END ASC
       LIMIT 1`
    )
    .get(assetId, dateOnly, assetId, dateOnly) as
    | { price: number; source: string; obs_date: string; kind: 'real' | 'model' }
    | undefined;
  if (!row) return null;
  return { price: row.price, source: row.source, obs_date: row.obs_date, kind: row.kind };
}

export function getEffectivePriceAsOf(assetId: string, dateOnly: string): EffectPricePoint | null {
  return effectivePriceRow(assetId, dateOnly);
}

// Roll forward the yield-program mark for every asset with an anchor, through `asOf`.
export function ensureAssetMarks(asOfDate?: string): void {
  const asOf = asOfDate ?? todayDateOnly();
  const rate = getDailyYieldRate();
  if (rate <= 0) return;

  const db = getDb();
  const assetIds = db
    .prepare(
      `SELECT asset_id FROM (
         SELECT asset_id FROM price_observations WHERE obs_date <= ?
         UNION SELECT asset_id FROM yield_marks WHERE mark_date <= ?
       )`
    )
    .all(asOf, asOf) as { asset_id: string }[];

  for (const { asset_id } of assetIds) {
    const anchor = db
      .prepare(
        `SELECT MAX(d) AS d FROM (
           SELECT obs_date AS d FROM price_observations WHERE asset_id = ? AND obs_date <= ?
           UNION SELECT mark_date AS d FROM yield_marks WHERE asset_id = ? AND mark_date <= ?
         )`
      )
      .get(asset_id, asOf, asset_id, asOf) as { d: string | null };

    if (!anchor.d) continue;
    const start = addDays(anchor.d, 1);
    if (dayDiff(asOf, start) > 0) continue;

    const insert = db.prepare(
      `INSERT OR IGNORE INTO yield_marks (id, asset_id, mark_date, price, rate, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    for (let d = start; dayDiff(d, asOf) >= 0; d = addDays(d, 1)) {
      const prev = effectivePriceRow(asset_id, addDays(d, -1));
      if (!prev || prev.price <= 0) continue;
      insert.run(randomUUID(), asset_id, d, prev.price * (1 + rate), rate, markSource(rate), new Date().toISOString());
    }
  }
}

function rawCashAsOf(userId: string, endOfDayIso: string): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(${cashCaseSql('')}), 0) AS c
       FROM ledger WHERE user_id = ? AND created_at <= ?`
    )
    .get(userId, endOfDayIso) as { c: number };
  return row.c;
}

// Credit the daily cash-side yield rows (rate × prior-day cash) through `asOf`.
export function ensureDailyYield(userId: string, asOfDate?: string): void {
  const asOf = asOfDate ?? todayDateOnly();
  const rate = getDailyYieldRate();
  if (rate <= 0) return;

  const db = getDb();
  ensureAssetMarks(asOf);

  const firstCash = db
    .prepare(
      `SELECT MIN(created_at) AS t FROM ledger
       WHERE user_id = ? AND status = 'posted'
         AND ((kind = 'deposit' AND amount > 0) OR (kind = 'adjustment' AND amount > 0) OR kind = 'yield')`
    )
    .get(userId) as { t: string | null };
  if (!firstCash.t) return;

  const lastRow = db
    .prepare(
      `SELECT MAX(json_extract(meta, '$.accrued_date')) AS d FROM ledger
       WHERE user_id = ? AND kind = 'yield'`
    )
    .get(userId) as { d: string | null };

  let start = dateOnlyFromIso(firstCash.t);
  if (lastRow.d) {
    const afterLast = addDays(lastRow.d, 1);
    if (dayDiff(afterLast, start) > 0) start = afterLast;
  }
  if (dayDiff(asOf, start) > 0) return;

  const insert = db.prepare(
    `INSERT OR IGNORE INTO ledger
       (user_id, kind, amount, status, note, asset_id, units, meta, created_at, resolved_at, resolved_by)
     VALUES (?, 'yield', ?, 'posted', ?, NULL, NULL, ?, ?, ?, NULL)`
  );

  for (let d = start; dayDiff(d, asOf) >= 0; d = addDays(d, 1)) {
    const base = rawCashAsOf(userId, endOfDayIso(addDays(d, -1)));
    if (base <= 0) continue;
    const amount = round2(base * rate);
    if (amount <= 0) continue;
    insert.run(
      userId,
      amount,
      `Daily yield · ${(rate * 100).toFixed(2)}% on cash`,
      JSON.stringify({ accrued_date: d, rate, base_cash: base }),
      `${d}T00:00:00.000Z`,
      `${d}T00:00:00.000Z`
    );
  }
}

export interface YieldStats {
  rate: number;
  lastAccrued: string | null;
  rows: number;
  totalCredited: number;
}

export function getYieldStats(): YieldStats {
  const db = getDb();
  const acc = db
    .prepare(
      `SELECT COUNT(*) AS rows,
              COALESCE(SUM(amount), 0) AS total,
              MAX(json_extract(meta, '$.accrued_date')) AS last
       FROM ledger WHERE kind = 'yield' AND status = 'posted'`
    )
    .get() as { rows: number; total: number; last: string | null };
  return { rate: getDailyYieldRate(), lastAccrued: acc.last, rows: acc.rows, totalCredited: round2(acc.total) };
}