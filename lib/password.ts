import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, expected: string): boolean {
  const hash = scryptSync(password, salt, KEY_LENGTH);
  const expectedBuf = Buffer.from(expected, 'hex');
  return expectedBuf.length === hash.length && timingSafeEqual(expectedBuf, hash);
}