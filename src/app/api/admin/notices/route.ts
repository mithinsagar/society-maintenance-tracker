import { createNoticeSchema } from '@/lib/validation';
import { requireAdmin } from '@/server/auth/guards';
import { apiHandler, created, parseJsonBody } from '@/server/http';
import { RATE_LIMITS, consume } from '@/server/rate-limit';
import { createNotice } from '@/server/services/notice.service';

/**
 * POST /api/admin/notices — publish a notice.
 *
 * When `isImportant` is true the notice pins to the top of the board and one
 * outbox row is queued per active resident, dispatched after the notice is
 * durably committed. `meta.notification` reports how many were queued and how
 * many actually went out.
 */
export const POST = apiHandler(async (request) => {
  const admin = await requireAdmin();
  consume(`notice:${admin.id}`, RATE_LIMITS.write);

  const input = await parseJsonBody(request, createNoticeSchema);
  const result = await createNotice(input, admin);

  return created({ ...result.notice, notification: result.notification });
});
