import type { Metadata } from 'next';
import Link from 'next/link';

import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Sign in</h1>
      <p className="mt-1.5 text-[13px] text-subtle">
        Access your complaints, track their progress and read society notices.
      </p>

      <LoginForm nextPath={next} />

      <p className="mt-6 text-[13px] text-subtle">
        New resident?{' '}
        <Link
          href="/register"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
