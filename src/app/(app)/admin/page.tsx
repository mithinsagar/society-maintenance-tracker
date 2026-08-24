import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  Gauge,
  Inbox,
  Timer,
  TrendingUp,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { BarChart, DonutChart, ProportionBar, TrendChart } from '@/components/charts/charts';
import { ComplaintMiniRow } from '@/components/patterns/complaint-list';
import { StatCard, StatCardGrid } from '@/components/patterns/stat-card';
import { PageBody, PageHeader } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from '@/components/ui/primitives';
import { PRIORITY_LABELS } from '@/lib/constants';
import { formatDuration, formatRelative } from '@/lib/utils';
import { requireAdmin } from '@/server/auth/guards';
import { getAdminDashboard } from '@/server/services/dashboard.service';

export const metadata: Metadata = { title: 'Overview' };

/**
 * Admin overview.
 *
 * Ordered to answer one question first — *what needs my attention?* — so the
 * overdue queue and the high-priority count sit above the charts rather than
 * below them. Charts are context; the queue is the work.
 */
export default async function AdminOverviewPage() {
  await requireAdmin();
  const dashboard = await getAdminDashboard();
  const { totals } = dashboard;

  const active = totals.open + totals.inProgress;
  const resolutionRate = totals.total > 0 ? Math.round((totals.resolved / totals.total) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Overview"
        description={
          totals.overdue > 0
            ? `${totals.overdue} ${totals.overdue === 1 ? 'complaint has' : 'complaints have'} passed the ${dashboard.overdueThresholdDays}-day response window and ${totals.overdue === 1 ? 'needs' : 'need'} attention.`
            : `${active} active ${active === 1 ? 'complaint' : 'complaints'}, none past the ${dashboard.overdueThresholdDays}-day response window.`
        }
        actions={
          <Button asChild variant="secondary" size="md">
            <Link href="/admin/complaints">
              <ClipboardList aria-hidden />
              All complaints
            </Link>
          </Button>
        }
      />

      <PageBody className="space-y-6">
        {/* ---------------- KPIs ---------------- */}
        <StatCardGrid className="lg:grid-cols-5">
          <StatCard
            label="Total"
            value={totals.total}
            hint="All time"
            icon={Inbox}
            href="/admin/complaints"
          />
          <StatCard
            label="Open"
            value={totals.open}
            hint="Awaiting assignment"
            icon={ClipboardList}
            tone="open"
            href="/admin/complaints?status=OPEN"
          />
          <StatCard
            label="In progress"
            value={totals.inProgress}
            hint="Being worked on"
            icon={Clock}
            tone="progress"
            href="/admin/complaints?status=IN_PROGRESS"
          />
          <StatCard
            label="Resolved"
            value={totals.resolved}
            hint={`${resolutionRate}% of all complaints`}
            icon={CheckCircle2}
            tone="resolved"
            href="/admin/complaints?status=RESOLVED"
          />
          <StatCard
            label="Overdue"
            value={totals.overdue}
            hint={`Past ${dashboard.overdueThresholdDays} days`}
            icon={Timer}
            tone={totals.overdue > 0 ? 'overdue' : 'neutral'}
            href="/admin/overdue"
            className="col-span-2 lg:col-span-1"
          />
        </StatCardGrid>

        {/* ---------------- Attention row ---------------- */}
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Overdue queue
                  {totals.overdue > 0 ? (
                    <span className="rounded bg-status-overdue-bg px-1.5 py-0.5 text-[10px] font-semibold text-status-overdue tabular">
                      {totals.overdue}
                    </span>
                  ) : null}
                </CardTitle>
                <p className="mt-0.5 text-xs text-subtle">
                  Highest priority first, then longest waiting.
                </p>
              </div>
              {dashboard.overdueQueue.length > 0 ? (
                <Link
                  href="/admin/overdue"
                  className="flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  View all
                  <ArrowRight className="size-3" aria-hidden />
                </Link>
              ) : null}
            </CardHeader>

            {dashboard.overdueQueue.length > 0 ? (
              <div className="p-2">
                {dashboard.overdueQueue.map((complaint) => (
                  <ComplaintMiniRow
                    key={complaint.id}
                    complaint={complaint}
                    basePath="/admin/complaints"
                    showResident
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<CheckCircle2 />}
                title="Nothing overdue"
                description={`Every open complaint is within the ${dashboard.overdueThresholdDays}-day response window.`}
              />
            )}
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Status distribution</CardTitle>
                <p className="mt-0.5 text-xs text-subtle">Across all complaints on record.</p>
              </div>
            </CardHeader>
            <CardBody>
              <DonutChart
                centerLabel="Complaints"
                centerValue={totals.total}
                segments={[
                  { label: 'Open', value: totals.open, className: 'stroke-status-open text-status-open' },
                  {
                    label: 'In Progress',
                    value: totals.inProgress,
                    className: 'stroke-status-progress text-status-progress',
                  },
                  {
                    label: 'Resolved',
                    value: totals.resolved,
                    className: 'stroke-status-resolved text-status-resolved',
                  },
                ]}
              />
            </CardBody>
          </Card>
        </div>

        {/* ---------------- Secondary metrics ---------------- */}
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Avg. resolution"
            value={formatDuration(totals.avgResolutionHours)}
            hint="From raised to resolved"
            icon={Gauge}
          />
          <StatCard
            label="Resolved this week"
            value={totals.resolvedThisWeek}
            hint="Last 7 days"
            icon={TrendingUp}
            tone="resolved"
          />
          <StatCard
            label="High priority open"
            value={totals.unassignedHighPriority}
            hint="Awaiting assignment"
            icon={Timer}
            tone={totals.unassignedHighPriority > 0 ? 'progress' : 'neutral'}
            href="/admin/complaints?priority=HIGH&status=OPEN"
          />
        </div>

        {/* ---------------- Charts ---------------- */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Raised vs resolved</CardTitle>
              <p className="mt-0.5 text-xs text-subtle">
                Last 30 days. When the resolved line tracks the raised line, the queue is stable.
              </p>
            </div>
          </CardHeader>
          <CardBody>
            <TrendChart data={dashboard.trend} />
          </CardBody>
        </Card>

        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>By category</CardTitle>
                <p className="mt-0.5 text-xs text-subtle">
                  Total raised, with outstanding work shown darker.
                </p>
              </div>
            </CardHeader>
            <CardBody>
              <BarChart
                data={dashboard.categoryBreakdown.map((row) => ({
                  label: row.label,
                  value: row.count,
                  secondaryValue: row.openCount,
                }))}
              />
            </CardBody>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Outstanding by priority</CardTitle>
                  <p className="mt-0.5 text-xs text-subtle">Excludes resolved complaints.</p>
                </div>
              </CardHeader>
              <CardBody>
                <ProportionBar
                  segments={dashboard.priorityBreakdown.map((row) => ({
                    label: PRIORITY_LABELS[row.priority],
                    value: row.count,
                    className:
                      row.priority === 'HIGH'
                        ? 'bg-priority-high'
                        : row.priority === 'MEDIUM'
                          ? 'bg-priority-medium'
                          : 'bg-priority-low',
                  }))}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Recent activity</CardTitle>
                </div>
              </CardHeader>
              <CardBody className="p-0">
                <ul className="divide-y divide-border">
                  {dashboard.recentActivity.slice(0, 6).map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/admin/complaints/${item.complaintId}`}
                        className="flex items-baseline gap-2.5 px-5 py-2.5 transition-colors hover:bg-surface-sunken/60"
                      >
                        <span className="font-mono text-[11px] text-subtle tabular">
                          {item.reference}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs text-muted">
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
          </div>
        </div>
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
  if (item.type === 'CREATED') return `${item.actorName} raised this complaint`;
  if (item.type === 'PRIORITY_CHANGED') {
    return `${item.actorName} set priority to ${item.toPriority?.toLowerCase()}`;
  }
  const label = item.toStatus === 'IN_PROGRESS' ? 'in progress' : item.toStatus?.toLowerCase();
  return `${item.actorName} marked this ${label}`;
}
