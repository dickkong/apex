# ApexYield

A transparent investment-tracking console. There are no fabricated returns and no referral
pyramids — every balance change is booked in an append-only ledger. ApexYield records real
deposits, real sourced prices, and real custody moves, plus one **explicitly agreed product
rate**: a compounding daily yield applied to every member's total value, booked transparently
into the ledger and marked into holdings prices.

## Tech stack

- Next.js 16 (App Router, server actions), React 19, TypeScript, Tailwind CSS v4
- **Supabase Postgres** via `pg` (the `Pool` API) — no ORM, raw parameterized SQL
- On first run against an empty database, an existing local `data/apexyield.db`
  (`node:sqlite`, kept for dev fallback) is **migrated row-for-row into Postgres**
  (users, assets, prices, holdings, ledger, channels, settings) — ids and timestamps preserved.
- `node:crypto` scrypt password hashing; HMAC-signed session cookies — no session tables
- recharts for portfolio value / allocation charts

## Run it

```bash
npm install
<set DATABASE_URL + APEX_SESSION_SECRET env vars, see below>
npm run build
npm start          # next start, defaults to :3000 (this session: -- -p 3100)
```

Required env vars:

| Variable | Purpose |
| -------- | ------- |
| `DATABASE_URL` | Supabase Postgres connection string (Dashboard → Connect → session pooler) |
| `APEX_SESSION_SECRET` | HMAC session secret (≥ 32 chars). Falls back to `data/.secret` when unset |

Optional: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
`SUPABASE_JWKS_URL` (reserved for a future Supabase Auth integration), `APEX_ADMIN_EMAIL`,
`APEX_ADMIN_PASSWORD`.

On first boot against an empty database the app seeds an admin (or imports the existing SQLite
data first, which already contains one):

```
email:    admin@apexyield.local
password: <random 12-hex, printed to the console>
```

Credentials are also written to `data/admin-credentials.txt`. `data/` is gitignored.

### Deploy to Render (Web Service)

- Build command: `npm run build`; Start command: `npm run start`.
- Set `NODE_VERSION=24` (uses the built-in `node:sqlite` for the one-shot migration).
- Set the env vars above — `DATABASE_URL` and `APEX_SESSION_SECRET` are required in production
  (a persistent secret is what keeps sessions valid across deploys).
- No Render Disk is needed: Supabase is the persistent store.

## Core design

### Identity first
- New users register and are **`pending`** until an admin approves them in Oversight.
- Unverified accounts cannot deposit, buy, sell, or withdraw — every money action is gated on
  `status = 'verified'`.

### Anti-money-laundering (30-day money-bind)
All new users are advised (landing page, register page, dashboard) that an **AML policy applies a
30-day money-bind** from the moment their account is created: during the first 30 days the account
cannot make withdrawals. Deposits remain fully invested and keep accruing at the 0.5%–1% daily
rate during the lockdown. Withdrawal requests from a locked account are rejected server-side
(`requestWithdrawalAction`) with the unlock date and days remaining; the withdrawal form shows the
countdown and disables itself; Oversight marks locked members. After the 30-day window the account
may withdraw at any time (`lib/lockdown.ts`).

### Honest books (the ledger)
Every money movement is an entry in a single append-only `ledger` table:

| kind        | cash effect (when posted) |
| ----------- | ------------------------- |
| deposit     | `+amount` (USD value)     |
| withdraw    | `−amount`                 |
| buy         | `−amount`                 |
| sell        | `+amount` (proceeds)      |
| adjustment  | `±amount`, with a note    |
| yield       | `+amount` (daily accrual) |

Deposits and withdrawals are created as **`pending`** and are only credited/debited after an
admin posts them. Buys and sells execute the moment you submit them at the latest **verified
price observation** for that asset. Realized P/L is captured on every sale (`avg_cost` basis).

### Crypto deposits
Capital moves in as a **stablecoin** (USDT, USDC, or any channel an admin enables). An admin
configures a receiving address per channel and backs it with a real asset (e.g. `USDT` → asset
"Tether USD"). To deposit, a member sends the coin to that address and files a deposit with the
transaction hash. When an admin verifies it, the deposit is valued **in USD at a real price
observation** (`crypto amount × observed price`, e.g. 250 USDT × 1.0000) and posted. No price
observation for the asset → the deposit cannot be valued, so the admin must record a sourced
price first. Nothing is priced at a fake or projected rate.

Every single deposit commitment is limited to **$50 minimum and $20,000 maximum** (USD value).
Larger amounts are naturally split: a member wanting $40,000 in files two commitments (2 × $20,000).
The limit is enforced on the form (live USD estimate against the current real price), at
submission, and again when the admin posts the valuation.

### Payout addresses
Each member stores a **default payout address** (`users.withdraw_address`) in their Payout
address card. Withdrawal requests default to it but can override with a per-payout destination.
The destination is captured on the withdrawal's ledger `meta` at request time, shown to the
admin on the pending-withdrawal card, and displayed on the Transactions page — so every posted
payout records *where* it went, in the same way deposits record their TXID.

### Real prices only
Assets are created by an admin, and prices come from **`price_observations`** — dated,
attribution-sourced entries an admin records. Prices are never invented by staff guesswork; the
**only** automatic projection in the system is the agreed daily yield mark (a "model" price),
chained from real observations, stored separately, and always labelled as `model +<rate>%/day`
so it can never be mistaken for an observed market price. No real price yet → you cannot
buy/sell that asset.

### Honest returns
- `net deposits = deposits − withdrawals` (both, only posted)
- `total value  = cash + Σ units × effective price` (effective price = latest real observation
  or model yield mark, whichever is newer)
- `total return = total value − net deposits` (cash-weighted to what you actually funded)
- `realized P/L` accumulates sale proceeds minus cost basis

The only fabricated growth you will ever see is the **agreed daily yield rate** — visible as
labelled yield accruals and model price marks, never hidden inside a number. Everything else is
what actually happened.

### Daily yield program
Every member is **advised that daily interest is always between 0.5% and 1% per day**, compounded.
The operator sets a single global rate inside that band (Oversight → Yield program, default
`0.9%/day`, `0` disables); the admin form and server action reject rates outside `0.5%–1%`. The
policy notice and the applied rate are shown on every member's dashboard.

The rate applies to **every member's total value** (cash + holdings) and compounds daily. It is
materialized in two auditable, non-double-counting parts:

- **Cash share** — one `yield` ledger row per member per day: `rate × prior-day cash`, credited
  as spendable cash and shown in Transactions as “Yield accrual”.
- **Invested share** — `yield_marks` rows chain each asset's valuation forward by `rate` from the
  most recent real price observation. These marks live in a separate table so real
  `price_observations` are never overwritten: deposits are **still valued at real observed
  prices**, while holdings are marked up on the P/L cards. Recording a new real observation
  re-anchors the chain.

Accrual is idempotent (unique indexes), backfills missed days on the next read, and freezes at
the rate active on each day — changing the rate never rewrites history. Total value therefore
tracks `× (1 + rate)` per day exactly.

## Pages

- **Portfolio (`/dashboard`)** — net deposits, total value, total return (absolute + %), cash
  balance, holdings cost vs market value, a value/cash series chart, and an allocation donut.
- **Holdings (`/holdings`)** — open positions, units, average cost, latest price, market value,
  unrealized P/L, buy/sell actions.
- **Transactions (`/transactions`)** — the complete, immutable ledger with status and P/L
  on sales; deposit and withdrawal requests.
- **Oversight (`/oversight`)** — admin only: approve users, post or reject deposits/withdrawals,
  create assets, record price observations, and audited balance adjustments.

## Project layout

```
app/
  (auth)/            login + register
  (app)/             dashboard, holdings, transactions, oversight
  actions.ts         all server actions (money moves, verification, admin)
  globals.css        Tailwind v4 theme (dark maroon/gold)
components/          forms, charts, nav, UI primitives
lib/
  db.ts              schema, migrations, seed, session secret (data/.secret)
  auth.ts            HMAC session cookie helpers
  password.ts        scrypt hash/verify
  money.ts           currency/date/percent formatting (US Dollar)
  portfolio.ts       cash, holdings, summary, and series math
  queries.ts         ledger views + oversight queries
instrumentation.ts   boot-time DB init (so the DB exists before first request)
data/                runtime: apexyield.db, .secret, admin-credentials.txt (gitignored)
```

## Accountability notes

- The server secret and passwords never appear in code or commits; `data/` is gitignored.
- Adjustments require a note and appear in the user's ledger with net effect.
- Withdrawal requests are capped by the user's *posted* cash balance at request time, and the
  admin's post step re-checks cash before honouring — so cash can never be posted negative.
```