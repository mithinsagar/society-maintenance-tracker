'use client';

import { Info, Save, Timer } from 'lucide-react';
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
} from '@/components/ui/primitives';
import { ApiError, api, describeError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { updateSettingsSchema } from '@/lib/validation';

const CANDIDATES = [3, 5, 7, 10, 14, 30];

/**
 * Settings form.
 *
 * The threshold picker shows, for each candidate, how many complaints would
 * immediately become overdue. That preview is only possible because overdue is
 * a derived value — if it were a stored column, answering this would mean a
 * backfill, and changing it would mean a migration.
 */
export function SettingsForm({
  societyName: initialName,
  overdueThresholdDays: initialThreshold,
  preview,
}: {
  societyName: string;
  overdueThresholdDays: number;
  preview: Record<number, number>;
}) {
  const router = useRouter();
  const [societyName, setSocietyName] = React.useState(initialName);
  const [threshold, setThreshold] = React.useState(initialThreshold);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  const dirty = societyName !== initialName || threshold !== initialThreshold;
  const impact = preview[threshold];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const parsed = updateSettingsSchema.safeParse({
      societyName,
      overdueThresholdDays: threshold,
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
      await api.patch('/api/admin/settings', parsed.data);
      toast.success('Settings saved', {
        description:
          threshold !== initialThreshold
            ? `Overdue detection now uses a ${threshold}-day window across the whole product.`
            : undefined,
      });
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
            <CardTitle>Society</CardTitle>
            <CardDescription>
              Shown in the navigation, on the notice board and in every email.
            </CardDescription>
          </div>
        </CardHeader>

        <CardBody className="space-y-6">
          <Field label="Society name" required error={errors.societyName}>
            <Input
              value={societyName}
              onChange={(event) => setSocietyName(event.target.value)}
              maxLength={120}
            />
          </Field>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <Timer className="size-4 text-subtle" aria-hidden />
              <span className="text-[13px] font-medium text-foreground">
                Overdue threshold
              </span>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-subtle">
              A complaint that has not been resolved within this many days of being raised is
              flagged overdue and moves to the top of the queue. Resolved complaints are never
              flagged, however long they took.
            </p>

            <div
              role="radiogroup"
              aria-label="Overdue threshold in days"
              className="grid grid-cols-3 gap-2 sm:grid-cols-6"
            >
              {CANDIDATES.map((days) => {
                const active = threshold === days;
                return (
                  <button
                    key={days}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setThreshold(days)}
                    className={cn(
                      'rounded-md border px-2 py-2 text-center transition-colors duration-120',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                      active
                        ? 'border-primary bg-primary-subtle'
                        : 'border-border-strong hover:bg-surface-sunken',
                    )}
                  >
                    <span
                      className={cn(
                        'block text-sm font-semibold tabular',
                        active ? 'text-primary' : 'text-foreground',
                      )}
                    >
                      {days}d
                    </span>
                    <span
                      className={cn(
                        'mt-0.5 block text-[10px] tabular',
                        preview[days] && preview[days] > 0 ? 'text-status-overdue' : 'text-subtle',
                      )}
                    >
                      {preview[days] ?? 0} overdue
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3">
              <Field label="Custom value (days)" error={errors.overdueThresholdDays}>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={threshold}
                  onChange={(event) => setThreshold(Number(event.target.value))}
                  className="max-w-32"
                />
              </Field>
            </div>

            <div className="mt-3 flex items-start gap-2.5 rounded-md border border-border bg-surface-sunken px-3 py-2.5">
              <Info className="mt-px size-4 shrink-0 text-subtle" aria-hidden />
              <p className="text-xs leading-relaxed text-subtle">
                {impact === undefined ? (
                  <>
                    Overdue status is calculated when a complaint is read, not stored on it — so a
                    change here applies to every complaint instantly, with no backfill.
                  </>
                ) : impact > 0 ? (
                  <>
                    At <span className="font-medium text-muted">{threshold} days</span>,{' '}
                    <span className="font-medium text-status-overdue tabular">{impact}</span>{' '}
                    {impact === 1 ? 'complaint is' : 'complaints are'} currently overdue. Because
                    overdue status is calculated on read rather than stored, this takes effect
                    immediately with no backfill.
                  </>
                ) : (
                  <>
                    At <span className="font-medium text-muted">{threshold} days</span>, no
                    complaints would currently be overdue.
                  </>
                )}
              </p>
            </div>
          </div>
        </CardBody>

        <CardFooter>
          <p className="text-xs text-subtle">
            {dirty ? 'You have unsaved changes.' : 'All changes saved.'}
          </p>
          <Button type="submit" size="sm" loading={saving} disabled={!dirty}>
            {!saving ? <Save aria-hidden /> : null}
            Save settings
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
