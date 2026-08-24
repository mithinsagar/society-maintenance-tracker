import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageBody, PageHeader } from '@/components/shell/app-shell';
import { requireUser } from '@/server/auth/guards';
import { getSettings } from '@/server/services/settings.service';

import { ComplaintForm } from './complaint-form';

export const metadata: Metadata = { title: 'Raise a complaint' };

export default async function NewComplaintPage() {
  const user = await requireUser();
  const settings = await getSettings();

  return (
    <>
      <PageHeader
        title="Raise a complaint"
        description="Describe the issue clearly and attach a photo where you can — it helps the maintenance team act without a second visit."
        breadcrumb={
          <Link
            href="/complaints"
            className="inline-flex items-center gap-1.5 text-xs text-subtle transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3" aria-hidden />
            Back to my complaints
          </Link>
        }
      />

      <PageBody>
        <ComplaintForm
          flatNumber={user.flatNumber}
          overdueThresholdDays={settings.overdueThresholdDays}
        />
      </PageBody>
    </>
  );
}
