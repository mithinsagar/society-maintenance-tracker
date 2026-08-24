import { complaintQuerySchema } from '@/lib/validation';
import { requireAdmin } from '@/server/auth/guards';
import { apiHandler, buildPaginationMeta, ok, parseQuery } from '@/server/http';
import { listComplaintsForAdmin } from '@/server/services/complaint.service';

/**
 * GET /api/admin/complaints — every complaint, filterable and paginated.
 *
 * Query parameters: q, status[], category[], priority[], overdue, from, to,
 * sort, order, page, pageSize.
 *
 * Filtering, sorting, counting and pagination all happen in Postgres. Pulling
 * the table into the browser to filter there would report wrong totals and
 * transfer data the admin never sees.
 *
 * The default sort answers "what needs attention?": overdue first, then by
 * priority, then oldest within a band.
 */
export const GET = apiHandler(async (request) => {
  await requireAdmin();
  const query = parseQuery(request, complaintQuerySchema);

  const { complaints, total } = await listComplaintsForAdmin(query);

  return ok(complaints, { meta: buildPaginationMeta(query.page, query.pageSize, total) });
});
