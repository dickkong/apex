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

export async function getCashBalance(userId: string): Promise<number> {
  await ensureDailyYield(userId);
  const db = await getDb();
  const row = await db.get<{ cash: number }>(
    `SELECT COALESCE(SUM(${CASH_CASE}), 0) AS cash FROM ledger WHERE user_id = $1`,
    [userId]
  );
  return round2(row?.cash ?? 0);
}

export async function getCashAsOf(userId: string, endOfDayIso: string): Promise<number> {
  const db = await getDb();
  const row = await db.get<{ cash: number }>(
    `SELECT COALESCE(SUM(${CASH_CASE}), 0) AS cash FROM ledger WHERE user_id = $1 AND created_at <= $2`,
    [userId, endOfDayIso]
  );
  return round2(row?.cash ?? 0);
}

export async function getUnitsAsOf(assetId: string, endOfDayIso: string): Promise<number> {
  const db = await getDb();
  const row = await db.get<{ u: number }>(
    `SELECT COALESCE(SUM(CASE
        WHEN kind = 'buy'  AND status = 'posted' THEN units
        WHEN kind = 'sell' AND status = 'posted' THEN -units
        ELSE 0 END), 0) AS u
     FROM ledger WHERE asset_id = $1 AND created_at <= $2`,
    [assetId, endOfDayIso]
  );
  return row?.u ?? 0;
}

export async function getPriceAsOf(assetId: string, dateOnly: string): Promise<PricePoint | null> {
  const db = await getDb();
  const row = await db.get<{ price: number; source: string; obs_date: string }>(
    `SELECT price, source, obs_date FROM price_observations
     WHERE asset_id = $1 AND obs_date <= $2
     ORDER BY obs_date DESC, created_at DESC LIMIT 1`,
    [assetId, dateOnly]
  );
  if (!row) return null;
  return { price: row.price, source: row.source, obs_date: row.obs_date };
}

export async function getNetDeposits(userId: string): Promise<number> {
  const db = await getDb();
  const row = await db.get<{ net: number }>(
    `SELECT COALESCE(SUM(CASE
        WHEN kind = 'deposit'  AND status = 'posted' THEN amount
        WHEN kind = 'withdraw' AND status = 'posted' THEN -amount
        ELSE 0 END), 0) AS net FROM ledger WHERE user_id = $1`,
    [userId]
  );
  return round2(row?.net ?? 0);
}

export async function getRealizedPnl(userId: string): Promise<number> {
  const db = await getDb();
  const row = await db.get<{ pnl: number }>(
    `SELECT COALESCE(SUM((meta::jsonb ->> 'realized_pnl')::float8), 0) AS pnl
     FROM ledger WHERE user_id = $1 AND kind = 'sell' AND status = 'posted'`,
    [userId]
  );
  return round2(row?.pnl ?? 0);
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function endOfDayIso(dateOnly: string): string {
  return `${dateOnly}T23:59:59.999Z`;
}

export async function getHoldings(userId: string): Promise<HoldingView[]> {
  await ensureDailyYield(userId);
  const db = await getDb();
  const rows = await db.all<HoldingRow & { name: string; ticker: string | null; category: string; currency: string }>(
    `SELECT h.*, a.name, a.ticker, a.category, a.currency
     FROM holdings h JOIN assets a ON a.id = h.asset_id
     WHERE h.user_id = $1 ORDER BY a.name`,
    [userId]
  );

  const today = todayDateOnly();
  const views = await Promise.all(
    rows.map(async (r) => {
      const pricePoint = await getEffectivePriceAsOf(r.asset_id, today);
      const price = pricePoint ? pricePoint.price : null;
      const market_value = price !== null ? round2(r.units * price) : 0;
      const cost_value = round2(r.units * r.avg_cost);
      const unrealized = round2(market_value - cost_value);
      const view: HoldingView = {
        ...r,
        price,
        price_source: pricePoint?.source ?? null,
        price_date: pricePoint?.obs_date ?? null,
        market_value,
        cost_value,
        unrealized,
        unrealized_pct: cost_value > 0 ? unrealized / cost_value : null,
      };
      return view;
    })
  );
  return views;
}

export async function getSummary(userId: string): Promise<Summary> {
  const [holdings, cash, netDeposits, realized] = await Promise.all([
    getHoldings(userId),
    getCashBalance(userId),
    getNetDeposits(userId),
    getRealizedPnl(userId),
  ]);
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

export async function getSeries(userId: string): Promise<SeriesPoint[]> {
  await ensureDailyYield(userId);
  const db = await getDb();

  const assetRows = await db.all<{ id: string }>(
    `SELECT DISTINCT asset_id AS id FROM holdings WHERE user_id = $1`,
    [userId]
  );
  const assetIds = assetRows.map((r) => r.id);

  const timeRows = await db.all<{ t: string }>(
    `SELECT created_at AS t FROM ledger
     WHERE user_id = $1 AND status = 'posted'
     UNION SELECT obs_date FROM price_observations`,
    [userId]
  );

  const today = todayDateOnly();
  const startCandidates = timeRows.map((r) => r.t.slice(0, 10)).filter((d) => d <= today);
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

    const cash = await getCashAsOf(userId, eod);
    let invested = 0;
    for (const assetId of assetIds) {
      const units = await getUnitsAsOf(assetId, eod);
      if (units === 0) continue;
      const pricePoint = await getEffectivePriceAsOf(assetId, dateOnly);
      if (pricePoint) invested += units * pricePoint.price;
    }
    points.push({ date: dateOnly, value: round2(cash + invested), cash, invested: round2(invested) });
  }

  return points;
}