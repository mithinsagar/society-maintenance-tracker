import 'server-only';

import { eq } from 'drizzle-orm';

import { env } from '@/lib/env';
import { db, type DbClient } from '@/server/db';
import { appSettings, type AppSetting } from '@/server/db/schema';

/**
 * Application settings.
 *
 * A single row, guaranteed to exist by migration 0001 and guaranteed to be
 * unique by a CHECK (id = 1) constraint — so callers never handle "no settings"
 * or "which settings row".
 *
 * The overdue threshold lives here rather than in the environment because the
 * requirement is that it be *configurable*: an admin changes it in Settings and
 * every overdue calculation across the product moves with it, immediately, with
 * no redeploy. `OVERDUE_THRESHOLD_DAYS` only seeds the initial value.
 */

const SETTINGS_ID = 1;

/**
 * Cached for the lifetime of a request-handling instance. Settings change
 * rarely and are read by nearly every query that touches complaints; re-reading
 * the row on each call would add a round-trip to every list and dashboard.
 * `invalidateSettingsCache()` clears it on write.
 */
let cache: { value: AppSetting; expiresAt: number } | undefined;
const CACHE_TTL_MS = 30_000;

export async function getSettings(client: DbClient = db): Promise<AppSetting> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;

  const rows = await client.select().from(appSettings).where(eq(appSettings.id, SETTINGS_ID)).limit(1);
  let settings = rows[0];

  // Defensive: migration 0001 seeds this row, but a database restored without
  // it should self-heal rather than 500 on every page.
  if (!settings) {
    const inserted = await client
      .insert(appSettings)
      .values({ id: SETTINGS_ID, overdueThresholdDays: env.OVERDUE_THRESHOLD_DAYS })
      .onConflictDoNothing()
      .returning();

    settings =
      inserted[0] ??
      (await client.select().from(appSettings).where(eq(appSettings.id, SETTINGS_ID)).limit(1))[0];

    if (!settings) {
      throw new Error('app_settings row is missing and could not be created.');
    }
  }

  cache = { value: settings, expiresAt: now + CACHE_TTL_MS };
  return settings;
}

/** Convenience for the many callers that need only the threshold. */
export async function getOverdueThresholdDays(client: DbClient = db): Promise<number> {
  return (await getSettings(client)).overdueThresholdDays;
}

export async function updateSettings(
  input: { societyName?: string; overdueThresholdDays?: number },
  actorId: string,
): Promise<AppSetting> {
  const [updated] = await db
    .update(appSettings)
    .set({
      ...(input.societyName !== undefined ? { societyName: input.societyName } : {}),
      ...(input.overdueThresholdDays !== undefined
        ? { overdueThresholdDays: input.overdueThresholdDays }
        : {}),
      updatedById: actorId,
    })
    .where(eq(appSettings.id, SETTINGS_ID))
    .returning();

  invalidateSettingsCache();

  if (!updated) throw new Error('Failed to update settings.');
  return updated;
}

export function invalidateSettingsCache(): void {
  cache = undefined;
}
