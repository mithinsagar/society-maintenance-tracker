'use client';

import { AlertCircle, Info, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { PhotoUpload, type UploadedPhoto } from '@/components/patterns/photo-upload';
import { Button } from '@/components/ui/button';
import { CharacterCount, Field, Input, Textarea } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardBody, CardFooter } from '@/components/ui/primitives';
import { ApiError, api, describeError } from '@/lib/api-client';
import { CATEGORY_HINTS, CATEGORY_LABELS, COMPLAINT_CATEGORIES } from '@/lib/constants';
import { createComplaintSchema } from '@/lib/validation';
import type { ComplaintCategory } from '@/server/db/schema';

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 4000;

/**
 * Complaint creation form.
 *
 * Validated with the same Zod schema the API enforces, so the guidance the
 * resident sees matches the rules exactly. The photo is uploaded before
 * submission and only its verified identifier travels with the form, which
 * keeps the request small and lets the upload fail and retry independently of
 * everything else the resident has typed.
 */
export function ComplaintForm({
  flatNumber,
  overdueThresholdDays,
}: {
  flatNumber: string;
  overdueThresholdDays: number;
}) {
  const router = useRouter();

  const [category, setCategory] = React.useState<ComplaintCategory | ''>('');
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [photo, setPhoto] = React.useState<UploadedPhoto | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  function clearError(field: string) {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = createComplaintSchema.safeParse({
      title,
      description,
      category: category || undefined,
      photo,
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === 'category' ? 'category' : issue.path.join('.');
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      // Move focus to the first problem rather than leaving the user to hunt.
      document
        .querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      const { data } = await api.post<{ id: string; reference: string }>(
        '/api/complaints',
        parsed.data,
      );

      toast.success(`Complaint ${data.reference} submitted`, {
        description: 'The maintenance team has been notified. You can track it from here.',
      });

      router.push(`/complaints/${data.id}`);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError && caught.details?.length) {
        setErrors(caught.fieldErrors);
      } else {
        const described = describeError(caught);
        setFormError(described.description ?? described.title);
      }
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl" noValidate>
      <Card>
        <CardBody className="space-y-5">
          {formError ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-md border border-danger/25 bg-danger-bg px-3 py-2.5"
            >
              <AlertCircle className="mt-px size-4 shrink-0 text-danger" aria-hidden />
              <p className="text-[13px] leading-relaxed text-danger">{formError}</p>
            </div>
          ) : null}

          <Field
            label="Category"
            required
            error={errors.category}
            hint="Choosing the right category routes your complaint to the correct team."
          >
            <Select
              value={category}
              onValueChange={(value) => {
                setCategory(value as ComplaintCategory);
                clearError('category');
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select the type of issue" />
              </SelectTrigger>
              <SelectContent>
                {COMPLAINT_CATEGORIES.map((option) => (
                  <SelectItem key={option} value={option} description={CATEGORY_HINTS[option]}>
                    {CATEGORY_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Title"
            required
            error={errors.title}
            hint="A short summary the committee will see in their queue."
          >
            <Input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                clearError('title');
              }}
              placeholder="e.g. No water supply in the morning hours"
              maxLength={TITLE_MAX}
            />
          </Field>

          <Field label="Description" required error={errors.description}>
            <Textarea
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                clearError('description');
              }}
              placeholder="Describe what is happening, since when, and anything you have already tried or reported. Include the exact location if it is in a common area."
              rows={7}
              maxLength={DESCRIPTION_MAX}
            />
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-subtle">
                More detail means fewer follow-up visits.
              </span>
              <CharacterCount value={description} max={DESCRIPTION_MAX} />
            </div>
          </Field>

          <Field label="Photo" hint="Optional, but it usually speeds up resolution considerably.">
            <PhotoUpload value={photo} onChange={setPhoto} disabled={submitting} />
          </Field>

          <div className="flex items-start gap-2.5 rounded-md border border-border bg-surface-sunken px-3 py-2.5">
            <Info className="mt-px size-4 shrink-0 text-subtle" aria-hidden />
            <p className="text-xs leading-relaxed text-subtle">
              This complaint will be filed against flat{' '}
              <span className="font-medium text-muted">{flatNumber}</span>. You will receive an
              email each time its status changes. If it is not addressed within{' '}
              <span className="font-medium text-muted">{overdueThresholdDays} days</span>, it will
              be flagged as overdue and surface at the top of the committee&rsquo;s queue.
            </p>
          </div>
        </CardBody>

        <CardFooter>
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {!submitting ? <Send aria-hidden /> : null}
            {submitting ? 'Submitting…' : 'Submit complaint'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
