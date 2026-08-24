import { updateNoticeSchema, uuidSchema } from '@/lib/validation';
import { requireAdmin } from '@/server/auth/guards';
import { apiHandler, ok, parseJsonBody } from '@/server/http';
import { archiveNotice, updateNotice } from '@/server/services/notice.service';

/** PATCH /api/admin/notices/:id — edit content, or pin/unpin. */
export const PATCH = apiHandler<{ id: string }>(async (request, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const input = await parseJsonBody(request, updateNoticeSchema);

  return ok(await updateNotice(uuidSchema.parse(id), input));
});

/**
 * DELETE /api/admin/notices/:id — archive.
 *
 * A soft delete. Notices are community record and residents may have acted on
 * one; erasing the row would destroy the evidence that it was ever posted.
 * Archived notices disappear from the resident board but remain for audit.
 */
export const DELETE = apiHandler<{ id: string }>(async (_request, { params }) => {
  await requireAdmin();
  const { id } = await params;

  await archiveNotice(uuidSchema.parse(id));
  return ok({ success: true, archived: true });
});
