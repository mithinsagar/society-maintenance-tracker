import { AlertTriangle, CalendarClock, Clock3, ImageIcon, MapPin, User2 } from 'lucide-react';

import { cn, formatDateTime, formatDayCount, formatRelative } from '@/lib/utils';
import { overdueSeverity } from '@/lib/overdue';
import type { SerializedComplaint, SerializedEvent } from '@/server/services/complaint.service';

import {
  Avatar,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  DetailList,
  DetailRow,
} from '../ui/primitives';

import { PriorityBadge, Reference, StatusBadge } from './indicators';
import { EventTimeline, LifecycleProgress } from './timeline';

/**
 * Complaint detail.
 *
 * The layout is deliberate: the lifecycle spine and full audit trail take the
 * primary column because they are what the product is actually for, and the
 * metadata sits in a secondary rail. On mobile the rail moves above the
 * timeline, so a resident checking their phone sees status first and history
 * after.
 *
 * Shared by the resident and admin views — the admin version passes an extra
 * `actions` node into the rail. The two must show the same facts about the
 * same complaint; only the available actions differ.
 */

export function ComplaintDetail({
  complaint,
  events,
  overdueThresholdDays,
  actions,
}: {
  complaint: SerializedComplaint;
  events: SerializedEvent[];
  overdueThresholdDays: number;
  actions?: React.ReactNode;
}) {
  const severity = overdueSeverity(complaint.overdueByDays);

  return (
    <div className="space-y-5">
      {/*
        Overdue banner. Bordered and tinted rather than a solid red block —
        the brief asks for obvious but not obnoxious, and an admin looking at
        a queue of these all day should not be shouted at by each one.
      */}
      {complaint.isOverdue ? (
        <div
          role="status"
          className={cn(
            'flex items-start gap-3 rounded-lg border px-4 py-3',
            severity === 'severe'
              ? 'border-status-overdue/45 bg-status-overdue-bg'
              : 'border-status-overdue-border bg-status-overdue-bg/60',
          )}
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-overdue" aria-hidden />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-status-overdue">
              {formatDayCount(complaint.overdueByDays)} past the response window
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              This complaint was raised {formatDayCount(complaint.daysOpen)} ago and is still not
              resolved. The society&rsquo;s target is {overdueThresholdDays} days, so it was due by{' '}
              {formatDateTime(complaint.dueAt)}.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ---------------- Primary column ---------------- */}
        <div className="order-2 space-y-5 lg:order-1">
          <Card>
            <CardBody className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={complaint.status} />
                <PriorityBadge priority={complaint.priority} />
                <Reference value={complaint.reference} className="ml-auto text-[11px]" />
              </div>

              <div className="rounded-md border border-border bg-surface-sunken/50 px-4 py-3.5">
                <LifecycleProgress status={complaint.status} isOverdue={complaint.isOverdue} />
              </div>

              <div>
                <h2 className="text-base font-semibold leading-snug text-foreground">
                  {complaint.title}
                </h2>
                <p className="mt-2.5 whitespace-pre-wrap text-[13px] leading-relaxed text-muted">
                  {complaint.description}
                </p>
              </div>

              {complaint.photo ? (
                <figure className="space-y-1.5">
                  <div className="overflow-hidden rounded-md border border-border bg-surface-sunken">
                    {/*
                      Intrinsic dimensions are stored at upload time and set
                      here so the browser reserves the right box before the
                      image loads — no layout shift as the page settles.
                    */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={complaint.photo.url}
                      alt={`Photo attached to complaint ${complaint.reference}: ${complaint.title}`}
                      width={complaint.photo.width}
                      height={complaint.photo.height}
                      loading="lazy"
                      className="block max-h-[26rem] w-full bg-surface-sunken object-contain"
                    />
                  </div>
                  <figcaption className="flex items-center gap-1.5 text-[11px] text-subtle">
                    <ImageIcon className="size-3" aria-hidden />
                    Photo submitted with this complaint
                  </figcaption>
                </figure>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>History</CardTitle>
                <p className="mt-0.5 text-xs text-subtle">
                  Every change to this complaint, in order. These records are permanent and cannot
                  be edited or removed.
                </p>
              </div>
            </CardHeader>
            <CardBody>
              <EventTimeline events={events} />
            </CardBody>
          </Card>
        </div>

        {/* ---------------- Metadata rail ---------------- */}
        <div className="order-1 space-y-4 lg:order-2 lg:sticky lg:top-4">
          {actions}

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardBody className="py-1">
              <DetailList>
                <DetailRow label="Reference">
                  <Reference value={complaint.reference} className="text-[13px]" />
                </DetailRow>
                <DetailRow label="Category">{complaint.categoryLabel}</DetailRow>
                <DetailRow label="Status">
                  <StatusBadge status={complaint.status} size="sm" />
                </DetailRow>
                <DetailRow label="Priority">
                  <PriorityBadge priority={complaint.priority} size="sm" />
                </DetailRow>
                <DetailRow label="Raised">
                  <span title={formatDateTime(complaint.createdAt)}>
                    {formatRelative(complaint.createdAt)}
                  </span>
                </DetailRow>
                <DetailRow label="Last updated">
                  <span title={formatDateTime(complaint.updatedAt)}>
                    {formatRelative(complaint.updatedAt)}
                  </span>
                </DetailRow>
                {complaint.resolvedAt ? (
                  <DetailRow label="Resolved">
                    <span title={formatDateTime(complaint.resolvedAt)}>
                      {formatRelative(complaint.resolvedAt)}
                    </span>
                  </DetailRow>
                ) : null}
                <DetailRow label={complaint.status === 'RESOLVED' ? 'Time to resolve' : 'Age'}>
                  <span className="tabular">{formatDayCount(complaint.daysOpen)}</span>
                </DetailRow>
                {complaint.status !== 'RESOLVED' ? (
                  <DetailRow label="Due by">
                    <span
                      className={cn('tabular', complaint.isOverdue && 'text-status-overdue')}
                      title={formatDateTime(complaint.dueAt)}
                    >
                      {formatRelative(complaint.dueAt)}
                    </span>
                  </DetailRow>
                ) : null}
              </DetailList>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Raised by</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="flex items-center gap-2.5">
                <Avatar name={complaint.resident.fullName} size="lg" />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-foreground">
                    {complaint.resident.fullName}
                  </p>
                  <p className="truncate text-xs text-subtle">{complaint.resident.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <MapPin className="size-3.5 text-subtle" aria-hidden />
                Flat {complaint.resident.flatNumber}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

export { CalendarClock, Clock3, User2 };
