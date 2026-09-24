export const WITHDRAWAL_LOCK_DAYS = 30;

export interface WithdrawalLockInfo {
  locked: boolean;
  pending: boolean;
  untilDate: string;
  daysRemaining: number;
}

export function getWithdrawalLock(input: {
  role: string;
  anchorDate: string | null;
}): WithdrawalLockInfo {
  if (input.role === 'admin') {
    return { locked: false, pending: false, untilDate: '', daysRemaining: 0 };
  }
  if (!input.anchorDate) {
    return {
      locked: true,
      pending: true,
      untilDate: '',
      daysRemaining: WITHDRAWAL_LOCK_DAYS,
    };
  }
  const windowStart = new Date(input.anchorDate).getTime();
  const windowEnd = windowStart + WITHDRAWAL_LOCK_DAYS * 86400000;
  const now = Date.now();
  const locked = now < windowEnd;
  return {
    locked,
    pending: false,
    untilDate: new Date(windowEnd).toISOString().slice(0, 10),
    daysRemaining: locked ? Math.max(1, Math.ceil((windowEnd - now) / 86400000)) : 0,
  };
}