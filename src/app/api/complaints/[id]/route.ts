import { uuidSchema } from '@/lib/validation';
import { requireUser } from '@/server/auth/guards';
import { apiHandler, ok } from '@/server/http';
import { getComplaintForUser } from '@/server/services/complaint.service';

/**
 * GET /api/complaints/:id
 *
 * Readable by the complaint's owner or by an admin. A resident requesting
 * someone else's complaint receives 404 rather than 403: a 403 would confirm
 * the record exists, which is itself a disclosure.
 */
export const GET = apiHandler<{ id: string }>(async (_request, { params }) => {
  const user = await requireUser();
  const { id } = await params;

  return ok(await getComplaintForUser(uuidSchema.parse(id), user));
});
