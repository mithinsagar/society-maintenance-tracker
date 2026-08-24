import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { NoticeBoard } from '@/components/patterns/notice-board';
import { PageBody, PageHeader } from '@/components/shell/app-shell';
import { requireUser } from '@/server/auth/guards';
import { listNotices } from '@/server/services/notice.service';

export const metadata: Metadata = { title: 'Notice Board' };

export default async function NoticesPage() {
  const user = await requireUser();
  if (user.role === 'ADMIN') redirect('/admin/notices');

  // Residents never receive archived notices: `includeArchived` is false and
  // the service filters in SQL.
  const { notices } = await listNotices({ page: 1, pageSize: 50, includeArchived: false });

  const importantCount = notices.filter((notice) => notice.isImportant).length;

  return (
    <>
      <PageHeader
        title="Notice board"
        description={
          importantCount > 0
            ? `Announcements from the management committee. ${importantCount} important ${importantCount === 1 ? 'notice is' : 'notices are'} pinned at the top.`
            : 'Announcements from the management committee.'
        }
      />

      <PageBody>
        <div className="mx-auto max-w-3xl">
          <NoticeBoard notices={notices} />
        </div>
      </PageBody>
    </>
  );
}
