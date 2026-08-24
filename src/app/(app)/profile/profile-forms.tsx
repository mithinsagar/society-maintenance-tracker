'use client';

import { KeyRound, Save, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import {
  Card,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DetailList,
  DetailRow,
} from '@/components/ui/primitives';
import { ApiError, api, describeError } from '@/lib/api-client';
import { ROLE_LABELS } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import { changePasswordSchema, updateProfileSchema } from '@/lib/validation';
import type { Role } from '@/server/db/schema';

interface ProfileUser {
  fullName: string;
  email: string;
  flatNumber: string;
  phone: string | null;
  role: Role;
  createdAt: string;
}

export function ProfileForms({ user }: { user: ProfileUser }) {
  return (
    <div className="space-y-5">
      <DetailsForm user={user} />
      <PasswordForm />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Account</CardTitle>
            <CardDescription>Details that cannot be changed from here.</CardDescription>
          </div>
        </CardHeader>
        <CardBody className="py-1">
          <DetailList>
            <DetailRow label="Email">{user.email}</DetailRow>
            <DetailRow label="Role">{ROLE_LABELS[user.role]}</DetailRow>
            <DetailRow label="Member since">{formatDate(user.createdAt)}</DetailRow>
          </DetailList>
        </CardBody>
      </Card>
    </div>
  );
}

function DetailsForm({ user }: { user: ProfileUser }) {
  const router = useRouter();
  const [values, setValues] = React.useState({
    fullName: user.fullName,
    flatNumber: user.flatNumber,
    phone: user.phone ?? '',
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  const dirty =
    values.fullName !== user.fullName ||
    values.flatNumber !== user.flatNumber ||
    values.phone !== (user.phone ?? '');

  function update(field: keyof typeof values) {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
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

    const parsed = updateProfileSchema.safeParse({
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
    setSaving(true);

    try {
      await api.patch('/api/auth/profile', parsed.data);
      toast.success('Profile updated');
      // Refresh so the shell's user menu picks up the new name immediately.
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError && caught.details?.length) {
        setErrors(caught.fieldErrors);
      } else {
        const described = describeError(caught);
        toast.error(described.title, { description: described.description });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Your details</CardTitle>
            <CardDescription>
              The committee uses these to reach you about your complaints.
            </CardDescription>
          </div>
        </CardHeader>

        <CardBody className="space-y-4">
          <Field label="Full name" required error={errors.fullName}>
            <Input value={values.fullName} onChange={update('fullName')} autoComplete="name" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Flat number" required error={errors.flatNumber} hint="For example, B-1204">
              <Input value={values.flatNumber} onChange={update('flatNumber')} />
            </Field>
            <Field label="Phone" error={errors.phone} hint="Optional">
              <Input
                type="tel"
                value={values.phone}
                onChange={update('phone')}
                autoComplete="tel"
                placeholder="+91 98450 11234"
              />
            </Field>
          </div>
        </CardBody>

        <CardFooter>
          <p className="text-xs text-subtle">
            {dirty ? 'You have unsaved changes.' : 'All changes saved.'}
          </p>
          <Button type="submit" size="sm" loading={saving} disabled={!dirty}>
            {!saving ? <Save aria-hidden /> : null}
            Save changes
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

function PasswordForm() {
  const [values, setValues] = React.useState({ currentPassword: '', newPassword: '' });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const parsed = changePasswordSchema.safeParse(values);
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
    setSaving(true);

    try {
      await api.post('/api/auth/change-password', parsed.data);
      setValues({ currentPassword: '', newPassword: '' });
      toast.success('Password changed', {
        description: 'You have been signed out on all your other devices.',
      });
    } catch (caught) {
      if (caught instanceof ApiError && caught.details?.length) {
        setErrors(caught.fieldErrors);
      } else {
        const described = describeError(caught);
        toast.error(described.title, { description: described.description });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              Changing your password signs you out everywhere else.
            </CardDescription>
          </div>
          <ShieldCheck className="size-4 shrink-0 text-subtle" aria-hidden />
        </CardHeader>

        <CardBody className="space-y-4">
          <Field label="Current password" required error={errors.currentPassword}>
            <Input
              type="password"
              autoComplete="current-password"
              value={values.currentPassword}
              onChange={(event) =>
                setValues((current) => ({ ...current, currentPassword: event.target.value }))
              }
            />
          </Field>

          <Field
            label="New password"
            required
            error={errors.newPassword}
            hint="At least 8 characters, with an uppercase letter, a lowercase letter and a number."
          >
            <Input
              type="password"
              autoComplete="new-password"
              value={values.newPassword}
              onChange={(event) =>
                setValues((current) => ({ ...current, newPassword: event.target.value }))
              }
            />
          </Field>
        </CardBody>

        <CardFooter>
          <span />
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            loading={saving}
            disabled={!values.currentPassword || !values.newPassword}
          >
            {!saving ? <KeyRound aria-hidden /> : null}
            Change password
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
