import { noticeQuerySchema } from '@/lib/validation';
import { requireUser } from '@/server/auth/guards';
import { apiHandler, buildPaginationMeta, ok, parseQuery } from '@/server/http';
import { listNotices } from '@/server/services/notice.service';

/**
 * GET /api/notices — the notice board, important notices pinned first.
 *
 * Any signed-in user may read it. `includeArchived` is honoured only for
 * admins; residents always see the live board.
 */
export const GET = apiHandler(async (request) => {
  const user = await requireUser();
  const query = parseQuery(request, noticeQuerySchema);

  const { notices, total } = await listNotices({
    page: query.page,
    pageSize: query.pageSize,
    includeArchived: user.role === 'ADMIN' ? query.includeArchived : false,
  });

  return ok(notices, { meta: buildPaginationMeta(query.page, query.pageSize, total) });
});
