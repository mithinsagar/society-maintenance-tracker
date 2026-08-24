import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ComplaintDetail } from '@/components/patterns/complaint-detail';
import { PageBody, PageHeader } from '@/components/shell/app-shell';
import { uuidSchema } from '@/lib/validation';
import { requireUser } from '@/server/auth/guards';
import { NotFoundError } from '@/server/errors';
import {
  getComplaintForUser,
  getComplaintHistory,
  type SerializedComplaint,
  type SerializedEvent,
} from '@/server/services/complaint.service';
import { getSettings } from '@/server/services/settings.service';

/**
 * Resident complaint detail.
 *
 * Ownership is enforced in the service: a resident requesting another
 * resident's complaint receives a NotFoundError, which becomes this page's 404.
 * The check lives in the data layer, so this page could not skip it if it tried.
 */

interface DetailData {
  complaint: SerializedComplaint;
  events: SerializedEvent[];
  overdueThresholdDays: number;
}

/**
 * Data loading is isolated from rendering.
 *
 * The try/catch has to wrap only the awaits: React does not render JSX at the
 * point it is constructed, so a `catch` around a returned tree would never see
 * a rendering error and would only obscure where errors are actually handled.
 */
async function loadDetail(id: string, user: { id: string; role: 'RESIDENT' | 'ADMIN' }) {
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) return null;

  try {
    const [complaint, events, settings] = await Promise.all([
      getComplaintForUser(parsedId.data, user),
      getComplaintHistory(parsedId.data, user),
      getSettings(),
    ]);

    return {
      complaint,
      events,
      overdueThresholdDays: settings.overdueThresholdDays,
    } satisfies DetailData;
  } catch (error) {
    // Not found, or belongs to someone else — the two are indistinguishable
    // to the caller by design.
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
  const user = await requireUser();
  const data = await loadDetail(id, user);

  return data ? { title: `${data.complaint.reference} · ${data.complaint.title}` } : { title: 'Complaint' };
}

export default async function ComplaintDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const data = await loadDetail(id, user);

  if (!data) notFound();

  return (
    <>
      <PageHeader
        title={data.complaint.title}
        breadcrumb={
          <Link
            href="/complaints"
            className="inline-flex items-center gap-1.5 text-xs text-subtle transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3" aria-hidden />
            My complaints
          </Link>
        }
      />

      <PageBody>
        <ComplaintDetail
          complaint={data.complaint}
          events={data.events}
          overdueThresholdDays={data.overdueThresholdDays}
        />
      </PageBody>
    </>
  );
}
