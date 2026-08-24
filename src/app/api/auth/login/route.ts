import { loginSchema } from '@/lib/validation';
import { createSession, setSessionCookie } from '@/server/auth/session';
import { apiHandler, clientIp, ok, parseJsonBody } from '@/server/http';
import { RATE_LIMITS, consume } from '@/server/rate-limit';
import { authenticate } from '@/server/services/auth.service';

/**
 * POST /api/auth/login
 *
 * Rate limited before the password comparison, so a flood of attempts is
 * rejected without paying for a bcrypt hash each time.
 */
export const POST = apiHandler(async (request) => {
  const ip = clientIp(request);
  consume(`login:${ip}`, RATE_LIMITS.login);

  const input = await parseJsonBody(request, loginSchema);
  const user = await authenticate(input);

  const { token, expiresAt } = await createSession(user.id, {
    userAgent: request.headers.get('user-agent'),
    ipAddress: ip,
  });
  await setSessionCookie(token, expiresAt);

  return ok({ user });
});
