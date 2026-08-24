import { clearSessionCookie, destroySession, getSession } from '@/server/auth/session';
import { apiHandler, ok } from '@/server/http';

/**
 * POST /api/auth/logout
 *
 * Deletes the session row, so the token is dead server-side rather than merely
 * discarded by the client — the property an opaque session buys us over a JWT.
 * Idempotent: logging out twice is not an error.
 */
export const POST = apiHandler(async () => {
  const session = await getSession();
  if (session) {
    await destroySession(session.sessionId);
  }
  await clearSessionCookie();
  return ok({ success: true });
});
