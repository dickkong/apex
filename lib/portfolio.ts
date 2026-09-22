import { getDb, cashCaseSql, type HoldingRow } from './db';
import { round2 } from './money';
import { ensureDailyYield, getEffectivePriceAsOf } from './yield';

export interface PricePoint {
  price: number;
  source: string | null;
  obs_date: string | null;
}

export interface HoldingView extends HoldingRow {
  name: string;
  ticker: string | null;
  category: string;
  currency: string;
  price: number | null;
  price_source: string | null;
  price_date: string | null;
  market_value: number;
  cost_value: number;
  unrealized: number;
  unrealized_pct: number | null;
}

export interface Summary {
  cash: number;
  netDeposits: number;
  investedCost: number;
  investedValue: number;
  unrealized: number;
  realized: number;
  totalValue: number;
  totalReturn: number;
  totalReturnPct: number | null;
  currency: string;
  holdings: HoldingView[];
}

export interface SeriesPoint {
  date: string;
  value: number;
  cash: number;
  invested: number;
}

const CASH_CASE = cashCaseSql();

export function getCashBalance(userId: string): number {
  ensureDailyYield(userId);
  const db = getDb();
  const row = db
    .prepare(`SELECT COALESCE(SUM(${CASH_CASE}), 0) AS cash FROM ledger WHERE user_id = ?`)
    .get(userId) as { cash: number };
  return round2(row.cash);
}

export function getCashAsOf(userId: string, endOfDayIso: string): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(${CASH_CASE}), 0) AS cash FROM ledger WHERE user_id = ? AND created_at <= ?`
    )
    .get(userId, endOfDayIso) as { cash: number };
  return round2(row.cash);
}

export function getUnitsAsOf(assetId: string, endOfDayIso: string): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(CASE
          WHEN kind = 'buy'  AND status = 'posted' THEN units
          WHEN kind = 'sell' AND status = 'posted' THEN -units
          ELSE 0 END), 0) AS u
       FROM ledger WHERE asset_id = ? AND created_at <= ?`
    )
    .get(assetId, endOfDayIso) as { u: number };
  return row.u;
}

export function getPriceAsOf(assetId: string, dateOnly: string): PricePoint | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT price, source, obs_date FROM price_observations
       WHERE asset_id = ? AND obs_date <= ?
       ORDER BY obs_date DESC, created_at DESC LIMIT 1`
    )
    .get(assetId, dateOnly) as { price: number; source: string; obs_date: string } | undefined;
  if (!row) return null;
  return { price: row.price, source: row.source, obs_date: row.obs_date };
}

export function getNetDeposits(userId: string): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(CASE
          WHEN kind = 'deposit'  AND status = 'posted' THEN amount
          WHEN kind = 'withdraw' AND status = 'posted' THEN -amount
          ELSE 0 END), 0) AS net FROM ledger WHERE user_id = ?`
    )
    .get(userId) as { net: number };
  return round2(row.net);
}

export function getRealizedPnl(userId: string): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(json_extract(meta, '$.realized_pnl')), 0) AS pnl
       FROM ledger WHERE user_id = ? AND kind = 'sell' AND status = 'posted'`
    )
    .get(userId) as { pnl: number };
  return round2(row.pnl);
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function endOfDayIso(dateOnly: string): string {
  return `${dateOnly}T23:59:59.999Z`;
}

export function getHoldings(userId: string): HoldingView[] {
  ensureDailyYield(userId);
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT h.*, a.name, a.ticker, a.category, a.currency
       FROM holdings h JOIN assets a ON a.id = h.asset_id
       WHERE h.user_id = ? ORDER BY a.name`
    )
    .all(userId) as unknown as Array<
    HoldingRow & { name: string; ticker: string | null; category: string; currency: string }
  >;

  const today = todayDateOnly();
  return rows.map((r) => {
    const pricePoint = getEffectivePriceAsOf(r.asset_id, today);
    const price = pricePoint ? pricePoint.price : null;
    const market_value = price !== null ? round2(r.units * price) : 0;
    const cost_value = round2(r.units * r.avg_cost);
    const unrealized = round2(market_value - cost_value);
    return {
      ...r,
      price,
      price_source: pricePoint?.source ?? null,
      price_date: pricePoint?.obs_date ?? null,
      market_value,
      cost_value,
      unrealized,
      unrealized_pct: cost_value > 0 ? unrealized / cost_value : null,
    };
  });
}

export function getSummary(userId: string): Summary {
  const holdings = getHoldings(userId);
  const cash = getCashBalance(userId);
  const netDeposits = getNetDeposits(userId);
  const realized = getRealizedPnl(userId);
  const investedValue = round2(holdings.reduce((s, h) => s + h.market_value, 0));
  const investedCost = round2(holdings.reduce((s, h) => s + h.cost_value, 0));
  const unrealized = round2(holdings.reduce((s, h) => s + h.unrealized, 0));
  const totalValue = round2(cash + investedValue);
  const totalReturn = round2(totalValue - netDeposits);

  return {
    cash,
    netDeposits,
    investedCost,
    investedValue,
    unrealized,
    realized,
    totalValue,
    totalReturn,
    totalReturnPct: netDeposits > 0.005 ? totalReturn / netDeposits : null,
    currency: 'USD',
    holdings,
  };
}

export function getSeries(userId: string): SeriesPoint[] {
  ensureDailyYield(userId);
  const db = getDb();
  const dbLink = getDb();

  const assetIds = (
    dbLink
      .prepare('SELECT DISTINCT asset_id AS id FROM holdings WHERE user_id = ?')
      .all(userId) as { id: string }[]
  ).map((r) => r.id);

  const times = db
    .prepare(
      `SELECT created_at AS t FROM ledger
       WHERE user_id = ? AND status = 'posted'
       UNION SELECT obs_date FROM price_observations`
    )
    .all(userId) as { t: string }[];

  const today = todayDateOnly();
  const startCandidates = times.map((r) => r.t.slice(0, 10)).filter((d) => d <= today);
  if (startCandidates.length === 0) {
    return [{ date: today, value: 0, cash: 0, invested: 0 }];
  }
  startCandidates.sort();
  const start = startCandidates[0];

  const startMs = Date.UTC(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8, 10));
  const endMs = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const days = Math.max(1, Math.round((endMs - startMs) / 86400000));

  const step = days > 180 ? Math.ceil(days / 160) : 1;
  const points: SeriesPoint[] = [];

  for (let offset = 0; offset <= days; offset += step) {
    const ms = startMs + offset * 86400000;
    const iso = new Date(ms).toISOString(); // 'YYYY-MM-DDT00:00:00.000Z'
    const dateOnly = iso.slice(0, 10);
    const eod = endOfDayIso(dateOnly);

    const cash = getCashAsOf(userId, eod);
    let invested = 0;
    for (const assetId of assetIds) {
      const units = getUnitsAsOf(assetId, eod);
      if (units === 0) continue;
      const pricePoint = getEffectivePriceAsOf(assetId, dateOnly);
      if (pricePoint) invested += units * pricePoint.price;
    }
    points.push({ date: dateOnly, value: round2(cash + invested), cash, invested: round2(invested) });
  }

  return points;
}