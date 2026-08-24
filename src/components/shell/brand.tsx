import { cn } from '@/lib/utils';

/**
 * Wordmark.
 *
 * A drawn mark rather than an icon-font glyph: three stacked bars in the
 * primary teal, reading as both a building elevation and a stack of records.
 * It is small, deliberate, and does not look like a stock dashboard logo.
 */
export function Brand({
  societyName = 'Greenwood Heights',
  compact,
  className,
}: {
  societyName?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('flex items-center gap-2.5 select-none', className)}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary">
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
          <rect x="2" y="9.5" width="12" height="1.75" rx="0.6" fill="white" opacity="0.55" />
          <rect x="2" y="6.5" width="9" height="1.75" rx="0.6" fill="white" opacity="0.8" />
          <rect x="2" y="3.5" width="6" height="1.75" rx="0.6" fill="white" />
        </svg>
      </span>

      {!compact ? (
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold leading-tight tracking-tight text-foreground">
            {societyName}
          </span>
          <span className="block text-[11px] leading-tight text-subtle">Maintenance Tracker</span>
        </span>
      ) : null}
    </span>
  );
}
