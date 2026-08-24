import { ClipboardList, PlusCircle, SearchX } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { ComplaintList } from '@/components/patterns/complaint-list';
import { ComplaintFilters, Pagination } from '@/components/patterns/filters';
import { PageBody, PageHeader } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, Skeleton } from '@/components/ui/primitives';
import { complaintQuerySchema } from '@/lib/validation';
import { requireUser } from '@/server/auth/guards';
import { listComplaintsForResident } from '@/server/services/complaint.service';

export const metadata: Metadata = { title: 'My Complaints' };

/**
 * Resident complaint list.
 *
 * Filters come from the URL and are validated by the same Zod schema the API
 * uses, so a hand-edited query string cannot produce an unexpected query. The
 * listing is hard-scoped to the signed-in resident in SQL — no parameter
 * combination can widen it.
 */
export default async function ResidentComplaintsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (user.role === 'ADMIN') redirect('/admin/complaints');

  const raw = await searchParams;
  // Falls back to defaults rather than erroring on a malformed query string —
  // a bad URL should show the unfiltered list, not a crash.
  const parsed = complaintQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : complaintQuerySchema.parse({});

  const { complaints, total } = await listComplaintsForResident(user.id, query);
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

  const hasFilters = Boolean(
    query.q || query.status || query.category || query.priority || query.overdue !== undefined,
  );

  return (
    <>
      <PageHeader
        title="My complaints"
        description="Every issue you have raised, with its current status and full history."
        actions={
          <Button asChild size="md">
            <Link href="/complaints/new">
              <PlusCircle aria-hidden />
              Raise complaint
            </Link>
          </Button>
        }
      />

      <PageBody className="space-y-4">
        <Suspense fallback={<Skeleton className="h-9 w-full max-w-xs" />}>
          <ComplaintFilters
            config={{ showPriority: true, showOverdue: true, showDates: true }}
            resultCount={total}
          />
        </Suspense>

        <ComplaintList
          complaints={complaints}
          basePath="/complaints"
          emptyState={
            <Card>
              {hasFilters ? (
                <EmptyState
                  icon={<SearchX />}
                  title="No complaints match these filters"
                  description="Try widening the date range or clearing a filter to see more results."
                  action={
                    <Button asChild variant="secondary" size="sm">
                      <Link href="/complaints">Clear all filters</Link>
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={<ClipboardList />}
                  title="You have not raised any complaints"
                  description="When something in your flat or a common area needs attention, raise it here. You will be able to follow its progress and receive an email each time the status changes."
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
