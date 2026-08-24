import type { Metadata } from 'next';
import Link from 'next/link';

import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Create account' };

export default function RegisterPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Create your account</h1>
      <p className="mt-1.5 text-[13px] text-subtle">
        Register with your flat number to raise and track maintenance complaints.
      </p>

      <RegisterForm />

      <p className="mt-6 text-[13px] text-subtle">
        Already registered?{' '}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
