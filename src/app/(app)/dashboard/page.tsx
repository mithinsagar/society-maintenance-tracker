import {
  ArrowRight,
  CheckCircle2,
  Circle,
  ClipboardList,
  Clock,
  Megaphone,
  Pin,
  PlusCircle,
  Timer,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ComplaintMiniRow } from '@/components/patterns/complaint-list';
import { StatCard, StatCardGrid } from '@/components/patterns/stat-card';
import { PageBody, PageHeader } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from '@/components/ui/primitives';
import { formatRelative, truncate } from '@/lib/utils';
import { requireUser } from '@/server/auth/guards';
import { getResidentSummary } from '@/server/services/complaint.service';
import { getResidentActivity } from '@/server/services/dashboard.service';
import { getLatestNotices } from '@/server/services/notice.service';
import { getSettings } from '@/server/services/settings.service';

export const metadata: Metadata = { title: 'Dashboard' };

/**
 * Resident dashboard.
 *
 * Answers "where do my complaints stand?" without a click. The KPI row is
 * ordered by how much attention each state deserves, and every tile links to
 * the filtered list behind it.
 *
 * Rendered on the server: the four queries below run concurrently and the page
 * arrives complete, with no client-side fetch waterfall and no loading
 * spinners for data we could simply have ready.
 */
export default async function ResidentDashboardPage() {
  const user = await requireUser();

  // Admins have their own overview; sending them here would show an empty page.
  if (user.role === 'ADMIN') redirect('/admin');

  const [summary, activity, notices, settings] = await Promise.all([
    getResidentSummary(user.id),
    getResidentActivity(user.id, 6),
    getLatestNotices(4),
    getSettings(),
  ]);

  const firstName = user.fullName.split(' ')[0];
  const active = summary.counts.OPEN + summary.counts.IN_PROGRESS;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={
          active > 0
            ? `You have ${active} active ${active === 1 ? 'complaint' : 'complaints'} being tracked${summary.overdue > 0 ? `, ${summary.overdue} of which ${summary.overdue === 1 ? 'has' : 'have'} passed the ${settings.overdueThresholdDays}-day response window.` : '.'}`
            : 'You have no active complaints. Everything you have raised has been resolved.'
        }
        actions={
          <Button asChild size="md">
            <Link href="/complaints/new">
              <PlusCircle aria-hidden />
              Raise complaint
            </Link>
          </Button>
        }
      />

      <PageBody className="space-y-6">
        <StatCardGrid>
          <StatCard
            label="Open"
            value={summary.counts.OPEN}
            hint="Logged, awaiting assignment"
            icon={Circle}
            tone="open"
            href="/complaints?status=OPEN"
          />
          <StatCard
            label="In progress"
            value={summary.counts.IN_PROGRESS}
            hint="Being worked on now"
            icon={Clock}
            tone="progress"
            href="/complaints?status=IN_PROGRESS"
          />
          <StatCard
            label="Resolved"
            value={summary.counts.RESOLVED}
            hint="Completed and closed"
            icon={CheckCircle2}
            tone="resolved"
            href="/complaints?status=RESOLVED"
          />
          <StatCard
            label="Overdue"
            value={summary.overdue}
            hint={
              summary.overdue > 0
                ? `Past the ${settings.overdueThresholdDays}-day window`
                : 'Nothing past due'
            }
            icon={Timer}
            tone={summary.overdue > 0 ? 'overdue' : 'neutral'}
            href={summary.overdue > 0 ? '/complaints?overdue=true' : undefined}
          />
        </StatCardGrid>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          {/* ---------------- Recent complaints ---------------- */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Your complaints</CardTitle>
              </div>
              <Link
                href="/complaints"
                className="flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                View all
                <ArrowRight className="size-3" aria-hidden />
              </Link>
            </CardHeader>

            {summary.recent.length > 0 ? (
              <div className="p-2">
                {summary.recent.map((complaint) => (
                  <ComplaintMiniRow
                    key={complaint.id}
                    complaint={complaint}
                    basePath="/complaints"
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<ClipboardList />}
                title="No complaints yet"
                description="When something in your flat or the common areas needs attention, raise it here and track it through to resolution."
                action={
                  <Button asChild size="sm">
                    <Link href="/complaints/new">
                      <PlusCircle aria-hidden />
                      Raise your first complaint
                    </Link>
                  </Button>
                }
              />
            )}
          </Card>

          {/* ---------------- Notices ---------------- */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Notice board</CardTitle>
              </div>
              <Link
                href="/notices"
                className="flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                All notices
                <ArrowRight className="size-3" aria-hidden />
              </Link>
            </CardHeader>

            {notices.length > 0 ? (
              <ul className="divide-y divide-border">
                {notices.map((notice) => (
                  <li key={notice.id}>
                    <Link
                      href={`/notices#${notice.id}`}
                      className="block px-5 py-3.5 transition-colors hover:bg-surface-sunken/60"
                    >
                      <div className="flex items-start gap-2">
                        {notice.isImportant ? (
                          <Pin
                            className="mt-0.5 size-3.5 shrink-0 text-status-progress"
                            aria-label="Important"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium leading-snug text-foreground">
                            {notice.title}
                          </p>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-subtle">
                            {truncate(notice.body, 120)}
                          </p>
                          <p className="mt-1.5 text-[11px] text-subtle">
                            {formatRelative(notice.publishedAt)} · {notice.author.fullName}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<Megaphone />}
                title="No notices posted"
                description="Announcements from the management committee will appear here."
              />
            )}
          </Card>
        </div>

        {/* ---------------- Activity ---------------- */}
        {activity.length > 0 ? (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Recent activity on your complaints</CardTitle>
              </div>
            </CardHeader>
            <CardBody className="p-0">
              <ul className="divide-y divide-border">
                {activity.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/complaints/${item.complaintId}`}
                      className="flex items-baseline gap-3 px-5 py-3 transition-colors hover:bg-surface-sunken/60"
                    >
                      <span className="font-mono text-[11px] text-subtle tabular">
                        {item.reference}
                      </span>
                      <span className="min-w-0 flex-1 text-[13px] text-muted">
                        {describeActivity(item)}
                      </span>
                      <span className="shrink-0 text-[11px] text-subtle tabular">
                        {formatRelative(item.createdAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : null}
      </PageBody>
    </>
  );
}

function describeActivity(item: {
  type: string;
  toStatus: string | null;
  toPriority: string | null;
  actorName: string;
}): string {
  if (item.type === 'CREATED') return 'You raised this complaint';
  if (item.type === 'PRIORITY_CHANGED') {
    return `${item.actorName} set priority to ${item.toPriority?.toLowerCase()}`;
  }
  const label = item.toStatus === 'IN_PROGRESS' ? 'in progress' : item.toStatus?.toLowerCase();
  return `${item.actorName} marked this ${label}`;
}
