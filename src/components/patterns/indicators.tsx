import { AlertTriangle, CheckCircle2, ChevronsUp, Circle, Clock, Minus } from 'lucide-react';
import * as React from 'react';

import { PRIORITY_LABELS, STATUS_LABELS } from '@/lib/constants';
import { cn, formatDayCount } from '@/lib/utils';
import type { ComplaintStatus, Priority } from '@/server/db/schema';

import { Badge } from '../ui/primitives';

/**
 * Status and priority indicators.
 *
 * Every indicator pairs a colour with **both an icon and a text label**. This
 * is the accessibility rule the brief calls out — meaning must never rest on
 * colour alone — and it also makes the interface readable at a glance in a
 * dense table, where a bare colour dot forces the reader to consult a legend.
 */

const STATUS_TONE = {
  OPEN: 'open',
  IN_PROGRESS: 'progress',
  RESOLVED: 'resolved',
} as const;

const STATUS_ICON: Record<ComplaintStatus, React.ComponentType<{ className?: string }>> = {
  OPEN: Circle,
  IN_PROGRESS: Clock,
  RESOLVED: CheckCircle2,
};

export function StatusBadge({
  status,
  size = 'md',
  className,
}: {
  status: ComplaintStatus;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const Icon = STATUS_ICON[status];
  return (
    <Badge tone={STATUS_TONE[status]} size={size} className={className}>
      <Icon aria-hidden />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

const PRIORITY_TONE = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low' } as const;

const PRIORITY_ICON: Record<Priority, React.ComponentType<{ className?: string }>> = {
  HIGH: ChevronsUp,
  MEDIUM: Minus,
  LOW: Minus,
};

export function PriorityBadge({
  priority,
  size = 'md',
  className,
}: {
  priority: Priority;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const Icon = PRIORITY_ICON[priority];
  return (
    <Badge tone={PRIORITY_TONE[priority]} size={size} className={className}>
      <Icon aria-hidden className={priority === 'LOW' ? 'rotate-90' : undefined} />
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}

/**
 * Overdue indicator.
 *
 * The brief asks for this to be obvious but not obnoxious. Terracotta rather
 * than alarm red, a bordered badge rather than a filled block, and the exact
 * number of days rather than a vague warning — an admin triaging a queue needs
 * to know whether something is one day late or three weeks late.
 */
export function OverdueBadge({
  overdueByDays,
  size = 'md',
  className,
}: {
  overdueByDays: number;
  size?: 'sm' | 'md';
  className?: string;
}) {
  if (overdueByDays <= 0) return null;

  return (
    <Badge tone="overdue" size={size} className={className}>
      <AlertTriangle aria-hidden />
      {formatDayCount(overdueByDays)} overdue
    </Badge>
  );
}

/**
 * The coloured rail down the left edge of a complaint row.
 *
 * Encodes status at a glance without adding another badge to an already dense
 * row. Purely decorative — the row always carries a StatusBadge too.
 */
export function StatusRail({
  status,
  isOverdue,
  className,
}: {
  status: ComplaintStatus;
  isOverdue?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'absolute inset-y-0 left-0 w-[3px]',
        isOverdue
          ? 'bg-status-overdue'
          : status === 'OPEN'
            ? 'bg-status-open/50'
            : status === 'IN_PROGRESS'
              ? 'bg-status-progress'
              : 'bg-status-resolved/60',
        className,
      )}
    />
  );
}

/** Monospaced complaint reference — the identifier residents actually quote. */
export function Reference({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn('font-mono text-xs tracking-tight text-muted tabular', className)}>
      {value}
    </span>
  );
}
