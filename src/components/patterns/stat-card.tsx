import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * KPI tile.
 *
 * The number is the loudest thing in the tile; the label and icon sit quiet
 * beneath it. Tone is applied to the icon and the value only — a fully tinted
 * card would turn a row of five KPIs into a colour chart nobody can read.
 *
 * Renders as a link when `href` is given, so a KPI is also a filter shortcut:
 * clicking "Overdue: 5" should take you to those five.
 */

const TONES = {
  neutral: { icon: 'text-subtle bg-surface-sunken', value: 'text-foreground' },
  primary: { icon: 'text-primary bg-primary-subtle', value: 'text-foreground' },
  open: { icon: 'text-status-open bg-status-open-bg', value: 'text-foreground' },
  progress: { icon: 'text-status-progress bg-status-progress-bg', value: 'text-foreground' },
  resolved: { icon: 'text-status-resolved bg-status-resolved-bg', value: 'text-foreground' },
  overdue: { icon: 'text-status-overdue bg-status-overdue-bg', value: 'text-status-overdue' },
} as const;

export type StatTone = keyof typeof TONES;

export interface StatCardProps {
  label: string;
  value: number | string;
  hint?: string;
  icon: LucideIcon;
  tone?: StatTone;
  href?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  href,
  className,
}: StatCardProps) {
  const styles = TONES[tone];

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wider text-subtle">{label}</span>
        <span
          className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', styles.icon)}
        >
          <Icon className="size-3.5" aria-hidden />
        </span>
      </div>

      <p className={cn('mt-3 text-2xl font-semibold tracking-tight tabular', styles.value)}>
        {value}
      </p>

      {hint ? <p className="mt-1 text-[11px] leading-snug text-subtle">{hint}</p> : null}
    </>
  );

  const base = cn(
    'rounded-lg border border-border bg-surface p-4',
    href &&
      'transition-colors duration-150 hover:border-border-strong hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    className,
  );

  if (href) {
    return (
      <Link href={href} className={cn(base, 'block')}>
        {content}
      </Link>
    );
  }

  return <div className={base}>{content}</div>;
}

export function StatCardGrid({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      // 2-up on phones rather than a single stacked column, so the headline
      // numbers stay comparable without scrolling.
      className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}
      {...props}
    />
  );
}
