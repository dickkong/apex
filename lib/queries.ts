import { getDb, cashCaseSql, type DepositMethodRow, type LedgerRow, type TicketReplyRow, type TicketRow, type UserRow } from './db';
import { getCashBalance, getNetDeposits } from './portfolio';

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getFirstDepositDate(userId: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.get<{ d: string | null }>(
    `SELECT MIN(created_at) AS d FROM ledger
     WHERE user_id = $1 AND kind = 'deposit' AND status = 'posted'`,
    [userId]
  );
  return row?.d ?? null;
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

export async function getRecentLedger(userId: string, limit = 8): Promise<LedgerView[]> {
  const db = await getDb();
  return db.all<LedgerView>(`${LEDGER_SELECT} WHERE l.user_id = $1 ORDER BY l.id DESC LIMIT $2`, [userId, limit]);
}

export async function getAllLedger(): Promise<LedgerView[]> {
  const db = await getDb();
  const rows = await db.all<LedgerView>(`${LEDGER_SELECT} ORDER BY l.id DESC`);
  return rows.map((r) => ({ ...r }));
}

export async function getLedgerByKind(kind: 'deposit' | 'withdraw', status: 'pending' | 'posted'): Promise<
  LedgerView[]
> {
  const db = await getDb();
  return db.all<LedgerView>(`${LEDGER_SELECT} WHERE l.kind = $1 AND l.status = $2 ORDER BY l.id DESC`, [kind, status]);
}

export { parseLedgerMeta } from './ledger-meta';
export type { LedgerMeta } from './ledger-meta';

export interface DepositMethodView extends DepositMethodRow {
  asset_name: string;
  asset_ticker: string | null;
  asset_price: number | null;
}

export async function getDepositMethods(onlyEnabled = false): Promise<DepositMethodView[]> {
  const db = await getDb();
  const today = todayDateOnly();
  const rows = await db.all<Record<string, unknown>>(
    `SELECT dm.*, a.name AS asset_name, a.ticker AS asset_ticker,
       (SELECT p.price FROM price_observations p
         WHERE p.asset_id = a.id AND p.obs_date <= $1
         ORDER BY p.obs_date DESC, p.created_at DESC LIMIT 1) AS asset_price
     FROM deposit_methods dm
     JOIN assets a ON a.id = dm.asset_id
     WHERE ($2 = 0 OR dm.enabled = 1)
     ORDER BY dm.symbol`,
    [today, onlyEnabled ? 1 : 0]
  );
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

export async function getAssetsWithPrice(): Promise<AssetView[]> {
  const db = await getDb();
  const today = todayDateOnly();
  return db.all<AssetView>(
    `SELECT a.*,
       (SELECT p.price FROM price_observations p
         WHERE p.asset_id = a.id AND p.obs_date <= $1 ORDER BY p.obs_date DESC, p.created_at DESC LIMIT 1) AS price,
       (SELECT p.obs_date FROM price_observations p
         WHERE p.asset_id = a.id AND p.obs_date <= $1 ORDER BY p.obs_date DESC, p.created_at DESC LIMIT 1) AS price_date,
       (SELECT p.source FROM price_observations p
         WHERE p.asset_id = a.id AND p.obs_date <= $1 ORDER BY p.obs_date DESC, p.created_at DESC LIMIT 1) AS price_source,
       (SELECT COUNT(*)::int FROM price_observations p WHERE p.asset_id = a.id) AS obs_count
     FROM assets a ORDER BY a.name`,
    [today]
  );
}

export interface PriceHistoryRow {
  obs_date: string;
  price: number;
  source: string;
  created_at: string;
}

export async function getPriceHistory(assetId: string, limit = 12): Promise<PriceHistoryRow[]> {
  const db = await getDb();
  return db.all<PriceHistoryRow>(
    `SELECT obs_date, price, source, created_at FROM price_observations
     WHERE asset_id = $1 ORDER BY obs_date DESC, created_at DESC LIMIT $2`,
    [assetId, limit]
  );
}

export async function getPendingUsers(): Promise<UserRow[]> {
  const db = await getDb();
  return db.all<UserRow>(`SELECT * FROM users WHERE status = 'pending' ORDER BY created_at`);
}

export interface UserBalanceRow {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  verified_at: string | null;
  created_at: string;
  first_deposit_at: string | null;
  withdraw_address: string | null;
  cash: number;
  net_deposits: number;
}

export async function getUsersWithBalances(): Promise<UserBalanceRow[]> {
  const db = await getDb();
  const rows = await db.all<
    Pick<
      UserBalanceRow,
      | 'id'
      | 'email'
      | 'name'
      | 'role'
      | 'status'
      | 'verified_at'
      | 'created_at'
      | 'first_deposit_at'
      | 'withdraw_address'
    >
  >(
    `SELECT u.id, u.email, u.name, u.role, u.status, u.verified_at, u.created_at, u.withdraw_address,
            (SELECT MIN(l.created_at) FROM ledger l
             WHERE l.user_id = u.id AND l.kind = 'deposit' AND l.status = 'posted') AS first_deposit_at
     FROM users u
     ORDER BY u.created_at`
  );

  return Promise.all(
    rows.map(async (r) => {
      const [cash, net_deposits] = await Promise.all([getCashBalance(r.id), getNetDeposits(r.id)]);
      return { ...r, cash, net_deposits };
    })
  );
}

export interface TicketView extends TicketRow {
  user_name: string;
  user_email: string;
  user_status: string;
  reply_count: number;
  last_reply_at: string;
  last_message: string | null;
}

export interface TicketReplyView extends TicketReplyRow {
  author_name: string;
  author_email: string;
}

const TICKET_SELECT = `
  SELECT t.*, u.name AS user_name, u.email AS user_email, u.status AS user_status,
         COALESCE(rc.reply_count, 0) AS reply_count,
         COALESCE(lr.last_reply_at, t.created_at) AS last_reply_at,
         lr.last_message AS last_message
  FROM tickets t
  JOIN users u ON u.id = t.user_id
  LEFT JOIN (SELECT ticket_id, COUNT(*)::int AS reply_count
             FROM ticket_replies GROUP BY ticket_id) rc ON rc.ticket_id = t.id
  LEFT JOIN (SELECT ticket_id,
                    MAX(created_at) AS last_reply_at,
                    (SELECT message FROM ticket_replies r2
                     WHERE r2.ticket_id = r1.ticket_id
                     ORDER BY r2.created_at DESC LIMIT 1) AS last_message
             FROM ticket_replies r1 GROUP BY ticket_id) lr ON lr.ticket_id = t.id
`;

export async function getTicketsForUser(userId: string): Promise<TicketView[]> {
  const db = await getDb();
  return db.all<TicketView>(`${TICKET_SELECT} WHERE t.user_id = $1 ORDER BY t.updated_at DESC`, [
    userId,
  ]);
}

export async function getAllTickets(): Promise<TicketView[]> {
  const db = await getDb();
  return db.all<TicketView>(
    `${TICKET_SELECT} ORDER BY CASE WHEN t.status = 'open' THEN 0 ELSE 1 END, t.updated_at DESC`
  );
}

export async function getTicketReplies(ticketId: string): Promise<TicketReplyView[]> {
  const db = await getDb();
  return db.all<TicketReplyView>(
    `SELECT r.*, u.name AS author_name, u.email AS author_email
     FROM ticket_replies r
     JOIN users u ON u.id = r.author_id
     WHERE r.ticket_id = $1
     ORDER BY r.created_at ASC`,
    [ticketId]
  );
}