import type { Metadata } from 'next';

import { PageBody, PageHeader } from '@/components/shell/app-shell';
import { overdueCutoff } from '@/lib/overdue';
import { requireAdmin } from '@/server/auth/guards';
import { db } from '@/server/db';
import { complaints } from '@/server/db/schema';
import { getSettings } from '@/server/services/settings.service';
import { sql } from 'drizzle-orm';

import { SettingsForm } from './settings-form';

export const metadata: Metadata = { title: 'Settings' };

/**
 * Admin settings.
 *
 * The page previews the effect of each candidate threshold before it is
 * applied, because "how many complaints become overdue if I set this to 3
 * days?" is exactly the question an admin has and cannot otherwise answer
 * without saving and seeing what happens.
 */
export default async function AdminSettingsPage() {
  await requireAdmin();

  const settings = await getSettings();
  const preview = await previewThresholds([3, 5, 7, 10, 14, 30]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Society configuration. These values apply immediately across the whole product."
      />

      <PageBody>
        <div className="mx-auto max-w-2xl">
          <SettingsForm
            societyName={settings.societyName}
            overdueThresholdDays={settings.overdueThresholdDays}
            preview={preview}
          />
        </div>
      </PageBody>
    </>
  );
}

/**
 * Counts, in one query, how many complaints would be overdue at each candidate
 * threshold. A `FILTER` per candidate means one table pass rather than six.
 */
async function previewThresholds(days: number[]): Promise<Record<number, number>> {
  const selection = Object.fromEntries(
    days.map((day) => [
      String(day),
      sql<number>`count(*) FILTER (WHERE ${complaints.status} <> 'RESOLVED' AND ${complaints.createdAt} <= ${overdueCutoff(day)})::int`,
    ]),
  ) as Record<string, ReturnType<typeof sql<number>>>;

  const [row] = await db.select(selection).from(complaints);

  return Object.fromEntries(
    days.map((day) => [day, Number((row as Record<string, unknown>)?.[String(day)] ?? 0)]),
  );
}
