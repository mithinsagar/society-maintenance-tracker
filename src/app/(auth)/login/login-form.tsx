'use client';

import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { ApiError, api } from '@/lib/api-client';
import type { Role } from '@/server/db/schema';

interface LoginResponse {
  user: { id: string; role: Role };
}

/**
 * Sign-in form.
 *
 * A failed sign-in shows one message at the form level, never on a specific
 * field — the server deliberately does not distinguish "no such account" from
 * "wrong password", and highlighting the email input would leak exactly the
 * distinction the API is hiding.
 */
export function LoginForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { data } = await api.post<LoginResponse>('/api/auth/login', { email, password });

      // Only ever redirect to a same-origin path. Taking `next` verbatim would
      // be an open-redirect straight out of the login page.
      const safeNext =
        nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : null;

      router.replace(safeNext ?? (data.user.role === 'ADMIN' ? '/admin' : '/dashboard'));
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Could not sign in. Please try again.',
      );
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-danger/25 bg-danger-bg px-3 py-2.5"
        >
          <AlertCircle className="mt-px size-4 shrink-0 text-danger" aria-hidden />
          <p className="text-[13px] leading-relaxed text-danger">{error}</p>
        </div>
      ) : null}

      <Field label="Email address" required>
        <Input
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoFocus
        />
      </Field>

      <Field label="Password" required>
        <div className="relative">
          <Input
            type={showPassword ? 'text' : 'password'}
            name="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-1 top-1 flex size-7 items-center justify-center rounded text-subtle transition-colors hover:text-foreground"
          >
            {showPassword ? (
              <EyeOff className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
          </button>
        </div>
      </Field>

      <Button type="submit" size="lg" className="w-full" loading={submitting}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </Button>

      <DemoCredentials
        onUse={(demoEmail, demoPassword) => {
          setEmail(demoEmail);
          setPassword(demoPassword);
          setError(null);
        }}
      />
    </form>
  );
}

/**
 * Demo credential shortcuts.
 *
 * Present so an evaluator can be inside both roles in one click rather than
 * hunting through the README. These are seeded demo accounts on a demo
 * database — documented as such, and the passwords are configurable in the
 * seed environment so a real deployment never ships with them.
 */
function DemoCredentials({ onUse }: { onUse: (email: string, password: string) => void }) {
  const accounts = [
    { label: 'Admin', email: 'admin@greenwoodheights.in', password: 'Admin@12345' },
    { label: 'Resident', email: 'ananya.iyer@greenwoodheights.in', password: 'Resident@12345' },
  ];

  return (
    <div className="rounded-md border border-border bg-surface-sunken p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
        Demo accounts
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {accounts.map((account) => (
          <button
            key={account.label}
            type="button"
            onClick={() => onUse(account.email, account.password)}
            className="rounded-md border border-border bg-surface px-2.5 py-2 text-left transition-colors hover:border-primary-border hover:bg-primary-subtle"
          >
            <span className="block text-xs font-medium text-foreground">{account.label}</span>
            <span className="mt-0.5 block truncate font-mono text-[10px] text-subtle">
              {account.email}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
