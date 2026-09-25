import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { hashPassword } from './password';

export const DATA_DIR = path.join(process.cwd(), 'data');
export const DB_PATH = path.join(DATA_DIR, 'apexyield.db');
const SECRET_PATH = path.join(DATA_DIR, '.secret');
const CREDENTIALS_PATH = path.join(DATA_DIR, 'admin-credentials.txt');

const INIT_LOCK = 900001001;

export type UserRole = 'investor' | 'admin';
export type UserStatus = 'pending' | 'verified' | 'rejected';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  password_hash: string;
  salt: string;
  created_at: string;
  verified_at: string | null;
  email_verified_at: string | null;
  withdraw_address: string | null;
}

export interface AssetRow {
  id: string;
  name: string;
  ticker: string | null;
  category: string;
  isin: string | null;
  currency: string;
  description: string | null;
  created_at: string;
}

export interface PriceRow {
  id: string;
  asset_id: string;
  obs_date: string;
  price: number;
  source: string;
  created_at: string;
}

export interface HoldingRow {
  id: string;
  user_id: string;
  asset_id: string;
  units: number;
  avg_cost: number;
  created_at: string;
}

export type LedgerKind = 'deposit' | 'withdraw' | 'buy' | 'sell' | 'adjustment' | 'yield';
export type LedgerStatus = 'pending' | 'verified' | 'posted' | 'rejected';

export function cashCaseSql(alias = ''): string {
  const a = alias;
  return `CASE
    WHEN ${a}kind = 'deposit'   AND ${a}status = 'posted' THEN ${a}amount
    WHEN ${a}kind = 'withdraw'  AND ${a}status = 'posted' THEN -${a}amount
    WHEN ${a}kind = 'buy'       AND ${a}status = 'posted' THEN -${a}amount
    WHEN ${a}kind = 'sell'      AND ${a}status = 'posted' THEN ${a}amount
    WHEN ${a}kind = 'adjustment' AND ${a}status = 'posted' THEN ${a}amount
    WHEN ${a}kind = 'yield'     AND ${a}status = 'posted' THEN ${a}amount
    ELSE 0
  END`;
}

export interface LedgerRow {
  id: number;
  user_id: string;
  kind: LedgerKind;
  amount: number;
  status: LedgerStatus;
  note: string | null;
  asset_id: string | null;
  units: number | null;
  meta: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface DepositMethodRow {
  id: string;
  symbol: string;
  name: string;
  asset_id: string;
  wallet_address: string;
  network: string;
  instructions: string | null;
  enabled: number;
  created_at: string;
}

export type TicketStatus = 'open' | 'closed';

export interface TicketRow {
  id: string;
  user_id: string;
  subject: string;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface TicketReplyRow {
  id: string;
  ticket_id: string;
  author_id: string;
  author_type: 'user' | 'admin';
  message: string;
  created_at: string;
}

export type SqlValue = string | number | null | boolean;

// Small async facade over a pg Pool or a transactional PoolClient, mirroring the
// synchronous node:sqlite calls (`get` / `all` / `run`) the rest of the app uses.
export class PgRunner {
  constructor(private readonly conn: Pool | PoolClient) {}

  async get<T extends QueryResultRow = Record<string, unknown>>(
    sql: string,
    params: SqlValue[] = []
  ): Promise<T | undefined> {
    const { rows } = await this.conn.query<T>(sql, params);
    return rows[0];
  }

  async all<T extends QueryResultRow = Record<string, unknown>>(
    sql: string,
    params: SqlValue[] = []
  ): Promise<T[]> {
    const { rows } = await this.conn.query<T>(sql, params);
    return rows;
  }

  async run(sql: string, params: SqlValue[] = []): Promise<number> {
    const result = await this.conn.query(sql, params);
    return result.rowCount ?? 0;
  }
}

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL must be set to the Supabase Postgres connection string.');
    pool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 10,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    email           TEXT NOT NULL,
    name            TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'investor',
    status          TEXT NOT NULL DEFAULT 'pending',
    password_hash   TEXT NOT NULL,
    salt            TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    verified_at     TEXT,
    email_verified_at TEXT,
    withdraw_address TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email ON users (LOWER(email));

  CREATE TABLE IF NOT EXISTS assets (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    ticker      TEXT,
    category    TEXT NOT NULL DEFAULT 'fund',
    isin        TEXT,
    currency    TEXT NOT NULL DEFAULT 'USD',
    description TEXT,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS price_observations (
    id         TEXT PRIMARY KEY,
    asset_id   TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    obs_date   TEXT NOT NULL,
    price      DOUBLE PRECISION NOT NULL,
    source     TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(asset_id, obs_date)
  );

  CREATE TABLE IF NOT EXISTS holdings (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asset_id   TEXT NOT NULL REFERENCES assets(id),
    units      DOUBLE PRECISION NOT NULL,
    avg_cost   DOUBLE PRECISION NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, asset_id)
  );

  CREATE TABLE IF NOT EXISTS ledger (
    id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    kind        TEXT NOT NULL,
    amount      DOUBLE PRECISION NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    note        TEXT,
    asset_id    TEXT,
    units       DOUBLE PRECISION,
    meta        TEXT,
    created_at  TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by TEXT
  );

  CREATE TABLE IF NOT EXISTS deposit_methods (
    id             TEXT PRIMARY KEY,
    symbol         TEXT NOT NULL,
    name           TEXT NOT NULL,
    asset_id       TEXT NOT NULL REFERENCES assets(id),
    wallet_address TEXT NOT NULL DEFAULT '',
    network        TEXT NOT NULL DEFAULT '',
    instructions   TEXT,
    enabled        INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS yield_marks (
    id         TEXT PRIMARY KEY,
    asset_id   TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    mark_date  TEXT NOT NULL,
    price      DOUBLE PRECISION NOT NULL,
    rate       DOUBLE PRECISION NOT NULL,
    source     TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(asset_id, mark_date)
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id),
    subject    TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    closed_at  TEXT
  );

  CREATE TABLE IF NOT EXISTS ticket_replies (
    id          TEXT PRIMARY KEY,
    ticket_id   TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    author_id   TEXT NOT NULL REFERENCES users(id),
    author_type TEXT NOT NULL DEFAULT 'user',
    message     TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_ledger_user     ON ledger(user_id);
  CREATE INDEX IF NOT EXISTS idx_ledger_status   ON ledger(status);
  CREATE INDEX IF NOT EXISTS idx_prices_asset    ON price_observations(asset_id, obs_date);
  CREATE INDEX IF NOT EXISTS idx_holdings_user   ON holdings(user_id);
  CREATE INDEX IF NOT EXISTS idx_methods_enabled ON deposit_methods(enabled);
  CREATE INDEX IF NOT EXISTS idx_marks_asset     ON yield_marks(asset_id, mark_date);
  CREATE INDEX IF NOT EXISTS idx_tickets_user   ON tickets(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_replies_ticket ON ticket_replies(ticket_id, created_at);
`;

function ensureSessionSecret(): string {
  if (existsSync(SECRET_PATH)) {
    return readFileSync(SECRET_PATH, 'utf8').trim();
  }
  mkdirSync(DATA_DIR, { recursive: true });
  const secret = randomBytes(32).toString('hex');
  writeFileSync(SECRET_PATH, secret, { encoding: 'utf8', flag: 'wx' });
  return secret;
}

const envSecret = process.env.APEX_SESSION_SECRET?.trim();
export const sessionSecret: string = envSecret && envSecret.length >= 32 ? envSecret : ensureSessionSecret();

async function syncLedgerSequence(db: PgRunner) {
  // ledger.id is IDENTITY GENERATED BY DEFAULT; rows copied from SQLite keep
  // their original ids, so the identity sequence can lag behind MAX(id) and new
  // inserts would collide. Re-anchor the sequence to the highest row every boot.
  await db.run(
    `SELECT setval(pg_get_serial_sequence('ledger','id'),
                   GREATEST((SELECT COALESCE(MAX(id),0) FROM ledger), 1),
                   true)`
  );
}

async function migrate(db: PgRunner) {
  await db.run(SCHEMA_SQL);
  await db.run(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TEXT`
  );
  await db.run(
    `UPDATE users
     SET email_verified_at = COALESCE(email_verified_at, verified_at, created_at)
     WHERE email_verified_at IS NULL`
  );
  await db.run(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`, [
    'daily_yield_rate',
    '0.009',
  ]);
  await syncLedgerSequence(db);
}

async function seed(db: PgRunner) {
  const row = await db.get<{ c: number }>(`SELECT COUNT(*)::int AS c FROM users`);
  if (!row || row.c > 0) return;

  const email = (process.env.APEX_ADMIN_EMAIL ?? 'admin@apexyield.local').trim();
  const password =
    process.env.APEX_ADMIN_PASSWORD ?? randomBytes(6).toString('hex').toUpperCase().replace(/-/g, '');

  const { salt, hash } = hashPassword(password);
  const now = new Date().toISOString();
  const id = randomUUID();

  await db.run(
    `INSERT INTO users (id, email, name, role, status, password_hash, salt, created_at, verified_at, email_verified_at)
     VALUES ($1, $2, $3, 'admin', 'verified', $4, $5, $6, $7, $7)`,
    [id, email, 'Oversight Manager', hash, salt, now, now]
  );

  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(
      CREDENTIALS_PATH,
      `ApexYield admin sign-in (first-run bootstrap)\nemail:    ${email}\npassword: ${password}\n\nDelete this file and data/apexyield.db to reset.\n`,
      { encoding: 'utf8' }
    );
  } catch {
    // non-fatal: credentials are also printed below
  }

  console.log('\n[ApexYield] Seeded first admin account:');
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log(`  See ${CREDENTIALS_PATH}`);
  console.log('[ApexYield] All other accounts start unverified and must be approved by an admin.\n');
}

async function seedStablecoinChannels(db: PgRunner) {
  const channels: Array<{ symbol: string; name: string; network: string; instructions: string }> = [
    {
      symbol: 'USDT',
      name: 'Tether USD',
      network: 'Ethereum (ERC-20)',
      instructions:
        'Send USDT on the Ethereum network only. Use the wallet address shown at deposit time, and include your registered name/email in the memo.',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      network: 'Ethereum (ERC-20)',
      instructions:
        'Send USDC on the Ethereum network only. Use the wallet address shown at deposit time, and include your registered name/email in the memo.',
    },
  ];

  for (const c of channels) {
    const existing = await db.get<{ id: string }>(`SELECT id FROM assets WHERE LOWER(ticker) = LOWER($1)`, [
      c.symbol,
    ]);

    let assetId: string;
    if (existing) {
      assetId = existing.id;
    } else {
      assetId = randomUUID();
      await db.run(
        `INSERT INTO assets (id, name, ticker, category, isin, currency, description, created_at)
         VALUES ($1, $2, $3, 'stablecoin', NULL, 'USD', $4, $5)`,
        [assetId, c.name, c.symbol, 'USD-pegged stablecoin accepted for deposits.', new Date().toISOString()]
      );
    }

    const method = await db.get<{ id: string }>(`SELECT id FROM deposit_methods WHERE LOWER(symbol) = LOWER($1)`, [
      c.symbol,
    ]);
    if (!method) {
      await db.run(
        `INSERT INTO deposit_methods (id, symbol, name, asset_id, wallet_address, network, instructions, enabled, created_at)
         VALUES ($1, $2, $3, $4, '', $5, $6, 1, $7)`,
        [randomUUID(), c.symbol, c.name, assetId, c.network, c.instructions, new Date().toISOString()]
      );
    }
  }
}

// One-shot data migration: when a local SQLite database exists and the Postgres
// database is still empty, copy every row across (preserving ids and timestamps).
async function migrateFromSqliteIfEmpty(db: PgRunner) {
  if (!existsSync(DB_PATH)) return;
  const count = await db.get<{ c: number }>(`SELECT COUNT(*)::int AS c FROM users`);
  if (!count || count.c > 0) return;

  console.log('[ApexYield] Migrating existing rows from data/apexyield.db into Supabase Postgres…');
  const src = new DatabaseSync(DB_PATH);
  try {
    const tables = [
      'users',
      'assets',
      'price_observations',
      'holdings',
      'ledger',
      'deposit_methods',
      'settings',
      'yield_marks',
    ];
    for (const table of tables) {
      const rows = src.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
      if (rows.length === 0) continue;
      const columns = Object.keys(rows[0]);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
      for (const r of rows) {
        const params = columns.map((col) => {
          const v = r[col];
          return v === null || v === undefined ? null : (v as SqlValue);
        });
        await db.run(sql, params);
      }
      console.log(`  copied ${rows.length} row${rows.length === 1 ? '' : 's'} from ${table}`);
    }
    await db.run(
      `UPDATE users
       SET email_verified_at = COALESCE(email_verified_at, verified_at, created_at)
       WHERE email_verified_at IS NULL`
    );
    await syncLedgerSequence(db);
    console.log('[ApexYield] SQLite → Supabase migration complete.');
  } finally {
    src.close();
  }
}

let runner: PgRunner | null = null;
let initPromise: Promise<PgRunner> | null = null;

async function initDb(): Promise<PgRunner> {
  const connection = await getPool().connect();
  const cdb = new PgRunner(connection);
  try {
    await cdb.run(`SELECT pg_advisory_lock($1)`, [INIT_LOCK]);
    await migrate(cdb);
    await migrateFromSqliteIfEmpty(cdb);
    await seed(cdb);
    await seedStablecoinChannels(cdb);
    await cdb.run(`SELECT pg_advisory_unlock($1)`, [INIT_LOCK]);
  } catch (err) {
    await cdb.run(`SELECT pg_advisory_unlock($1)`, [INIT_LOCK]).catch(() => {});
    throw err;
  } finally {
    connection.release();
  }
  return new PgRunner(getPool());
}

export function getDb(): Promise<PgRunner> {
  if (runner) return Promise.resolve(runner);
  if (!initPromise) {
    initPromise = initDb()
      .then((r) => {
        runner = r;
        return r;
      })
      .catch((err) => {
        initPromise = null;
        throw err;
      });
  }
  return initPromise;
}