'use client';

import { ArrowRight, CheckCircle2, Clock, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { PriorityBadge } from '@/components/patterns/indicators';
import { Button } from '@/components/ui/button';
import { CharacterCount, Field, Textarea } from '@/components/ui/field';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Separator,
} from '@/components/ui/primitives';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiError, api, describeError } from '@/lib/api-client';
import { PRIORITIES, PRIORITY_LABELS, STATUS_LABELS } from '@/lib/constants';
import type { ComplaintStatus, Priority } from '@/server/db/schema';

const NOTE_MAX = 1000;

/**
 * Admin action panel.
 *
 * Only the transitions the server will actually accept are offered — the list
 * comes from `allowedTransitions` on the complaint, which the service derives
 * from the same lifecycle table it validates against. The UI therefore cannot
 * present a button that the API would reject.
 *
 * When a complaint is resolved this panel becomes a closed state rather than
 * disabled controls, because "closed" is the product's actual answer, not an
 * error the admin should try to work around.
 */
export function AdminActionsPanel({
  complaintId,
  status,
  priority,
  allowedTransitions,
}: {
  complaintId: string;
  status: ComplaintStatus;
  priority: Priority;
  allowedTransitions: ComplaintStatus[];
}) {
  const router = useRouter();

  const [targetStatus, setTargetStatus] = React.useState<ComplaintStatus | ''>('');
  const [note, setNote] = React.useState('');
  const [savingStatus, setSavingStatus] = React.useState(false);
  const [savingPriority, setSavingPriority] = React.useState(false);

  const closed = allowedTransitions.length === 0;

  async function submitStatus(event: React.FormEvent) {
    event.preventDefault();
    if (!targetStatus) return;

    setSavingStatus(true);
    try {
      const result = await api.patch<{ reference: string }>(
        `/api/admin/complaints/${complaintId}/status`,
        { status: targetStatus, note: note.trim() || undefined },
      );

      const delivered = (result.meta?.notification as { delivered?: boolean } | undefined)?.delivered;

      // Honest reporting: the complaint updated either way, but the resident
      // was only told if the email actually went out. Claiming otherwise would
      // leave an admin believing someone was notified when they were not.
      if (delivered === false) {
        toast.warning('Status updated — notification not sent', {
          description:
            'The change is saved and visible to the resident, but the email could not be delivered. See Admin → Email log.',
        });
      } else {
        toast.success(`Marked ${STATUS_LABELS[targetStatus].toLowerCase()}`, {
          description: 'The resident has been notified by email.',
        });
      }

      setTargetStatus('');
      setNote('');
      router.refresh();
    } catch (caught) {
      const described =
        caught instanceof ApiError && caught.code === 'INVALID_TRANSITION'
          ? { title: 'Change not allowed', description: caught.message }
          : describeError(caught);
      toast.error(described.title, { description: described.description });
    } finally {
      setSavingStatus(false);
    }
  }

  async function changePriority(next: Priority) {
    if (next === priority) return;

    setSavingPriority(true);
    try {
      await api.patch(`/api/admin/complaints/${complaintId}/priority`, { priority: next });
      toast.success(`Priority set to ${PRIORITY_LABELS[next].toLowerCase()}`);
      router.refresh();
    } catch (caught) {
      const described = describeError(caught);
      toast.error(described.title, { description: described.description });
    } finally {
      setSavingPriority(false);
    }
  }

  return (
    <Card className="border-primary-border">
      <CardHeader className="bg-primary-subtle/40">
        <CardTitle>Manage complaint</CardTitle>
      </CardHeader>

      <CardBody className="space-y-5">
        {/* ---------------- Priority ---------------- */}
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">
            Priority
          </p>
          <div
            role="radiogroup"
            aria-label="Complaint priority"
            className="grid grid-cols-3 gap-1.5"
          >
            {PRIORITIES.map((option) => {
              const active = option === priority;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={savingPriority || closed}
                  onClick={() => void changePriority(option)}
                  className={[
                    'rounded-md border px-2 py-1.5 text-xs font-medium transition-colors duration-120',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    active
                      ? option === 'HIGH'
                        ? 'border-priority-high/40 bg-priority-high-bg text-priority-high'
                        : option === 'MEDIUM'
                          ? 'border-priority-medium/40 bg-priority-medium-bg text-priority-medium'
                          : 'border-priority-low/40 bg-priority-low-bg text-priority-low'
                      : 'border-border-strong text-muted hover:bg-surface-sunken',
                  ].join(' ')}
                >
                  {PRIORITY_LABELS[option]}
                </button>
              );
            })}
          </div>
          {closed ? (
            <p className="mt-1.5 text-[11px] text-subtle">
              Priority is locked once a complaint is closed.
            </p>
          ) : null}
        </div>

        <Separator />

        {/* ---------------- Status ---------------- */}
        {closed ? (
          <div className="flex items-start gap-2.5 rounded-md border border-status-resolved-border bg-status-resolved-bg px-3 py-2.5">
            <Lock className="mt-px size-4 shrink-0 text-status-resolved" aria-hidden />
            <div>
              <p className="text-[13px] font-medium text-status-resolved">
                This complaint is closed
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">
                Resolved complaints are final and cannot be reopened. If the issue recurs, the
                resident should raise a new complaint so it gets its own record and history.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={submitStatus} className="space-y-3.5">
            <Field label="Change status" hint="The resident is emailed as soon as this is saved.">
              <Select
                value={targetStatus}
                onValueChange={(value) => setTargetStatus(value as ComplaintStatus)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={`Currently ${STATUS_LABELS[status]}`} />
                </SelectTrigger>
                <SelectContent>
                  {allowedTransitions.map((option) => (
                    <SelectItem
                      key={option}
                      value={option}
                      indicator={
                        option === 'RESOLVED' ? (
                          <CheckCircle2 className="size-3.5 text-status-resolved" />
                        ) : (
                          <Clock className="size-3.5 text-status-progress" />
                        )
                      }
                      description={
                        option === 'RESOLVED'
                          ? 'Closes the complaint permanently'
                          : 'Work has started on this issue'
                      }
                    >
                      {STATUS_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Note"
              hint="Optional. Included in the resident's email and kept permanently in the history."
            >
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                maxLength={NOTE_MAX}
                placeholder="e.g. Plumber scheduled for Thursday between 10 AM and 12 PM."
              />
              <div className="flex justify-end pt-1">
                <CharacterCount value={note} max={NOTE_MAX} />
              </div>
            </Field>

            <Button
              type="submit"
              className="w-full"
              loading={savingStatus}
              disabled={!targetStatus}
            >
              {!savingStatus ? <ArrowRight aria-hidden /> : null}
              {savingStatus
                ? 'Saving…'
                : targetStatus
                  ? `Mark ${STATUS_LABELS[targetStatus]}`
                  : 'Select a status'}
            </Button>
          </form>
        )}

        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-[11px] text-subtle">Current priority</span>
          <PriorityBadge priority={priority} size="sm" />
        </div>
      </CardBody>
    </Card>
  );
}
