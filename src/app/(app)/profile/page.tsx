import type { Metadata } from 'next';

import { PageBody, PageHeader } from '@/components/shell/app-shell';
import { requireUser } from '@/server/auth/guards';

import { ProfileForms } from './profile-forms';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader
        title="Profile"
        description="Your account details and password. Complaints you raise are filed against the flat number shown here."
      />

      <PageBody>
        <div className="mx-auto max-w-2xl">
          <ProfileForms
            user={{
              fullName: user.fullName,
              email: user.email,
              flatNumber: user.flatNumber,
              phone: user.phone,
              role: user.role,
              createdAt: user.createdAt.toISOString(),
            }}
          />
        </div>
      </PageBody>
    </>
  );
}
