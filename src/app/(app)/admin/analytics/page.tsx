import { Gauge, Inbox, Timer, TrendingUp } from 'lucide-react';
import type { Metadata } from 'next';

import { BarChart, DonutChart, ProportionBar, TrendChart } from '@/components/charts/charts';
import { StatCard } from '@/components/patterns/stat-card';
import { PageBody, PageHeader } from '@/components/shell/app-shell';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/primitives';
import { PRIORITY_LABELS } from '@/lib/constants';
import { formatDuration } from '@/lib/utils';
import { requireAdmin } from '@/server/auth/guards';
import { getAdminDashboard } from '@/server/services/dashboard.service';

export const metadata: Metadata = { title: 'Analytics' };

/**
 * Analytics.
 *
 * Deliberately only the charts that answer a question someone actually asks:
 * where is the workload, is the team keeping up, how long does resolution
 * take, and what is outstanding. No chart is here to make the page look
 * sophisticated — a decorative chart is worse than no chart, because it costs
 * attention and returns nothing.
 */
export default async function AnalyticsPage() {
  await requireAdmin();
  const dashboard = await getAdminDashboard();
  const { totals } = dashboard;

  const resolutionRate = totals.total > 0 ? Math.round((totals.resolved / totals.total) * 100) : 0;
  const raised30 = dashboard.trend.reduce((sum, point) => sum + point.raised, 0);
  const resolved30 = dashboard.trend.reduce((sum, point) => sum + point.resolved, 0);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Complaint volume, workload distribution and resolution performance."
      />

      <PageBody className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Raised (30d)"
            value={raised30}
            hint="New complaints"
            icon={Inbox}
          />
          <StatCard
            label="Resolved (30d)"
            value={resolved30}
            hint={resolved30 >= raised30 ? 'Keeping pace' : 'Behind intake'}
            icon={TrendingUp}
            tone={resolved30 >= raised30 ? 'resolved' : 'progress'}
          />
          <StatCard
            label="Avg. resolution"
            value={formatDuration(totals.avgResolutionHours)}
            hint="Raised to resolved"
            icon={Gauge}
          />
          <StatCard
            label="Resolution rate"
            value={`${resolutionRate}%`}
            hint="All time"
            icon={Timer}
            tone={resolutionRate >= 70 ? 'resolved' : 'neutral'}
          />
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Raised vs resolved</CardTitle>
              <p className="mt-0.5 text-xs text-subtle">
                Last 30 days. The gap between the lines is the queue growing or shrinking.
              </p>
            </div>
          </CardHeader>
          <CardBody>
            <TrendChart data={dashboard.trend} height={220} />
          </CardBody>
        </Card>

        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Status distribution</CardTitle>
                <p className="mt-0.5 text-xs text-subtle">All complaints on record.</p>
              </div>
            </CardHeader>
            <CardBody>
              <DonutChart
                centerLabel="Complaints"
                centerValue={totals.total}
                segments={[
                  {
                    label: 'Open',
                    value: totals.open,
                    className: 'stroke-status-open text-status-open',
                  },
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

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Outstanding by priority</CardTitle>
                <p className="mt-0.5 text-xs text-subtle">
                  Unresolved work only, so this reflects the live queue.
                </p>
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
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Complaints by category</CardTitle>
              <p className="mt-0.5 text-xs text-subtle">
                Total raised, with the still-unresolved portion shown darker — the categories with
                the most outstanding work are where attention is needed, not simply the busiest.
              </p>
            </div>
          </CardHeader>
          <CardBody>
            <BarChart
              maxRows={11}
              data={dashboard.categoryBreakdown.map((row) => ({
                label: row.label,
                value: row.count,
                secondaryValue: row.openCount,
              }))}
            />
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}
