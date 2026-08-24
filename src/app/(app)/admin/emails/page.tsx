import { AlertTriangle, CheckCircle2, Clock, Mail } from 'lucide-react';
import type { Metadata } from 'next';

import { StatCard } from '@/components/patterns/stat-card';
import { PageBody, PageHeader } from '@/components/shell/app-shell';
import { Badge, Card, EmptyState } from '@/components/ui/primitives';
import { formatDateTime, formatRelative } from '@/lib/utils';
import { requireAdmin } from '@/server/auth/guards';
import { listOutbox, outboxSummary } from '@/server/email/outbox';

export const metadata: Metadata = { title: 'Email Log' };

/**
 * Notification delivery log.
 *
 * This reads the outbox — the table that records every notification the system
 * decided to send, before it tried to send it. That design is what makes email
 * auditable rather than a black box: you can see what was generated, for whom,
 * whether it was delivered, and the provider's reason if it was not.
 *
 * It also matters practically. Transactional providers restrict sending to
 * unverified domains, so demo residents with fictional addresses will not
 * receive real mail. This screen still proves the pipeline ran correctly.
 */
export default async function EmailLogPage() {
  await requireAdmin();

  const [{ rows }, summary] = await Promise.all([
    listOutbox({ page: 1, pageSize: 50 }),
    outboxSummary(),
  ]);

  return (
    <>
      <PageHeader
        title="Email log"
        description="Every notification this system generated, and what happened to it. Delivery is attempted after the complaint or notice is safely saved, so a failure here never loses the underlying change."
      />

      <PageBody className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Sent" value={summary.SENT} icon={CheckCircle2} tone="resolved" />
          <StatCard label="Pending" value={summary.PENDING} icon={Clock} tone="progress" />
          <StatCard
            label="Failed"
            value={summary.FAILED}
            icon={AlertTriangle}
            tone={summary.FAILED > 0 ? 'overdue' : 'neutral'}
          />
        </div>

        {rows.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Mail />}
              title="No notifications yet"
              description="Emails are generated when a complaint status changes or an important notice is published."
            />
          </Card>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-border bg-surface-sunken/60">
                    <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">
                      Recipient
                    </th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">
                      Subject
                    </th>
                    <th className="w-36 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">
                      Type
                    </th>
                    <th className="w-28 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">
                      Status
                    </th>
                    <th className="w-32 px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-subtle">
                      When
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-2.5 align-top">
                        <span className="block text-[13px] text-foreground">
                          {row.recipientName ?? '—'}
                        </span>
                        <span className="block truncate text-[11px] text-subtle">
                          {row.recipientEmail}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <span className="line-clamp-1 text-[13px] text-muted">{row.subject}</span>
                        {row.lastError ? (
                          <span className="mt-0.5 block text-[11px] text-danger">
                            {row.lastError}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 align-top text-xs text-subtle">
                        {row.type === 'COMPLAINT_STATUS_CHANGED' ? 'Status change' : 'Notice'}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <DeliveryBadge status={row.status} />
                      </td>
                      <td className="px-5 py-2.5 align-top text-right">
                        <span
                          className="text-[13px] text-muted tabular"
                          title={formatDateTime(row.createdAt)}
                        >
                          {formatRelative(row.createdAt)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="space-y-2.5 md:hidden">
              {rows.map((row) => (
                <li key={row.id} className="rounded-lg border border-border bg-surface p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <DeliveryBadge status={row.status} />
                    <span className="shrink-0 text-[11px] text-subtle tabular">
                      {formatRelative(row.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-[13px] leading-snug text-foreground">{row.subject}</p>
                  <p className="mt-1 truncate text-[11px] text-subtle">{row.recipientEmail}</p>
                  {row.lastError ? (
                    <p className="mt-1.5 text-[11px] text-danger">{row.lastError}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </PageBody>
    </>
  );
}

function DeliveryBadge({ status }: { status: 'PENDING' | 'SENT' | 'FAILED' }) {
  if (status === 'SENT') {
    return (
      <Badge tone="resolved" size="sm">
        <CheckCircle2 aria-hidden />
        Sent
      </Badge>
    );
  }
  if (status === 'FAILED') {
    return (
      <Badge tone="overdue" size="sm">
        <AlertTriangle aria-hidden />
        Failed
      </Badge>
    );
  }
  return (
    <Badge tone="progress" size="sm">
      <Clock aria-hidden />
      Pending
    </Badge>
  );
}
