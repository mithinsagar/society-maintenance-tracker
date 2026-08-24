import { ImageIcon, MessageSquare } from 'lucide-react';
import Link from 'next/link';

import { cn, formatRelative, truncate } from '@/lib/utils';
import type { SerializedComplaint } from '@/server/services/complaint.service';

import { Avatar } from '../ui/primitives';

import { OverdueBadge, PriorityBadge, Reference, StatusBadge, StatusRail } from './indicators';

/**
 * The complaint ledger.
 *
 * A table on desktop and stacked cards below `md` — not a table squeezed into
 * a horizontal scroller, which is what makes most admin tools unusable on a
 * phone. Both variants render from the same data and show the same facts;
 * only the arrangement changes.
 *
 * Each row carries a coloured status rail on its left edge so a queue can be
 * scanned by shape before any text is read.
 */

export function ComplaintList({
  complaints,
  basePath,
  showResident = false,
  emptyState,
}: {
  complaints: SerializedComplaint[];
  /** `/complaints` for residents, `/admin/complaints` for admins. */
  basePath: string;
  showResident?: boolean;
  emptyState?: React.ReactNode;
}) {
  if (complaints.length === 0) return <>{emptyState}</>;

  return (
    <>
      {/* ---------------- Desktop table ---------------- */}
      <div className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border bg-surface-sunken/60">
              <Th className="w-[7.5rem] pl-5">Reference</Th>
              <Th>Issue</Th>
              {showResident ? <Th className="w-44">Resident</Th> : null}
              <Th className="w-32">Category</Th>
              <Th className="w-32">Status</Th>
              <Th className="w-28">Priority</Th>
              <Th className="w-32 pr-5 text-right">Raised</Th>
            </tr>
          </thead>
          <tbody className="stagger">
            {complaints.map((complaint) => (
              <tr
                key={complaint.id}
                className="group relative border-b border-border last:border-0 transition-colors hover:bg-surface-sunken/50"
              >
                <td className="relative py-3 pl-5 pr-3 align-top">
                  <StatusRail status={complaint.status} isOverdue={complaint.isOverdue} />
                  <Reference value={complaint.reference} />
                </td>

                <td className="py-3 pr-3 align-top">
                  {/*
                    The link stretches across the row via a pseudo-element, so
                    the whole row is clickable while the accessible name stays
                    exactly the complaint title.
                  */}
                  <Link
                    href={`${basePath}/${complaint.id}`}
                    className="text-[13px] font-medium text-foreground after:absolute after:inset-0 after:content-[''] hover:text-primary focus-visible:outline-none group-focus-within:text-primary"
                  >
                    {complaint.title}
                  </Link>
                  <p className="mt-0.5 line-clamp-1 text-xs text-subtle">
                    {truncate(complaint.description, 110)}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2.5">
                    {complaint.isOverdue ? (
                      <OverdueBadge overdueByDays={complaint.overdueByDays} size="sm" />
                    ) : null}
                    {complaint.photo ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-subtle">
                        <ImageIcon className="size-3" aria-hidden />
                        Photo
                      </span>
                    ) : null}
                  </div>
                </td>

                {showResident ? (
                  <td className="py-3 pr-3 align-top">
                    <span className="flex items-center gap-2">
                      <Avatar name={complaint.resident.fullName} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] text-foreground">
                          {complaint.resident.fullName}
                        </span>
                        <span className="block text-[11px] text-subtle">
                          {complaint.resident.flatNumber}
                        </span>
                      </span>
                    </span>
                  </td>
                ) : null}

                <td className="py-3 pr-3 align-top text-[13px] text-muted">
                  {complaint.categoryLabel}
                </td>
                <td className="py-3 pr-3 align-top">
                  <StatusBadge status={complaint.status} size="sm" />
                </td>
                <td className="py-3 pr-3 align-top">
                  <PriorityBadge priority={complaint.priority} size="sm" />
                </td>
                <td className="py-3 pr-5 align-top text-right">
                  <span className="text-[13px] text-muted tabular">
                    {formatRelative(complaint.createdAt)}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-subtle tabular">
                    {complaint.status === 'RESOLVED'
                      ? `closed in ${complaint.daysOpen}d`
                      : `open ${complaint.daysOpen}d`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------------- Mobile cards ---------------- */}
      <ul className="stagger space-y-2.5 md:hidden">
        {complaints.map((complaint) => (
          <li key={complaint.id}>
            <Link
              href={`${basePath}/${complaint.id}`}
              className="relative block overflow-hidden rounded-lg border border-border bg-surface p-3.5 pl-4 transition-colors hover:border-border-strong active:bg-surface-sunken"
            >
              <StatusRail status={complaint.status} isOverdue={complaint.isOverdue} />

              <div className="flex items-start justify-between gap-3">
                <Reference value={complaint.reference} />
                <span className="shrink-0 text-[11px] text-subtle tabular">
                  {formatRelative(complaint.createdAt)}
                </span>
              </div>

              <p className="mt-1.5 text-[13px] font-medium leading-snug text-foreground">
                {complaint.title}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-subtle">
                {complaint.description}
              </p>

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={complaint.status} size="sm" />
                <PriorityBadge priority={complaint.priority} size="sm" />
                {complaint.isOverdue ? (
                  <OverdueBadge overdueByDays={complaint.overdueByDays} size="sm" />
                ) : null}
              </div>

              <div className="mt-2.5 flex items-center gap-3 border-t border-border pt-2.5 text-[11px] text-subtle">
                <span>{complaint.categoryLabel}</span>
                {showResident ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="truncate">
                      {complaint.resident.fullName} · {complaint.resident.flatNumber}
                    </span>
                  </>
                ) : null}
                {complaint.photo ? (
                  <span className="ml-auto inline-flex items-center gap-1">
                    <ImageIcon className="size-3" aria-hidden />
                    Photo
                  </span>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        'px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-subtle',
        className,
      )}
      {...props}
    />
  );
}

/** Compact card used in dashboard rails, where a full row would be too heavy. */
export function ComplaintMiniRow({
  complaint,
  basePath,
  showResident,
}: {
  complaint: SerializedComplaint;
  basePath: string;
  showResident?: boolean;
}) {
  return (
    <Link
      href={`${basePath}/${complaint.id}`}
      className="group relative flex items-start gap-3 rounded-md border border-transparent px-2.5 py-2.5 transition-colors hover:border-border hover:bg-surface-sunken/60"
    >
      <span
        aria-hidden
        className={cn(
          'mt-1.5 size-1.5 shrink-0 rounded-full',
          complaint.isOverdue
            ? 'bg-status-overdue'
            : complaint.status === 'IN_PROGRESS'
              ? 'bg-status-progress'
              : complaint.status === 'RESOLVED'
                ? 'bg-status-resolved'
                : 'bg-status-open',
        )}
      />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-medium text-foreground group-hover:text-primary">
            {complaint.title}
          </span>
          <span className="shrink-0 text-[11px] text-subtle tabular">
            {formatRelative(complaint.createdAt)}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-subtle">
          <Reference value={complaint.reference} className="text-[11px]" />
          <span aria-hidden>·</span>
          <span>{complaint.categoryLabel}</span>
          {showResident ? (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{complaint.resident.flatNumber}</span>
            </>
          ) : null}
          {complaint.isOverdue ? (
            <span className="ml-auto shrink-0 font-medium text-status-overdue">
              {complaint.overdueByDays}d overdue
            </span>
          ) : null}
        </span>
      </span>
    </Link>
  );
}

export { MessageSquare };
