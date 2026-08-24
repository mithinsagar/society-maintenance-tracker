import { updateStatusSchema, uuidSchema } from '@/lib/validation';
import { requireAdmin } from '@/server/auth/guards';
import { apiHandler, ok, parseJsonBody } from '@/server/http';
import { RATE_LIMITS, consume } from '@/server/rate-limit';
import { updateComplaintStatus } from '@/server/services/complaint.service';

/**
 * PATCH /api/admin/complaints/:id/status — transition a complaint.
 *
 * The service validates the transition against the lifecycle, updates the
 * complaint and appends the audit event in one transaction, then attempts the
 * resident notification after commit.
 *
 * The response reports delivery honestly: `notification.delivered` is false
 * when the update succeeded but the email did not go out, so the UI can say so
 * rather than implying the resident was told.
 *
 * Rejects with 409 INVALID_TRANSITION for an illegal move — notably any
 * attempt to reopen a resolved complaint.
 */
export const PATCH = apiHandler<{ id: string }>(async (request, { params }) => {
  const admin = await requireAdmin();
  consume(`status:${admin.id}`, RATE_LIMITS.write);

  const { id } = await params;
  const input = await parseJsonBody(request, updateStatusSchema);

  const result = await updateComplaintStatus(uuidSchema.parse(id), input, admin);

  return ok(result.complaint, { meta: { notification: result.notification } });
});
