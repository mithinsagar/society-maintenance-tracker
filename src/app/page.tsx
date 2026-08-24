import { redirect } from 'next/navigation';

import { getSession } from '@/server/auth/session';

/**
 * Role router.
 *
 * The edge middleware knows only whether a cookie exists, not who it belongs
 * to. This server component resolves the real session and sends the user to
 * the shell that matches their role.
 */
export default async function RootPage() {
  const session = await getSession();

  if (!session) redirect('/login');
  redirect(session.user.role === 'ADMIN' ? '/admin' : '/dashboard');
}
