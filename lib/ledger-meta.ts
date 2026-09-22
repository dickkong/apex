import type { LedgerRow } from './db';

export interface LedgerMeta {
  channel?: 'crypto';
  symbol?: string;
  methodId?: string;
  txid?: string;
  network?: string;
  address?: string;
  price?: number;
  source?: string;
  realized_pnl?: number;
  destination?: string;
}

export function parseLedgerMeta(row: LedgerRow): LedgerMeta {
  if (!row.meta) return {};
  try {
    return JSON.parse(row.meta) as LedgerMeta;
  } catch {
    return {};
  }
}