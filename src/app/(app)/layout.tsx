import { and, count, lte, sql } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { AppShell } from '@/components/shell/app-shell';
import { overdueCutoff } from '@/lib/overdue';
import { getSession } from '@/server/auth/session';
import { db } from '@/server/db';
import { complaints } from '@/server/db/schema';
import { getSettings } from '@/server/services/settings.service';

/**
 * Authenticated shell layout.
 *
 * The session is resolved here, on the server, from the database — the edge
 * proxy only checked that a cookie existed. If that cookie is invalid or
 * expired, this is where the user is actually turned away.
 *
 * Every page inside this layout additionally guards its own data access; this
 * layout renders the chrome, it is not the security boundary.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!session) redirect('/login');

  const settings = await getSettings();

  // Sidebar counts. Only admins see them, so residents pay nothing for the query.
  const badges =
    session.user.role === 'ADMIN' ? await getAdminBadgeCounts(settings.overdueThresholdDays) : undefined;

  return (
    <AppShell
      user={{
        id: session.user.id,
        fullName: session.user.fullName,
        email: session.user.email,
        flatNumber: session.user.flatNumber,
        role: session.user.role,
      }}
      societyName={settings.societyName}
      badges={badges}
    >
      {children}
    </AppShell>
  );
}

async function getAdminBadgeCounts(thresholdDays: number) {
  const cutoff = overdueCutoff(thresholdDays);

  const [row] = await db
    .select({
      open: sql<number>`count(*) FILTER (WHERE ${complaints.status} <> 'RESOLVED')::int`,
      overdue: sql<number>`count(*) FILTER (WHERE ${complaints.status} <> 'RESOLVED' AND ${complaints.createdAt} <= ${cutoff})::int`,
    })
    .from(complaints);

  return { open: row?.open ?? 0, overdue: row?.overdue ?? 0 };
}

export { and, count, lte };
