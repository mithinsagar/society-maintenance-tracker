'use client';

import { AlertCircle, Check, Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { ApiError, api } from '@/lib/api-client';
import { registerSchema } from '@/lib/validation';
import { cn } from '@/lib/utils';

/**
 * Registration form.
 *
 * Validates with the *same* Zod schema the server uses, so the messages a user
 * sees while typing are exactly the rules that will be enforced — the two
 * cannot drift. The client check is a convenience; the server still validates
 * every field independently.
 */
export function RegisterForm() {
  const router = useRouter();
  const [values, setValues] = React.useState({
    fullName: '',
    email: '',
    flatNumber: '',
    phone: '',
    password: '',
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  function update(field: keyof typeof values) {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
      // Clear a field's error as soon as the user edits it — leaving stale red
      // text under an input they are actively fixing is needlessly punitive.
      setErrors((current) => {
        if (!current[field]) return current;
        const next = { ...current };
        delete next[field];
        return next;
      });
    };
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = registerSchema.safeParse({
      ...values,
      phone: values.phone || undefined,
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.');
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      await api.post('/api/auth/register', parsed.data);
      toast.success('Welcome to Greenwood Heights', {
        description: 'Your account is ready. You can raise your first complaint now.',
      });
      router.replace('/dashboard');
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError && caught.details?.length) {
        setErrors(caught.fieldErrors);
      } else {
        setFormError(
          caught instanceof ApiError ? caught.message : 'Could not create your account.',
        );
      }
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
      {formError ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-danger/25 bg-danger-bg px-3 py-2.5"
        >
          <AlertCircle className="mt-px size-4 shrink-0 text-danger" aria-hidden />
          <p className="text-[13px] leading-relaxed text-danger">{formError}</p>
        </div>
      ) : null}

      <Field label="Full name" required error={errors.fullName}>
        <Input
          name="fullName"
          autoComplete="name"
          placeholder="Ananya Iyer"
          value={values.fullName}
          onChange={update('fullName')}
          autoFocus
        />
      </Field>

      <Field label="Email address" required error={errors.email}>
        <Input
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={values.email}
          onChange={update('email')}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Flat number" required error={errors.flatNumber} hint="For example, B-1204">
          <Input
            name="flatNumber"
            placeholder="B-1204"
            value={values.flatNumber}
            onChange={update('flatNumber')}
          />
        </Field>

        <Field label="Phone" error={errors.phone} hint="Optional">
          <Input
            type="tel"
            name="phone"
            autoComplete="tel"
            placeholder="+91 98450 11234"
            value={values.phone}
            onChange={update('phone')}
          />
        </Field>
      </div>

      <Field label="Password" required error={errors.password}>
        <div className="relative">
          <Input
            type={showPassword ? 'text' : 'password'}
            name="password"
            autoComplete="new-password"
            placeholder="Create a password"
            value={values.password}
            onChange={update('password')}
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

      <PasswordRequirements value={values.password} />

      <Button type="submit" size="lg" className="w-full" loading={submitting}>
        {submitting ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}

/**
 * Live requirement checklist.
 *
 * Shows what is still missing while the user types, rather than rejecting the
 * whole password after submission and making them guess which rule they broke.
 */
function PasswordRequirements({ value }: { value: string }) {
  const rules = [
    { label: 'At least 8 characters', met: value.length >= 8 },
    { label: 'One lowercase letter', met: /[a-z]/.test(value) },
    { label: 'One uppercase letter', met: /[A-Z]/.test(value) },
    { label: 'One number', met: /[0-9]/.test(value) },
  ];

  if (value.length === 0) return null;

  return (
    <ul className="grid gap-1.5 sm:grid-cols-2" aria-label="Password requirements">
      {rules.map((rule) => (
        <li key={rule.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn(
              'flex size-3.5 items-center justify-center rounded-full border transition-colors duration-150',
              rule.met
                ? 'border-success bg-success/12 text-success'
                : 'border-border text-transparent',
            )}
          >
            <Check className="size-2.5" strokeWidth={3} />
          </span>
          <span className={cn('text-xs', rule.met ? 'text-muted' : 'text-subtle')}>
            {rule.label}
            <span className="sr-only">{rule.met ? ' — met' : ' — not yet met'}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
