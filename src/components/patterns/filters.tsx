'use client';

import { Filter, Search, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import {
  CATEGORY_LABELS,
  COMPLAINT_CATEGORIES,
  COMPLAINT_STATUSES,
  PRIORITIES,
  PRIORITY_LABELS,
  STATUS_LABELS,
} from '@/lib/constants';
import { cn } from '@/lib/utils';

import { Button } from '../ui/button';
import { Input } from '../ui/field';

/**
 * Complaint filters.
 *
 * Filter state lives in the URL, not in component state. That makes a filtered
 * view shareable and bookmarkable, survives a refresh, keeps the browser's
 * back button meaningful, and — because the page is a server component — means
 * every filter change is executed as SQL rather than by filtering an array in
 * the browser.
 *
 * On desktop the controls sit inline. Below `md` they collapse into a sheet
 * with a count badge, because eight filter controls stacked vertically would
 * push the actual results off the screen.
 */

export interface FilterConfig {
  showPriority?: boolean;
  showOverdue?: boolean;
  showDates?: boolean;
}

export function ComplaintFilters({
  config = { showPriority: true, showOverdue: true, showDates: true },
  resultCount,
}: {
  config?: FilterConfig;
  resultCount?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState(searchParams.get('q') ?? '');

  /**
   * Keep the input in step when the URL changes from elsewhere — a KPI link,
   * the back button, "clear all". Adjusted during render rather than in an
   * effect, so the box never paints the previous query for a frame first.
   */
  const urlQuery = searchParams.get('q') ?? '';
  const [lastUrlQuery, setLastUrlQuery] = React.useState(urlQuery);
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setSearchValue(urlQuery);
  }

  const setParam = React.useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
      // Any filter change returns to page 1 — staying on page 4 of a result
      // set that now has two pages shows an empty screen.
      next.delete('page');
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Debounced so typing does not fire a query per keystroke.
  React.useEffect(() => {
    if (searchValue === urlQuery) return;
    const timer = setTimeout(() => setParam('q', searchValue || null), 350);
    return () => clearTimeout(timer);
  }, [searchValue, urlQuery, setParam]);

  const activeCount = ['status', 'category', 'priority', 'overdue', 'from', 'to'].filter((key) =>
    searchParams.get(key),
  ).length;

  function clearAll() {
    router.push(pathname, { scroll: false });
    setSearchValue('');
    setSheetOpen(false);
  }

  const controls = (
    <>
      <FilterSelect
        label="Status"
        value={searchParams.get('status')}
        onChange={(value) => setParam('status', value)}
        options={COMPLAINT_STATUSES.map((status) => ({
          value: status,
          label: STATUS_LABELS[status],
        }))}
      />

      <FilterSelect
        label="Category"
        value={searchParams.get('category')}
        onChange={(value) => setParam('category', value)}
        options={COMPLAINT_CATEGORIES.map((category) => ({
          value: category,
          label: CATEGORY_LABELS[category],
        }))}
      />

      {config.showPriority ? (
        <FilterSelect
          label="Priority"
          value={searchParams.get('priority')}
          onChange={(value) => setParam('priority', value)}
          options={PRIORITIES.map((priority) => ({
            value: priority,
            label: PRIORITY_LABELS[priority],
          }))}
        />
      ) : null}

      {config.showOverdue ? (
        <FilterSelect
          label="Overdue"
          value={searchParams.get('overdue')}
          onChange={(value) => setParam('overdue', value)}
          options={[
            { value: 'true', label: 'Overdue only' },
            { value: 'false', label: 'Within window' },
          ]}
        />
      ) : null}

      {config.showDates ? (
        <>
          <FilterDate
            label="From"
            value={searchParams.get('from')}
            onChange={(value) => setParam('from', value)}
          />
          <FilterDate
            label="To"
            value={searchParams.get('to')}
            onChange={(value) => setParam('to', value)}
          />
        </>
      ) : null}
    </>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <Input
            type="search"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Search reference, title or description"
            aria-label="Search complaints"
            className="pl-8"
          />
        </div>

        {/* Desktop: inline controls */}
        <div className="hidden flex-wrap items-center gap-2 md:flex">{controls}</div>

        {/* Mobile: one button that opens a sheet */}
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={() => setSheetOpen(true)}
          className="md:hidden"
        >
          <Filter aria-hidden />
          Filters
          {activeCount > 0 ? (
            <span className="ml-0.5 rounded bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground tabular">
              {activeCount}
            </span>
          ) : null}
        </Button>

        {activeCount > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={clearAll}
            className="hidden md:inline-flex"
          >
            <X aria-hidden />
            Clear
          </Button>
        ) : null}
      </div>

      {resultCount !== undefined ? (
        <p className="text-xs text-subtle" aria-live="polite">
          {resultCount === 0
            ? 'No complaints match these filters'
            : `${resultCount} ${resultCount === 1 ? 'complaint' : 'complaints'}${activeCount > 0 || searchValue ? ' matching' : ''}`}
        </p>
      ) : null}

      {/* ---------------- Mobile filter sheet ---------------- */}
      {sheetOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-foreground/25 animate-fade-in"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filter complaints"
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-xl border-t border-border bg-surface p-4 animate-rise-in"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Filters</h2>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Close filters"
                className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-sunken"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 [&>*]:w-full">{controls}</div>

            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={clearAll}
                disabled={activeCount === 0}
              >
                Clear all
              </Button>
              <Button type="button" className="flex-1" onClick={() => setSheetOpen(false)}>
                Show results
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A styled native <select>.
 *
 * Deliberately native here rather than the Radix Select used in forms: on
 * mobile this gives the OS picker, which is faster to operate one-handed and
 * needs no custom keyboard handling.
 */
function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const active = Boolean(value);

  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        className={cn(
          'h-9 min-w-0 cursor-pointer appearance-none rounded-md border bg-surface py-0 pl-3 pr-7 text-[13px]',
          'transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20',
          active
            ? 'border-primary-border bg-primary-subtle font-medium text-primary'
            : 'border-border-strong text-muted',
        )}
      >
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className={cn(
          'pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2',
          active ? 'text-primary' : 'text-subtle',
        )}
      >
        <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    </label>
  );
}

function FilterDate({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">{label} date</span>
      <input
        type="date"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        aria-label={`${label} date`}
        className={cn(
          'h-9 cursor-pointer rounded-md border bg-surface px-2.5 text-[13px]',
          'transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20',
          value
            ? 'border-primary-border bg-primary-subtle font-medium text-primary'
            : 'border-border-strong text-muted',
        )}
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  function goTo(nextPage: number) {
    const next = new URLSearchParams(searchParams.toString());
    next.set('page', String(nextPage));
    router.push(`${pathname}?${next.toString()}`, { scroll: true });
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      className="flex items-center justify-between gap-4 border-t border-border pt-4"
      aria-label="Pagination"
    >
      <p className="text-xs text-subtle tabular">
        Showing <span className="font-medium text-muted">{from}</span>–
        <span className="font-medium text-muted">{to}</span> of{' '}
        <span className="font-medium text-muted">{total}</span>
      </p>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => goTo(page - 1)}
          disabled={page <= 1}
        >
          Previous
        </Button>
        <span className="text-xs text-subtle tabular" aria-current="page">
          {page} / {totalPages}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => goTo(page + 1)}
          disabled={page >= totalPages}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
