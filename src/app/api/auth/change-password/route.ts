import { changePasswordSchema } from '@/lib/validation';
import { requireSession } from '@/server/auth/guards';
import { createSession, destroyAllSessionsForUser, setSessionCookie } from '@/server/auth/session';
import { apiHandler, clientIp, ok, parseJsonBody } from '@/server/http';
import { changePassword } from '@/server/services/auth.service';

/**
 * POST /api/auth/change-password
 *
 * On success every existing session is destroyed and a fresh one is issued for
 * this device. If the password was changed because it may have been
 * compromised, leaving other sessions alive would defeat the point.
 */
export const POST = apiHandler(async (request) => {
  const { user } = await requireSession();
  const input = await parseJsonBody(request, changePasswordSchema);

  await changePassword(user.id, input);
  await destroyAllSessionsForUser(user.id);

  const { token, expiresAt } = await createSession(user.id, {
    userAgent: request.headers.get('user-agent'),
    ipAddress: clientIp(request),
  });
  await setSessionCookie(token, expiresAt);

  return ok({ success: true, signedOutOtherDevices: true });
});
