/**
 * Overdue detection — the single source of truth.
 *
 * The rule, stated once:
 *
 *     a complaint is overdue when it is not RESOLVED
 *     and it was created more than `thresholdDays` ago
 *
 * Two properties of this design matter:
 *
 *  1. Overdue is **derived, never stored**. A boolean column would need a
 *     nightly job to stay true, would go stale the instant an admin changed
 *     the threshold, and would create a second source of truth that can
 *     silently disagree with the first. Deriving it means changing the
 *     threshold from 7 days to 3 instantly and consistently re-classifies
 *     every open complaint — in the list, the dashboard count, the badge and
 *     the email — with no migration and no backfill.
 *
 *  2. The threshold is **runtime configuration**, read from `app_settings`,
 *     not from an environment variable. `OVERDUE_THRESHOLD_DAYS` seeds the
 *     initial row and is ignored thereafter.
 *
 * Every consumer — the SQL filter builder, the API serializer and the UI badge
 * — calls into this module. The rule is never restated anywhere else.
 */
import type { ComplaintStatus } from '@/server/db/schema';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface OverdueInput {
  status: ComplaintStatus;
  createdAt: Date;
  resolvedAt?: Date | null;
}

export interface OverdueState {
  /** True when the complaint has breached the threshold and is still open. */
  isOverdue: boolean;
  /** Whole days the complaint has been open (or took to resolve). */
  daysOpen: number;
  /** Days past the threshold. 0 when not overdue. */
  overdueByDays: number;
  /** The moment this complaint becomes overdue. */
  dueAt: Date;
}

/**
 * The cutoff timestamp: any unresolved complaint created before this is overdue.
 * Shared by the in-memory check and the SQL predicate so the two cannot drift.
 */
export function overdueCutoff(thresholdDays: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - thresholdDays * MS_PER_DAY);
}

export function computeOverdueState(
  complaint: OverdueInput,
  thresholdDays: number,
  now: Date = new Date(),
): OverdueState {
  const createdMs = complaint.createdAt.getTime();
  const dueAt = new Date(createdMs + thresholdDays * MS_PER_DAY);

  // For a resolved complaint, "days open" means how long it took to resolve —
  // the clock stops at resolution rather than running forever.
  const endMs =
    complaint.status === 'RESOLVED' ? (complaint.resolvedAt?.getTime() ?? now.getTime()) : now.getTime();

  const daysOpen = Math.max(0, Math.floor((endMs - createdMs) / MS_PER_DAY));

  // A resolved complaint is never overdue, whatever its age. This is the
  // requirement "resolved complaints should not become overdue", enforced in
  // the one place the rule lives.
  const isOverdue = complaint.status !== 'RESOLVED' && now.getTime() > dueAt.getTime();

  const overdueByDays = isOverdue
    ? Math.max(1, Math.floor((now.getTime() - dueAt.getTime()) / MS_PER_DAY) + 1)
    : 0;

  return { isOverdue, daysOpen, overdueByDays, dueAt };
}

/**
 * Severity band used by the UI to distinguish "just tipped over" from
 * "badly neglected" without inventing a second business rule — it is purely a
 * presentation concern derived from the same numbers.
 */
export function overdueSeverity(overdueByDays: number): 'none' | 'mild' | 'severe' {
  if (overdueByDays <= 0) return 'none';
  return overdueByDays >= 7 ? 'severe' : 'mild';
}
