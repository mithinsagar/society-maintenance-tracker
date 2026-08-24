import { requireAdmin } from '@/server/auth/guards';
import { apiHandler, ok } from '@/server/http';
import { getAdminDashboard } from '@/server/services/dashboard.service';

/**
 * GET /api/admin/dashboard
 *
 * Headline counts, status/category/priority distributions, a 30-day trend, the
 * overdue queue and recent activity. Every figure is aggregated by Postgres;
 * the independent queries run concurrently, so the cost is one round-trip of
 * latency rather than the sum of seven.
 */
export const GET = apiHandler(async () => {
  await requireAdmin();
  return ok(await getAdminDashboard());
});
