// Server-side sessions.
//
// The cookie holds a random opaque token; the database stores only its SHA-256.
// That means a leak of the session table can't be replayed as a login, and it
// means sign-out (and future "sign out everywhere") is a real revocation rather
// than hoping a signed token expires. There is no JWT here on purpose — the DB
// round trip is one indexed primary-key lookup.

import { createHash } from 'node:crypto';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { db } from '../db/connection.js';
import { randomToken } from './oauth.js';
import { usingHttps } from './urls.js';

export const SESSION_COOKIE = 'mc_session';

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 30 * DAY_MS;
// Sessions roll forward: any request made with under this much life left pushes
// the expiry back out, so an active visitor is never signed out mid-use while an
// abandoned session still ages out.
const RENEW_WHEN_REMAINING_MS = 15 * DAY_MS;

// What pages get to know about the signed-in visitor.
export interface SessionUser {
  id: number;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: number): Promise<string> {
  const token = randomToken();
  await db
    .insertInto('user_session')
    .values({
      token_hash: hashSessionToken(token),
      user_id: userId,
      expires_at: new Date(Date.now() + SESSION_TTL_MS),
    })
    .execute();
  return token;
}

// Resolves a cookie token to its user. `renewed` tells the caller the expiry
// moved and the cookie should be re-issued to match.
export async function loadSession(
  token: string,
): Promise<{ user: SessionUser; renewed: boolean } | null> {
  const tokenHash = hashSessionToken(token);

  const row = await db
    .selectFrom('user_session')
    .innerJoin('app_user', 'app_user.id', 'user_session.user_id')
    .select([
      'user_session.expires_at',
      'app_user.id as id',
      'app_user.email',
      'app_user.name',
      'app_user.avatar_url',
    ])
    .where('user_session.token_hash', '=', tokenHash)
    .executeTakeFirst();

  if (!row) return null;

  const now = Date.now();
  if (row.expires_at.getTime() <= now) {
    // Expired: clean it up as we find it, on top of the periodic sweep.
    await db.deleteFrom('user_session').where('token_hash', '=', tokenHash).execute();
    return null;
  }

  let renewed = false;
  if (row.expires_at.getTime() - now < RENEW_WHEN_REMAINING_MS) {
    await db
      .updateTable('user_session')
      .set({ expires_at: new Date(now + SESSION_TTL_MS) })
      .where('token_hash', '=', tokenHash)
      .execute();
    renewed = true;
  }

  return {
    user: { id: row.id, email: row.email, name: row.name, avatarUrl: row.avatar_url },
    renewed,
  };
}

export async function destroySession(token: string): Promise<void> {
  await db.deleteFrom('user_session').where('token_hash', '=', hashSessionToken(token)).execute();
}

// Housekeeping for sessions nobody came back for. Called on a daily cron.
export async function deleteExpiredSessions(): Promise<number> {
  const result = await db
    .deleteFrom('user_session')
    .where('expires_at', '<', new Date())
    .executeTakeFirst();
  return Number(result.numDeletedRows ?? 0);
}

// --- cookie plumbing -----------------------------------------------------

export function getSessionToken(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: usingHttps(),
    // Lax, not Strict: the visitor arrives back from the provider via a
    // top-level GET navigation, which Strict would strip the cookie from.
    sameSite: 'Lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: usingHttps() });
}
