import type { Metadata } from 'next';

import { PageBody, PageHeader } from '@/components/shell/app-shell';
import { requireAdmin } from '@/server/auth/guards';
import { listNotices } from '@/server/services/notice.service';

import { NoticeManager } from './notice-manager';

export const metadata: Metadata = { title: 'Notice Board' };

export default async function AdminNoticesPage() {
  await requireAdmin();

  // Admins see archived notices too, so the record of what was posted stays
  // reachable after a notice is taken down.
  const { notices } = await listNotices({ page: 1, pageSize: 100, includeArchived: true });

  return (
    <>
      <PageHeader
        title="Notice board"
        description="Post announcements to the community. Marking a notice important pins it to the top of every resident's board and emails it to them."
      />

      <PageBody>
        <div className="mx-auto max-w-3xl">
          <NoticeManager notices={notices} />
        </div>
      </PageBody>
    </>
  );
}
