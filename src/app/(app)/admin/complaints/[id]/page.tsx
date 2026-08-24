import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ComplaintDetail } from '@/components/patterns/complaint-detail';
import { PageBody, PageHeader } from '@/components/shell/app-shell';
import { uuidSchema } from '@/lib/validation';
import { requireAdmin } from '@/server/auth/guards';
import { NotFoundError } from '@/server/errors';
import {
  getComplaintForUser,
  getComplaintHistory,
  type SerializedComplaint,
  type SerializedEvent,
} from '@/server/services/complaint.service';
import { getSettings } from '@/server/services/settings.service';

import { AdminActionsPanel } from './actions-panel';

interface DetailData {
  complaint: SerializedComplaint;
  events: SerializedEvent[];
  overdueThresholdDays: number;
}

/** Data loading kept separate from rendering — see the resident page for why. */
async function loadDetail(id: string, admin: { id: string; role: 'ADMIN' | 'RESIDENT' }) {
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) return null;

  try {
    const [complaint, events, settings] = await Promise.all([
      getComplaintForUser(parsedId.data, admin),
      getComplaintHistory(parsedId.data, admin),
      getSettings(),
    ]);

    return {
      complaint,
      events,
      overdueThresholdDays: settings.overdueThresholdDays,
    } satisfies DetailData;
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const admin = await requireAdmin();
  const data = await loadDetail(id, admin);

  return data
    ? { title: `${data.complaint.reference} · ${data.complaint.title}` }
    : { title: 'Complaint' };
}

/**
 * Admin complaint detail.
 *
 * Uses the same detail component the resident sees — the facts about a
 * complaint must not differ by who is looking — with the action panel injected
 * into the metadata rail.
 */
export default async function AdminComplaintDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = await requireAdmin();
  const data = await loadDetail(id, admin);

  if (!data) notFound();

  return (
    <>
      <PageHeader
        title={data.complaint.title}
        breadcrumb={
          <Link
            href="/admin/complaints"
            className="inline-flex items-center gap-1.5 text-xs text-subtle transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3" aria-hidden />
            All complaints
          </Link>
        }
      />

      <PageBody>
        <ComplaintDetail
          complaint={data.complaint}
          events={data.events}
          overdueThresholdDays={data.overdueThresholdDays}
          actions={
            <AdminActionsPanel
              complaintId={data.complaint.id}
              status={data.complaint.status}
              priority={data.complaint.priority}
              allowedTransitions={data.complaint.allowedTransitions}
            />
          }
        />
      </PageBody>
    </>
  );
}
