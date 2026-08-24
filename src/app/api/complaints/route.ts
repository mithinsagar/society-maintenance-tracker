import { complaintQuerySchema, createComplaintSchema } from '@/lib/validation';
import { requireUser } from '@/server/auth/guards';
import {
  apiHandler,
  buildPaginationMeta,
  created,
  ok,
  parseJsonBody,
  parseQuery,
} from '@/server/http';
import { RATE_LIMITS, consume } from '@/server/rate-limit';
import { createComplaint, listComplaintsForResident } from '@/server/services/complaint.service';

/**
 * GET /api/complaints — the caller's own complaints.
 *
 * The resident id is taken from the session and pushed into the SQL WHERE
 * clause by the service, so no combination of query parameters can widen the
 * result beyond the caller's own records.
 */
export const GET = apiHandler(async (request) => {
  const user = await requireUser();
  const query = parseQuery(request, complaintQuerySchema);

  const { complaints, total } = await listComplaintsForResident(user.id, query);

  return ok(complaints, { meta: buildPaginationMeta(query.page, query.pageSize, total) });
});

/** POST /api/complaints — raise a complaint. */
export const POST = apiHandler(async (request) => {
  const user = await requireUser();
  consume(`complaint:${user.id}`, RATE_LIMITS.write);

  const input = await parseJsonBody(request, createComplaintSchema);
  const complaint = await createComplaint(input, user);

  return created(complaint);
});
