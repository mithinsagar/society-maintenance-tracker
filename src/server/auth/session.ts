import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { and, eq, gt, lt } from 'drizzle-orm';
import { cookies } from 'next/headers';

import {
  SESSION_COOKIE_NAME,
  SESSION_DURATION_DAYS,
  SESSION_REFRESH_THRESHOLD_DAYS,
} from '@/lib/constants';
import { env } from '@/lib/env';
import { db } from '@/server/db';
import { sessions, users, type Role } from '@/server/db/schema';

/**
 * Session management.
 *
 * Opaque random tokens stored server-side, chosen over JWT deliberately:
 *
 *  • Every authorized request already loads the user to check their role and
 *    active status, so a JWT's "no database round-trip" advantage would buy
 *    nothing here — while costing the ability to revoke a session.
 *  • Logging out actually ends the session, rather than hoping the client
 *    discards a token that stays valid until it expires.
 *  • No signing-algorithm confusion, no key rotation dance, no accidental
 *    `alg: none`.
 *
 * The cookie carries the raw token; the database stores only its HMAC. A
 * database leak therefore does not hand an attacker usable sessions, and the
 * HMAC key (AUTH_SECRET) lives only in the environment — so rotating
 * AUTH_SECRET invalidates every session at once, by design.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Keyed hash rather than a bare SHA-256 so a stolen database is not enough. */
function hashToken(token: string): string {
  return createHmac('sha256', env.AUTH_SECRET).update(token).digest('hex');
}

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  flatNumber: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  createdAt: Date;
}

export interface AuthenticatedSession {
  user: SessionUser;
  sessionId: string;
  expiresAt: Date;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ipAddress?: string | null } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * MS_PER_DAY);

  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt,
    userAgent: meta.userAgent?.slice(0, 500) ?? null,
    ipAddress: meta.ipAddress?.slice(0, 64) ?? null,
  });

  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true, // unreadable from JavaScript, so XSS cannot exfiltrate it
    secure: env.isProduction,
    sameSite: 'lax', // blocks cross-site POSTs: our CSRF defence for a same-origin API
    path: '/',
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

/**
 * Resolves the current session, or null.
 *
 * One indexed join on `sessions.token_hash`. Returns null — never throws — for
 * every failure mode (no cookie, unknown token, expired, deactivated user), so
 * callers can treat "not signed in" uniformly.
 */
export async function getSession(): Promise<AuthenticatedSession | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);

  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      flatNumber: users.flatNumber,
      phone: users.phone,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // A deactivated account loses access immediately, without waiting for its
  // sessions to expire.
  if (!row.isActive) {
    await db.delete(sessions).where(eq(sessions.id, row.sessionId));
    return null;
  }

  // Rolling expiry: an actively used session is extended, an abandoned one
  // still expires on schedule. Only written when it actually needs to move, so
  // this is not a write on every request.
  const refreshAfter = new Date(Date.now() + SESSION_REFRESH_THRESHOLD_DAYS * MS_PER_DAY);
  let expiresAt = row.expiresAt;
  if (expiresAt < refreshAfter) {
    expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * MS_PER_DAY);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, row.sessionId));
  }

  return {
    sessionId: row.sessionId,
    expiresAt,
    user: {
      id: row.id,
      email: row.email,
      fullName: row.fullName,
      flatNumber: row.flatNumber,
      phone: row.phone,
      role: row.role,
      isActive: row.isActive,
      createdAt: row.createdAt,
    },
  };
}

export async function destroySession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/** Used when a password changes: every other device is signed out. */
export async function destroyAllSessionsForUser(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Housekeeping for expired rows. Called opportunistically, never on the hot path. */
export async function pruneExpiredSessions(): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });
  return deleted.length;
}

/** Exported for tests that need to assert the cookie/database relationship. */
export const __internal = { hashToken, generateToken, timingSafeEqual };
