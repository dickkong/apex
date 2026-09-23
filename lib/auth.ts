import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { getDb, sessionSecret, type UserRow } from './db';

const COOKIE_NAME = 'apex_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret).update(payload).digest('base64url');
}

function verifySig(payload: string, sig: string): boolean {
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createSession(userId: string): Promise<void> {
  const exp = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload = `${userId}.${exp}`;
  const token = `${payload}.${sign(payload)}`;
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSessionUser(): Promise<UserRow | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const dot1 = token.indexOf('.');
  const dot2 = dot1 >= 0 ? token.indexOf('.', dot1 + 1) : -1;
  if (dot1 < 0 || dot2 < 0) return null;

  const userId = token.slice(0, dot1);
  const expStr = token.slice(dot1 + 1, dot2);
  const sig = token.slice(dot2 + 1);
  const exp = Number(expStr);

  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  if (!verifySig(`${userId}.${expStr}`, sig)) return null;

  const db = await getDb();
  const row = await db.get<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
  return row ?? null;
}