export const MIN_DEPOSIT_USD = 50;
export const MAX_DEPOSIT_USD = 20000;

export const MIN_DAILY_YIELD_PCT = 0.5;
export const MAX_DAILY_YIELD_PCT = 1;

export function depositValueError(usdValue: number): string | null {
  if (!Number.isFinite(usdValue) || usdValue < MIN_DEPOSIT_USD) {
    return `Minimum deposit is $${MIN_DEPOSIT_USD.toLocaleString()} per commitment.`;
  }
  if (usdValue > MAX_DEPOSIT_USD) {
    return `Maximum deposit is $${MAX_DEPOSIT_USD.toLocaleString()} per commitment. Larger amounts can be split into multiple commitments (e.g. $20,000, then $20,000).`;
  }
  return null;
}