import {
  ArrowRight,
  CheckCircle2,
  ChevronsUp,
  Circle,
  Clock,
  FileText,
  Flag,
} from 'lucide-react';
import * as React from 'react';

import { LIFECYCLE_ORDER, PRIORITY_LABELS, ROLE_LABELS, STATUS_LABELS } from '@/lib/constants';
import { cn, formatDateTime, formatRelative } from '@/lib/utils';
import type { ComplaintStatus } from '@/server/db/schema';
import type { SerializedEvent } from '@/server/services/complaint.service';

import { Avatar } from '../ui/primitives';

/**
 * The lifecycle spine.
 *
 * This is the signature screen element of the product and the clearest
 * expression of the assignment's central requirement: the complaint's entire
 * history, reconstructed from the immutable event log, with actor, timestamp,
 * transition and note on every entry.
 *
 * Two components:
 *   • `LifecycleProgress` — the OPEN → IN PROGRESS → RESOLVED rail, showing
 *     where the complaint sits in its lifecycle at a glance.
 *   • `EventTimeline` — the full audit trail, every event, in order.
 */

// ---------------------------------------------------------------------------
// Lifecycle progress rail
// ---------------------------------------------------------------------------

const STAGE_ICON: Record<ComplaintStatus, React.ComponentType<{ className?: string }>> = {
  OPEN: Circle,
  IN_PROGRESS: Clock,
  RESOLVED: CheckCircle2,
};

export function LifecycleProgress({
  status,
  isOverdue,
  className,
}: {
  status: ComplaintStatus;
  isOverdue?: boolean;
  className?: string;
}) {
  const currentIndex = LIFECYCLE_ORDER.indexOf(status);

  return (
    <ol className={cn('flex items-center', className)} aria-label="Complaint lifecycle">
      {LIFECYCLE_ORDER.map((stage, index) => {
        const isComplete = index < currentIndex;
        const isCurrent = index === currentIndex;
        const Icon = STAGE_ICON[stage];

        return (
          <li key={stage} className={cn('flex items-center', index > 0 && 'flex-1')}>
            {index > 0 ? (
              <span
                aria-hidden
                className={cn(
                  'h-px flex-1 transition-colors duration-300',
                  index <= currentIndex ? 'bg-primary/40' : 'bg-border',
                )}
              />
            ) : null}

            <span className="flex items-center gap-2 px-1">
              <span
                className={cn(
                  'flex size-6 items-center justify-center rounded-full border transition-colors duration-200 [&_svg]:size-3.5',
                  isComplete && 'border-primary/40 bg-primary/10 text-primary',
                  isCurrent &&
                    stage !== 'RESOLVED' &&
                    'border-status-progress bg-status-progress-bg text-status-progress animate-pulse-ring',
                  isCurrent && stage === 'RESOLVED' && 'border-status-resolved bg-status-resolved-bg text-status-resolved',
                  !isComplete && !isCurrent && 'border-border bg-surface-sunken text-subtle',
                )}
              >
                <Icon aria-hidden />
              </span>

              <span
                className={cn(
                  'text-xs font-medium whitespace-nowrap',
                  isCurrent ? 'text-foreground' : isComplete ? 'text-muted' : 'text-subtle',
                )}
              >
                {STATUS_LABELS[stage]}
                <span className="sr-only">
                  {isCurrent ? ' (current stage)' : isComplete ? ' (completed)' : ' (pending)'}
                </span>
              </span>
            </span>
          </li>
        );
      })}

      {isOverdue ? (
        <li className="ml-3 hidden sm:block">
          <span className="text-xs font-medium text-status-overdue">Past due</span>
        </li>
      ) : null}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Event timeline
// ---------------------------------------------------------------------------

function eventVisual(event: SerializedEvent) {
  if (event.type === 'CREATED') {
    return { Icon: FileText, tone: 'text-muted border-border bg-surface-sunken' };
  }
  if (event.type === 'PRIORITY_CHANGED') {
    return { Icon: ChevronsUp, tone: 'text-priority-medium border-priority-medium/30 bg-priority-medium-bg' };
  }
  if (event.toStatus === 'RESOLVED') {
    return { Icon: CheckCircle2, tone: 'text-status-resolved border-status-resolved-border bg-status-resolved-bg' };
  }
  if (event.toStatus === 'IN_PROGRESS') {
    return { Icon: Clock, tone: 'text-status-progress border-status-progress-border bg-status-progress-bg' };
  }
  return { Icon: Flag, tone: 'text-status-open border-status-open-border bg-status-open-bg' };
}

function eventHeadline(event: SerializedEvent): React.ReactNode {
  if (event.type === 'CREATED') return 'Complaint raised';

  if (event.type === 'PRIORITY_CHANGED') {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        Priority changed
        <span className="inline-flex items-center gap-1.5 text-muted">
          <span>{PRIORITY_LABELS[event.fromPriority!]}</span>
          <ArrowRight className="size-3" aria-hidden />
          <span className="font-semibold text-foreground">{PRIORITY_LABELS[event.toPriority!]}</span>
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      Status changed
      <span className="inline-flex items-center gap-1.5 text-muted">
        <span>{STATUS_LABELS[event.fromStatus!]}</span>
        <ArrowRight className="size-3" aria-hidden />
        <span className="font-semibold text-foreground">{STATUS_LABELS[event.toStatus!]}</span>
      </span>
    </span>
  );
}

export function EventTimeline({
  events,
  className,
}: {
  events: SerializedEvent[];
  className?: string;
}) {
  if (events.length === 0) {
    return <p className="py-6 text-center text-[13px] text-subtle">No history recorded yet.</p>;
  }

  return (
    <ol className={cn('relative', className)}>
      {events.map((event, index) => {
        const { Icon, tone } = eventVisual(event);
        const isLast = index === events.length - 1;

        return (
          <li key={event.id} className="relative flex gap-3.5 pb-6 last:pb-0">
            {/* The continuous connector that makes this read as one thread. */}
            {!isLast ? (
              <span aria-hidden className="absolute left-[13px] top-7 bottom-0 w-px bg-border" />
            ) : null}

            <span
              className={cn(
                'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border [&_svg]:size-3.5',
                tone,
              )}
            >
              <Icon aria-hidden />
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-[13px] font-medium text-foreground">{eventHeadline(event)}</p>
                <time
                  dateTime={event.createdAt}
                  title={formatDateTime(event.createdAt)}
                  className="shrink-0 text-xs text-subtle tabular"
                >
                  {formatRelative(event.createdAt)}
                </time>
              </div>

              <div className="mt-1.5 flex items-center gap-1.5">
                <Avatar name={event.actor.fullName} size="sm" />
                <span className="text-xs text-muted">
                  {event.actor.fullName}
                  <span className="text-subtle"> · {ROLE_LABELS[event.actor.role]}</span>
                </span>
              </div>

              {event.note ? (
                <div className="mt-2.5 rounded-r-md border-l-2 border-primary/40 bg-surface-sunken py-2 pl-3 pr-3">
                  <p className="text-[13px] leading-relaxed text-muted whitespace-pre-wrap">
                    {event.note}
                  </p>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
