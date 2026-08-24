import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn, initials, nameColorIndex } from '@/lib/utils';

/**
 * Surface and layout primitives.
 *
 * Depth here comes from a 1px border plus a background step, never a drop
 * shadow — that restraint is most of what separates this from a template look.
 */

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function Card({
  className,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface',
        interactive &&
          'transition-[border-color,background-color] duration-150 hover:border-border-strong hover:bg-surface-raised',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-start justify-between gap-4 px-5 py-4 border-b border-border', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-sm font-semibold text-foreground', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-0.5 text-xs text-subtle leading-relaxed', className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-5 py-3 border-t border-border bg-surface-sunken/50',
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded font-medium whitespace-nowrap border',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-sunken text-muted border-border',
        primary: 'bg-primary-subtle text-primary border-primary-border',
        open: 'bg-status-open-bg text-status-open border-status-open-border',
        progress: 'bg-status-progress-bg text-status-progress border-status-progress-border',
        resolved: 'bg-status-resolved-bg text-status-resolved border-status-resolved-border',
        overdue: 'bg-status-overdue-bg text-status-overdue border-status-overdue-border',
        high: 'bg-priority-high-bg text-priority-high border-priority-high/25',
        medium: 'bg-priority-medium-bg text-priority-medium border-priority-medium/25',
        low: 'bg-priority-low-bg text-priority-low border-priority-low/25',
        danger: 'bg-danger-bg text-danger border-danger/25',
      },
      size: {
        sm: 'h-5 px-1.5 text-[11px] [&_svg]:size-3',
        md: 'h-6 px-2 text-xs [&_svg]:size-3.5',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

const AVATAR_TONES = [
  'bg-chart-1/15 text-chart-1',
  'bg-chart-2/15 text-chart-2',
  'bg-chart-3/15 text-chart-3',
  'bg-chart-4/15 text-chart-4',
  'bg-chart-5/15 text-chart-5',
  'bg-chart-6/15 text-chart-6',
];

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const tone = AVATAR_TONES[nameColorIndex(name, AVATAR_TONES.length)];

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none',
        size === 'sm' && 'size-6 text-[10px]',
        size === 'md' && 'size-8 text-xs',
        size === 'lg' && 'size-10 text-sm',
        tone,
        className,
      )}
      // Decorative: the name is always rendered as text alongside.
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

export function SectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-subtle">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden {...props} />;
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon ? (
        <div className="mb-4 flex size-11 items-center justify-center rounded-lg border border-border bg-surface-sunken text-subtle [&_svg]:size-5">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-subtle">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Separator
// ---------------------------------------------------------------------------

export function Separator({
  orientation = 'horizontal',
  className,
}: {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        'bg-border shrink-0',
        orientation === 'horizontal' ? 'h-px w-full' : 'w-px self-stretch',
        className,
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Definition list — used by every detail rail in the product.
// ---------------------------------------------------------------------------

export function DetailList({ className, ...props }: React.HTMLAttributes<HTMLDListElement>) {
  return <dl className={cn('divide-y divide-border', className)} {...props} />;
}

export function DetailRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-2.5', className)}>
      <dt className="shrink-0 text-xs text-subtle">{label}</dt>
      <dd className="min-w-0 text-right text-[13px] font-medium text-foreground">{children}</dd>
    </div>
  );
}
