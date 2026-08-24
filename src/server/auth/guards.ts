import 'server-only';

import { ForbiddenError, UnauthorizedError } from '@/server/errors';

import { getSession, type AuthenticatedSession, type SessionUser } from './session';

/**
 * Authorization guards.
 *
 * These are the enforcement point. Middleware redirects unauthenticated
 * visitors away from private routes, but that is a navigation convenience —
 * it runs before any database lookup and can be bypassed by calling the API
 * directly. Every route handler and every server component that touches
 * protected data calls one of these functions, which re-derives identity and
 * role from the database on each request.
 *
 * The rule this codebase follows: *no data is returned without a guard call
 * in the same function that returns it.*
 */

export async function requireSession(): Promise<AuthenticatedSession> {
  const session = await getSession();
  if (!session) {
    throw new UnauthorizedError();
  }
  return session;
}

export async function requireUser(): Promise<SessionUser> {
  const { user } = await requireSession();
  return user;
}

/**
 * Admin-only.
 *
 * Throws 403 rather than 404 because the existence of the admin area is not a
 * secret — only its contents are. This differs deliberately from the
 * ownership check below.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'ADMIN') {
    throw new ForbiddenError('This action is restricted to society administrators.');
  }
  return user;
}

export function assertAdmin(user: SessionUser): asserts user is SessionUser & { role: 'ADMIN' } {
  if (user.role !== 'ADMIN') {
    throw new ForbiddenError('This action is restricted to society administrators.');
  }
}

/** True when the user may read this complaint: they own it, or they are an admin. */
export function canAccessComplaint(user: SessionUser, residentId: string): boolean {
  return user.role === 'ADMIN' || user.id === residentId;
}
