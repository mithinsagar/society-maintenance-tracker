import { ClipboardList, SearchX } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { ComplaintList } from '@/components/patterns/complaint-list';
import { ComplaintFilters, Pagination } from '@/components/patterns/filters';
import { PageBody, PageHeader } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, Skeleton } from '@/components/ui/primitives';
import { complaintQuerySchema } from '@/lib/validation';
import { requireAdmin } from '@/server/auth/guards';
import { listComplaintsForAdmin } from '@/server/services/complaint.service';
import { getSettings } from '@/server/services/settings.service';

export const metadata: Metadata = { title: 'Complaints' };

/**
 * Admin complaint queue.
 *
 * Search, six filters, sorting and pagination — all executed as SQL. Nothing
 * is filtered in the browser, so the totals are true totals and the page
 * transfers one page of rows however large the table grows.
 *
 * The default ordering is the queue's whole point: overdue first, then by
 * priority, then oldest within a band.
 */
export default async function AdminComplaintsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const raw = await searchParams;
  const parsed = complaintQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : complaintQuerySchema.parse({});

  const [{ complaints, total }, settings] = await Promise.all([
    listComplaintsForAdmin(query),
    getSettings(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const hasFilters = Boolean(
    query.q ||
      query.status ||
      query.category ||
      query.priority ||
      query.overdue !== undefined ||
      query.from ||
      query.to,
  );

  return (
    <>
      <PageHeader
        title="Complaints"
        description={`Every complaint across the society. Overdue items surface first, based on the ${settings.overdueThresholdDays}-day response window.`}
      />

      <PageBody className="space-y-4">
        <Suspense fallback={<Skeleton className="h-9 w-full max-w-xs" />}>
          <ComplaintFilters resultCount={total} />
        </Suspense>

        <ComplaintList
          complaints={complaints}
          basePath="/admin/complaints"
          showResident
          emptyState={
            <Card>
              {hasFilters ? (
                <EmptyState
                  icon={<SearchX />}
                  title="No complaints match these filters"
                  description="Try clearing a filter or widening the date range."
                  action={
                    <Button asChild variant="secondary" size="sm">
                      <Link href="/admin/complaints">Clear all filters</Link>
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={<ClipboardList />}
                  title="No complaints have been raised"
                  description="When residents report maintenance issues, they will appear here for triage."
                />
              )}
            </Card>
          }
        />

        <Suspense fallback={null}>
          <Pagination
            page={query.page}
            totalPages={totalPages}
            total={total}
            pageSize={query.pageSize}
          />
        </Suspense>
      </PageBody>
    </>
  );
}
