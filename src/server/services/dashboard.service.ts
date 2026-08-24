import 'server-only';

import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';

import { CATEGORY_LABELS, STATUS_LABELS } from '@/lib/constants';
import { overdueCutoff } from '@/lib/overdue';
import { db } from '@/server/db';
import {
  complaintEvents,
  complaints,
  users,
  type ComplaintCategory,
  type ComplaintStatus,
  type Priority,
} from '@/server/db/schema';

import { complaintSelection, serializeComplaint, type SerializedComplaint } from './complaint.service';
import { getSettings } from './settings.service';

/**
 * Dashboard aggregation.
 *
 * Every number here is computed by Postgres with `GROUP BY` / `FILTER`, not by
 * loading rows into Node and counting them. That matters for correctness as
 * much as speed: counting a page of results would silently report the page,
 * not the dataset.
 *
 * All the independent aggregates are issued concurrently, so the dashboard
 * costs one round-trip's latency rather than the sum of eight.
 */

export interface StatusBreakdown {
  status: ComplaintStatus;
  label: string;
  count: number;
}

export interface CategoryBreakdown {
  category: ComplaintCategory;
  label: string;
  count: number;
  openCount: number;
}

export interface PriorityBreakdown {
  priority: Priority;
  count: number;
}

export interface TrendPoint {
  date: string;
  raised: number;
  resolved: number;
}

export interface ActivityItem {
  id: string;
  complaintId: string;
  reference: string;
  complaintTitle: string;
  type: 'CREATED' | 'STATUS_CHANGED' | 'PRIORITY_CHANGED';
  fromStatus: ComplaintStatus | null;
  toStatus: ComplaintStatus | null;
  fromPriority: Priority | null;
  toPriority: Priority | null;
  note: string | null;
  actorName: string;
  createdAt: string;
}

export interface AdminDashboard {
  totals: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    overdue: number;
    unassignedHighPriority: number;
    resolvedThisWeek: number;
    /** Mean hours from creation to resolution, over resolved complaints. */
    avgResolutionHours: number | null;
  };
  statusBreakdown: StatusBreakdown[];
  categoryBreakdown: CategoryBreakdown[];
  priorityBreakdown: PriorityBreakdown[];
  trend: TrendPoint[];
  overdueQueue: SerializedComplaint[];
  recentActivity: ActivityItem[];
  overdueThresholdDays: number;
}

const TREND_DAYS = 30;

export async function getAdminDashboard(): Promise<AdminDashboard> {
  const now = new Date();
  const settings = await getSettings();
  const cutoff = overdueCutoff(settings.overdueThresholdDays, now);

  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const trendStart = new Date(now.getTime() - TREND_DAYS * 24 * 60 * 60 * 1000);
  trendStart.setHours(0, 0, 0, 0);

  const [
    totalsRow,
    statusRows,
    categoryRows,
    priorityRows,
    trendRows,
    overdueRows,
    activityRows,
  ] = await Promise.all([
    // One pass over the table producing every headline number, using FILTER
    // rather than seven separate COUNT queries.
    db
      .select({
        total: sql<number>`count(*)::int`,
        open: sql<number>`count(*) FILTER (WHERE ${complaints.status} = 'OPEN')::int`,
        inProgress: sql<number>`count(*) FILTER (WHERE ${complaints.status} = 'IN_PROGRESS')::int`,
        resolved: sql<number>`count(*) FILTER (WHERE ${complaints.status} = 'RESOLVED')::int`,
        overdue: sql<number>`count(*) FILTER (WHERE ${complaints.status} <> 'RESOLVED' AND ${complaints.createdAt} <= ${cutoff})::int`,
        unassignedHighPriority: sql<number>`count(*) FILTER (WHERE ${complaints.status} = 'OPEN' AND ${complaints.priority} = 'HIGH')::int`,
        resolvedThisWeek: sql<number>`count(*) FILTER (WHERE ${complaints.resolvedAt} >= ${weekAgo})::int`,
        avgResolutionHours: sql<
          number | null
        >`round(avg(EXTRACT(EPOCH FROM (${complaints.resolvedAt} - ${complaints.createdAt})) / 3600.0) FILTER (WHERE ${complaints.resolvedAt} IS NOT NULL)::numeric, 1)::float8`,
      })
      .from(complaints),

    db
      .select({ status: complaints.status, value: sql<number>`count(*)::int` })
      .from(complaints)
      .groupBy(complaints.status),

    db
      .select({
        category: complaints.category,
        value: sql<number>`count(*)::int`,
        openValue: sql<number>`count(*) FILTER (WHERE ${complaints.status} <> 'RESOLVED')::int`,
      })
      .from(complaints)
      .groupBy(complaints.category)
      .orderBy(desc(sql`count(*)`)),

    db
      .select({ priority: complaints.priority, value: sql<number>`count(*)::int` })
      .from(complaints)
      .where(sql`${complaints.status} <> 'RESOLVED'`)
      .groupBy(complaints.priority),

    // A generated date series left-joined against the data, so days with no
    // activity appear as zeros instead of being missing from the chart.
    db.execute<{ date: string; raised: number; resolved: number }>(sql`
      SELECT
        to_char(d.day, 'YYYY-MM-DD') AS date,
        COALESCE(r.raised, 0)::int   AS raised,
        COALESCE(s.resolved, 0)::int AS resolved
      FROM generate_series(${trendStart}::timestamptz, ${now}::timestamptz, '1 day') AS d(day)
      LEFT JOIN (
        SELECT date_trunc('day', created_at) AS day, count(*) AS raised
        FROM complaints WHERE created_at >= ${trendStart} GROUP BY 1
      ) r ON r.day = date_trunc('day', d.day)
      LEFT JOIN (
        SELECT date_trunc('day', resolved_at) AS day, count(*) AS resolved
        FROM complaints WHERE resolved_at >= ${trendStart} GROUP BY 1
      ) s ON s.day = date_trunc('day', d.day)
      ORDER BY d.day
    `),

    // The overdue queue: oldest breach first, weighted by priority.
    db
      .select(complaintSelection)
      .from(complaints)
      .innerJoin(users, eq(complaints.residentId, users.id))
      .where(and(sql`${complaints.status} <> 'RESOLVED'`, lte(complaints.createdAt, cutoff)))
      .orderBy(
        desc(sql`CASE ${complaints.priority} WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ELSE 1 END`),
        complaints.createdAt,
      )
      .limit(8),

    db
      .select({
        id: complaintEvents.id,
        complaintId: complaintEvents.complaintId,
        type: complaintEvents.type,
        fromStatus: complaintEvents.fromStatus,
        toStatus: complaintEvents.toStatus,
        fromPriority: complaintEvents.fromPriority,
        toPriority: complaintEvents.toPriority,
        note: complaintEvents.note,
        createdAt: complaintEvents.createdAt,
        actorName: users.fullName,
        reference: complaints.reference,
        complaintTitle: complaints.title,
      })
      .from(complaintEvents)
      .innerJoin(users, eq(complaintEvents.actorId, users.id))
      .innerJoin(complaints, eq(complaintEvents.complaintId, complaints.id))
      .orderBy(desc(complaintEvents.createdAt))
      .limit(10),
  ]);

  const totals = totalsRow[0] ?? {
    total: 0,
    open: 0,
    inProgress: 0,
    resolved: 0,
    overdue: 0,
    unassignedHighPriority: 0,
    resolvedThisWeek: 0,
    avgResolutionHours: null,
  };

  const statusCounts: Record<ComplaintStatus, number> = { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0 };
  for (const row of statusRows) statusCounts[row.status] = row.value;

  const priorityCounts: Record<Priority, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  for (const row of priorityRows) priorityCounts[row.priority] = row.value;

  return {
    totals,
    statusBreakdown: (['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const).map((status) => ({
      status,
      label: STATUS_LABELS[status],
      count: statusCounts[status],
    })),
    categoryBreakdown: categoryRows.map((row) => ({
      category: row.category,
      label: CATEGORY_LABELS[row.category],
      count: row.value,
      openCount: row.openValue,
    })),
    priorityBreakdown: (['HIGH', 'MEDIUM', 'LOW'] as const).map((priority) => ({
      priority,
      count: priorityCounts[priority],
    })),
    trend: trendRows.rows.map((row) => ({
      date: row.date,
      raised: row.raised,
      resolved: row.resolved,
    })),
    overdueQueue: overdueRows.map((row) =>
      serializeComplaint(row, settings.overdueThresholdDays, now),
    ),
    recentActivity: activityRows.map((row) => ({
      id: row.id,
      complaintId: row.complaintId,
      reference: row.reference,
      complaintTitle: row.complaintTitle,
      type: row.type,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      fromPriority: row.fromPriority,
      toPriority: row.toPriority,
      note: row.note,
      actorName: row.actorName,
      createdAt: row.createdAt.toISOString(),
    })),
    overdueThresholdDays: settings.overdueThresholdDays,
  };
}

/** Recent events across a resident's own complaints only. */
export async function getResidentActivity(residentId: string, limit = 6): Promise<ActivityItem[]> {
  const rows = await db
    .select({
      id: complaintEvents.id,
      complaintId: complaintEvents.complaintId,
      type: complaintEvents.type,
      fromStatus: complaintEvents.fromStatus,
      toStatus: complaintEvents.toStatus,
      fromPriority: complaintEvents.fromPriority,
      toPriority: complaintEvents.toPriority,
      note: complaintEvents.note,
      createdAt: complaintEvents.createdAt,
      actorName: users.fullName,
      reference: complaints.reference,
      complaintTitle: complaints.title,
    })
    .from(complaintEvents)
    .innerJoin(complaints, eq(complaintEvents.complaintId, complaints.id))
    .innerJoin(users, eq(complaintEvents.actorId, users.id))
    // Scoped in SQL, not filtered after the fact.
    .where(eq(complaints.residentId, residentId))
    .orderBy(desc(complaintEvents.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    complaintId: row.complaintId,
    reference: row.reference,
    complaintTitle: row.complaintTitle,
    type: row.type,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    fromPriority: row.fromPriority,
    toPriority: row.toPriority,
    note: row.note,
    actorName: row.actorName,
    createdAt: row.createdAt.toISOString(),
  }));
}

export { gte };
