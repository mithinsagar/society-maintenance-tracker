import { CheckCircle2, Settings2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ComplaintList } from '@/components/patterns/complaint-list';
import { PageBody, PageHeader } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';
import { Card, EmptyState } from '@/components/ui/primitives';
import { complaintQuerySchema } from '@/lib/validation';
import { requireAdmin } from '@/server/auth/guards';
import { listComplaintsForAdmin } from '@/server/services/complaint.service';
import { getSettings } from '@/server/services/settings.service';

export const metadata: Metadata = { title: 'Overdue' };

/**
 * The overdue queue.
 *
 * A dedicated view rather than a filter chip, because this is the one list an
 * administrator should open every morning. It is the same underlying query as
 * `/admin/complaints?overdue=true`, sorted by urgency.
 *
 * Nothing here is stored: the set is derived on read from the current
 * threshold, so changing that threshold in Settings changes this list
 * immediately.
 */
export default async function AdminOverduePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const raw = await searchParams;
  const parsed = complaintQuerySchema.safeParse({ ...raw, overdue: 'true', sort: 'priority' });
  const query = parsed.success
    ? parsed.data
    : complaintQuerySchema.parse({ overdue: 'true', sort: 'priority' });

  const [{ complaints, total }, settings] = await Promise.all([
    listComplaintsForAdmin({ ...query, overdue: true, pageSize: 100 }),
    getSettings(),
  ]);

  return (
    <>
      <PageHeader
        title="Overdue complaints"
        description={`Open complaints raised more than ${settings.overdueThresholdDays} days ago. Resolved complaints are never counted as overdue, however long they took.`}
        actions={
          <Button asChild variant="secondary" size="md">
            <Link href="/admin/settings">
              <Settings2 aria-hidden />
              Change threshold
            </Link>
          </Button>
        }
      />

      <PageBody className="space-y-4">
        {total > 0 ? (
          <p className="text-xs text-subtle">
            <span className="font-medium text-status-overdue tabular">{total}</span>{' '}
            {total === 1 ? 'complaint has' : 'complaints have'} breached the{' '}
            {settings.overdueThresholdDays}-day window, most urgent first.
          </p>
        ) : null}

        <ComplaintList
          complaints={complaints}
          basePath="/admin/complaints"
          showResident
          emptyState={
            <Card>
              <EmptyState
                icon={<CheckCircle2 />}
                title="Nothing is overdue"
                description={`Every open complaint is still within the ${settings.overdueThresholdDays}-day response window. This list will populate automatically if one breaches it.`}
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/admin/complaints">View all complaints</Link>
                  </Button>
                }
              />
            </Card>
          }
        />
      </PageBody>
    </>
  );
}
