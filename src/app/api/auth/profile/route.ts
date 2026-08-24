import { updateProfileSchema } from '@/lib/validation';
import { requireUser } from '@/server/auth/guards';
import { apiHandler, ok, parseJsonBody } from '@/server/http';
import { updateProfile } from '@/server/services/auth.service';

/**
 * PATCH /api/auth/profile
 *
 * Updates only the caller's own record — the user id comes from the session,
 * never from the request, so there is no id to tamper with.
 */
export const PATCH = apiHandler(async (request) => {
  const user = await requireUser();
  const input = await parseJsonBody(request, updateProfileSchema);
  return ok({ user: await updateProfile(user.id, input) });
});
