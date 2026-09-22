export const WITHDRAWAL_LOCK_DAYS = 30;

export interface WithdrawalLockInfo {
  locked: boolean;
  untilDate: string;
  daysRemaining: number;
}

export function getWithdrawalLock(user: { created_at: string; role: string }): WithdrawalLockInfo {
  if (user.role === 'admin') return { locked: false, untilDate: '', daysRemaining: 0 };
  const windowStart = new Date(user.created_at).getTime();
  const windowEnd = windowStart + WITHDRAWAL_LOCK_DAYS * 86400000;
  const now = Date.now();
  const locked = now < windowEnd;
  return {
    locked,
    untilDate: new Date(windowEnd).toISOString().slice(0, 10),
    daysRemaining: locked ? Math.max(1, Math.ceil((windowEnd - now) / 86400000)) : 0,
  };
}