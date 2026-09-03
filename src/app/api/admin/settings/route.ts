import { updateSettingsSchema } from '@/lib/validation';
import { requireAdmin } from '@/server/auth/guards';
import { apiHandler, ok, parseJsonBody } from '@/server/http';
import { RATE_LIMITS, consume } from '@/server/rate-limit';
import { getSettings, updateSettings } from '@/server/services/settings.service';

/** GET /api/admin/settings */
export const GET = apiHandler(async () => {
  await requireAdmin();
  return ok(await getSettings());
});

/**
 * PATCH /api/admin/settings
 *
 * Changing `overdueThresholdDays` takes effect immediately across the whole
 * product — list filters, dashboard counts, badges and the overdue queue —
 * because overdue is derived from this value on read rather than stored on
 * each complaint. No migration, no backfill, no stale rows.
 */
export const PATCH = apiHandler(async (request) => {
  const admin = await requireAdmin();
  consume(`settings:${admin.id}`, RATE_LIMITS.write);

  const input = await parseJsonBody(request, updateSettingsSchema);

  return ok(await updateSettings(input, admin.id));
});
