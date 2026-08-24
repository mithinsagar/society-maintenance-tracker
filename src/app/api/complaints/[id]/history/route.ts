import { uuidSchema } from '@/lib/validation';
import { requireUser } from '@/server/auth/guards';
import { apiHandler, ok } from '@/server/http';
import { getComplaintHistory } from '@/server/services/complaint.service';

/**
 * GET /api/complaints/:id/history
 *
 * The complete, immutable audit trail for one complaint, oldest first —
 * creation, every status transition and every priority change, each with its
 * actor, timestamp and optional note.
 *
 * Access is enforced by the same ownership check as the complaint itself.
 */
export const GET = apiHandler<{ id: string }>(async (_request, { params }) => {
  const user = await requireUser();
  const { id } = await params;

  return ok(await getComplaintHistory(uuidSchema.parse(id), user));
});
