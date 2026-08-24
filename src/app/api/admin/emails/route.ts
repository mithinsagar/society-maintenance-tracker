import { z } from 'zod';

import { requireAdmin } from '@/server/auth/guards';
import { listOutbox, outboxSummary } from '@/server/email/outbox';
import { apiHandler, buildPaginationMeta, ok, parseQuery } from '@/server/http';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      const list = Array.isArray(value) ? value : value.split(',');
      const valid = list.filter((item): item is 'PENDING' | 'SENT' | 'FAILED' =>
        ['PENDING', 'SENT', 'FAILED'].includes(item),
      );
      return valid.length > 0 ? valid : undefined;
    }),
});

/**
 * GET /api/admin/emails — the notification delivery log.
 *
 * Reads the outbox: every notification the system decided to send, whether it
 * was delivered, and why it failed if it was not. This is what makes email
 * observable rather than a black box — and it means the notification pipeline
 * can be demonstrated even where a provider sandbox refuses to deliver to
 * seeded addresses.
 */
export const GET = apiHandler(async (request) => {
  await requireAdmin();
  const query = parseQuery(request, querySchema);

  const [{ rows, total }, summary] = await Promise.all([
    listOutbox({ page: query.page, pageSize: query.pageSize, status: query.status }),
    outboxSummary(),
  ]);

  return ok(rows, {
    meta: { ...buildPaginationMeta(query.page, query.pageSize, total), summary },
  });
});
