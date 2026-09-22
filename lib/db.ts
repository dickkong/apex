import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { hashPassword } from './password';

export const DATA_DIR = path.join(process.cwd(), 'data');
export const DB_PATH = path.join(DATA_DIR, 'apexyield.db');
const SECRET_PATH = path.join(DATA_DIR, '.secret');
const CREDENTIALS_PATH = path.join(DATA_DIR, 'admin-credentials.txt');

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

let db: DatabaseSync | null = null;

function ensureSessionSecret(): string {
  if (existsSync(SECRET_PATH)) {
    return readFileSync(SECRET_PATH, 'utf8').trim();
  }
  mkdirSync(DATA_DIR, { recursive: true });
  const secret = randomBytes(32).toString('hex');
  writeFileSync(SECRET_PATH, secret, { encoding: 'utf8', flag: 'wx' });
  return secret;
}

export const sessionSecret = ensureSessionSecret();

function migrate(database: DatabaseSync) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name          TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'investor',
      status        TEXT NOT NULL DEFAULT 'pending',
      password_hash TEXT NOT NULL,
      salt          TEXT NOT NULL,
      created_at    TEXT NOT NULL,
      verified_at   TEXT,
      withdraw_address TEXT
    );

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
      price      REAL NOT NULL,
      source     TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(asset_id, obs_date)
    );

    CREATE TABLE IF NOT EXISTS holdings (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      asset_id   TEXT NOT NULL REFERENCES assets(id),
      units      REAL NOT NULL,
      avg_cost   REAL NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, asset_id)
    );

    CREATE TABLE IF NOT EXISTS ledger (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL REFERENCES users(id),
      kind        TEXT NOT NULL,
      amount      REAL NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending',
      note        TEXT,
      asset_id    TEXT,
      units       REAL,
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
      price      REAL NOT NULL,
      rate       REAL NOT NULL,
      source     TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(asset_id, mark_date)
    );

    CREATE INDEX IF NOT EXISTS idx_ledger_user    ON ledger(user_id);
    CREATE INDEX IF NOT EXISTS idx_ledger_status  ON ledger(status);
    CREATE INDEX IF NOT EXISTS idx_prices_asset   ON price_observations(asset_id, obs_date);
    CREATE INDEX IF NOT EXISTS idx_holdings_user  ON holdings(user_id);
    CREATE INDEX IF NOT EXISTS idx_methods_enabled ON deposit_methods(enabled);
    CREATE INDEX IF NOT EXISTS idx_marks_asset    ON yield_marks(asset_id, mark_date);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_yield_accrued_day
      ON ledger(user_id, json_extract(meta, '$.accrued_date')) WHERE kind = 'yield';
  `);

  const userCols = database.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!userCols.some((c) => c.name === 'withdraw_address')) {
    database.exec('ALTER TABLE users ADD COLUMN withdraw_address TEXT');
  }

  database
    .prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('daily_yield_rate', '0.009')`)
    .run();
}

function seed(database: DatabaseSync) {
  const count = (database.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
  if (count > 0) return;

  const email = (process.env.APEX_ADMIN_EMAIL ?? 'admin@apexyield.local').trim();
  const password =
    process.env.APEX_ADMIN_PASSWORD ?? randomBytes(6).toString('hex').toUpperCase().replace(/-/g, '');

  const { salt, hash } = hashPassword(password);
  const now = new Date().toISOString();
  const id = randomUUID();

  database
    .prepare(
      `INSERT INTO users (id, email, name, role, status, password_hash, salt, created_at, verified_at)
       VALUES (?, ?, ?, 'admin', 'verified', ?, ?, ?, ?)`
    )
    .run(id, email, 'Oversight Manager', hash, salt, now, now);

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

function seedStablecoinChannels(database: DatabaseSync) {
  const channels: Array<{
    symbol: string;
    name: string;
    network: string;
    instructions: string;
  }> = [
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
    const existing = database
      .prepare('SELECT id FROM assets WHERE ticker = ? COLLATE NOCASE')
      .get(c.symbol) as { id: string } | undefined;

    let assetId: string;
    if (existing) {
      assetId = existing.id;
    } else {
      assetId = randomUUID();
      database
        .prepare(
          `INSERT INTO assets (id, name, ticker, category, isin, currency, description, created_at)
           VALUES (?, ?, ?, 'stablecoin', NULL, 'USD', ?, ?)`
        )
        .run(assetId, c.name, c.symbol, `USD-pegged stablecoin accepted for deposits.`, new Date().toISOString());
    }

    const method = database
      .prepare('SELECT id FROM deposit_methods WHERE symbol = ? COLLATE NOCASE')
      .get(c.symbol) as { id: string } | undefined;
    if (!method) {
      database
        .prepare(
          `INSERT INTO deposit_methods (id, symbol, name, asset_id, wallet_address, network, instructions, enabled, created_at)
           VALUES (?, ?, ?, ?, '', ?, ?, 1, ?)`
        )
        .run(randomUUID(), c.symbol, c.name, assetId, c.network, c.instructions, new Date().toISOString());
    }
  }
}

export function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  migrate(db);
  seed(db);
  seedStablecoinChannels(db);
  return db;
}