import { requireSession } from '@/server/auth/guards';
import { apiHandler, ok } from '@/server/http';

/** GET /api/auth/me — the signed-in user and session expiry. */
export const GET = apiHandler(async () => {
  const { user, expiresAt } = await requireSession();
  return ok({ user, sessionExpiresAt: expiresAt.toISOString() });
});
