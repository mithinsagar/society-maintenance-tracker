import { registerSchema } from '@/lib/validation';
import { createSession, setSessionCookie } from '@/server/auth/session';
import { apiHandler, clientIp, created, parseJsonBody } from '@/server/http';
import { RATE_LIMITS, consume } from '@/server/rate-limit';
import { register } from '@/server/services/auth.service';

/**
 * POST /api/auth/register — create a resident account and sign in.
 *
 * The role is not part of the request body. A caller cannot register as an
 * administrator, whatever they send.
 */
export const POST = apiHandler(async (request) => {
  consume(`register:${clientIp(request)}`, RATE_LIMITS.register);

  const input = await parseJsonBody(request, registerSchema);
  const user = await register(input);

  const { token, expiresAt } = await createSession(user.id, {
    userAgent: request.headers.get('user-agent'),
    ipAddress: clientIp(request),
  });
  await setSessionCookie(token, expiresAt);

  return created({ user });
});
