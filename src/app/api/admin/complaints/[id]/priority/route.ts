import { updatePrioritySchema, uuidSchema } from '@/lib/validation';
import { requireAdmin } from '@/server/auth/guards';
import { apiHandler, ok, parseJsonBody } from '@/server/http';
import { RATE_LIMITS, consume } from '@/server/rate-limit';
import { updateComplaintPriority } from '@/server/services/complaint.service';

/**
 * PATCH /api/admin/complaints/:id/priority
 *
 * Recorded in the same audit trail as status changes, so the complaint's full
 * history reads as one timeline. Setting the priority it already has is a
 * no-op rather than an error — it must not add a meaningless audit entry.
 */
export const PATCH = apiHandler<{ id: string }>(async (request, { params }) => {
  const admin = await requireAdmin();
  consume(`priority:${admin.id}`, RATE_LIMITS.write);

  const { id } = await params;
  const input = await parseJsonBody(request, updatePrioritySchema);

  return ok(await updateComplaintPriority(uuidSchema.parse(id), input, admin));
});
