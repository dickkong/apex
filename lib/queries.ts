import { getDb, cashCaseSql, type DepositMethodRow, type LedgerRow, type UserRow } from './db';
import { getCashBalance, getNetDeposits } from './portfolio';

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface LedgerView extends LedgerRow {
  user_name: string;
  user_email: string;
  asset_name: string | null;
  cash_effect: number;
}

const LEDGER_SELECT = `
  SELECT l.*, u.name AS user_name, u.email AS user_email,
         a.name AS asset_name,
         ${cashCaseSql('l.')} AS cash_effect
  FROM ledger l
  JOIN users u ON u.id = l.user_id
  LEFT JOIN assets a ON a.id = l.asset_id
`;

export function getRecentLedger(userId: string, limit = 8): LedgerView[] {
  const db = getDb();
  return db
    .prepare(`${LEDGER_SELECT} WHERE l.user_id = ? ORDER BY l.id DESC LIMIT ?`)
    .all(userId, limit) as unknown as LedgerView[];
}

export function getAllLedger(): LedgerView[] {
  const db = getDb();
  const rows = db.prepare(`${LEDGER_SELECT} ORDER BY l.id DESC`).all() as unknown as LedgerView[];
  return rows.map((r) => ({ ...r }));
}

export function getLedgerByKind(kind: 'deposit' | 'withdraw', status: 'pending' | 'posted'): LedgerView[] {
  const db = getDb();
  return db
    .prepare(`${LEDGER_SELECT} WHERE l.kind = ? AND l.status = ? ORDER BY l.id DESC`)
    .all(kind, status) as unknown as LedgerView[];
}

export { parseLedgerMeta } from './ledger-meta';
export type { LedgerMeta } from './ledger-meta';

export interface DepositMethodView extends DepositMethodRow {
  asset_name: string;
  asset_ticker: string | null;
}

export function getDepositMethods(onlyEnabled = false): DepositMethodView[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT dm.*, a.name AS asset_name, a.ticker AS asset_ticker
       FROM deposit_methods dm
       JOIN assets a ON a.id = dm.asset_id
       WHERE (? = 0 OR dm.enabled = 1)
       ORDER BY dm.symbol`
    )
    .all(onlyEnabled ? 1 : 0) as unknown as Array<Record<string, unknown>>;
  return rows.map((r) => ({ ...r }) as unknown as DepositMethodView);
}

export interface AssetView {
  id: string;
  name: string;
  ticker: string | null;
  category: string;
  isin: string | null;
  currency: string;
  description: string | null;
  created_at: string;
  price: number | null;
  price_date: string | null;
  price_source: string | null;
  obs_count: number;
}

export function getAssetsWithPrice(): AssetView[] {
  const db = getDb();
  const today = todayDateOnly();
  return db
    .prepare(
      `SELECT a.*,
         (SELECT p.price FROM price_observations p
           WHERE p.asset_id = a.id AND p.obs_date <= ? ORDER BY p.obs_date DESC, p.created_at DESC LIMIT 1) AS price,
         (SELECT p.obs_date FROM price_observations p
           WHERE p.asset_id = a.id AND p.obs_date <= ? ORDER BY p.obs_date DESC, p.created_at DESC LIMIT 1) AS price_date,
         (SELECT p.source FROM price_observations p
           WHERE p.asset_id = a.id AND p.obs_date <= ? ORDER BY p.obs_date DESC, p.created_at DESC LIMIT 1) AS price_source,
         (SELECT COUNT(*) FROM price_observations p WHERE p.asset_id = a.id) AS obs_count
       FROM assets a ORDER BY a.name`
    )
    .all(today, today, today) as unknown as AssetView[];
}

export interface PriceHistoryRow {
  obs_date: string;
  price: number;
  source: string;
  created_at: string;
}

export function getPriceHistory(assetId: string, limit = 12): PriceHistoryRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT obs_date, price, source, created_at FROM price_observations
       WHERE asset_id = ? ORDER BY obs_date DESC, created_at DESC LIMIT ?`
    )
    .all(assetId, limit) as unknown as PriceHistoryRow[];
}

export interface PendingUser extends UserRow {
  _unused?: never;
}

export function getPendingUsers(): UserRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM users WHERE status = 'pending' ORDER BY created_at`)
    .all() as unknown as UserRow[];
}

export interface UserBalanceRow {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  verified_at: string | null;
  created_at: string;
  withdraw_address: string | null;
  cash: number;
  net_deposits: number;
}

export function getUsersWithBalances(): UserBalanceRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, email, name, role, status, verified_at, created_at, withdraw_address FROM users ORDER BY created_at`
    )
    .all() as unknown as Pick<
      UserBalanceRow,
      'id' | 'email' | 'name' | 'role' | 'status' | 'verified_at' | 'created_at' | 'withdraw_address'
    >[];
  return rows.map((r) => ({
    ...r,
    cash: getCashBalance(r.id),
    net_deposits: getNetDeposits(r.id),
  }));
}