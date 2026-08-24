import { Megaphone, Pin } from 'lucide-react';

import { cn, formatDate, formatRelative, initials } from '@/lib/utils';
import type { SerializedNotice } from '@/server/services/notice.service';

import { Badge, EmptyState } from '../ui/primitives';

/**
 * Notice board.
 *
 * Not a CRUD list. Important notices are physically separated into a pinned
 * band at the top with a distinct treatment, the way a real society board has
 * a section nobody can miss — rather than a red dot on an otherwise identical
 * row that the eye slides straight past.
 *
 * Notice bodies are rendered as plain text with `whitespace-pre-wrap`, never
 * as HTML. Admin-authored content is still user input, and treating it as
 * markup would be a stored-XSS vector aimed at every resident.
 */

export function NoticeBoard({
  notices,
  actions,
  emptyDescription = 'Announcements from the management committee will appear here.',
}: {
  notices: SerializedNotice[];
  /** Per-notice admin controls (edit, pin, archive). */
  actions?: (notice: SerializedNotice) => React.ReactNode;
  emptyDescription?: string;
}) {
  if (notices.length === 0) {
    return (
      <EmptyState
        icon={<Megaphone />}
        title="No notices posted yet"
        description={emptyDescription}
        className="rounded-lg border border-border bg-surface"
      />
    );
  }

  const pinned = notices.filter((notice) => notice.isImportant && !notice.archivedAt);
  const rest = notices.filter((notice) => !notice.isImportant || notice.archivedAt);

  return (
    <div className="space-y-6">
      {pinned.length > 0 ? (
        <section aria-labelledby="pinned-heading" className="space-y-3">
          <h2
            id="pinned-heading"
            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-status-progress"
          >
            <Pin className="size-3" aria-hidden />
            Pinned — important
          </h2>
          <div className="stagger space-y-3">
            {pinned.map((notice) => (
              <NoticeCard key={notice.id} notice={notice} actions={actions} />
            ))}
          </div>
        </section>
      ) : null}

      {rest.length > 0 ? (
        <section aria-labelledby="all-heading" className="space-y-3">
          {pinned.length > 0 ? (
            <h2
              id="all-heading"
              className="text-[11px] font-semibold uppercase tracking-wider text-subtle"
            >
              Earlier notices
            </h2>
          ) : null}
          <div className="stagger space-y-3">
            {rest.map((notice) => (
              <NoticeCard key={notice.id} notice={notice} actions={actions} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function NoticeCard({
  notice,
  actions,
}: {
  notice: SerializedNotice;
  actions?: (notice: SerializedNotice) => React.ReactNode;
}) {
  const archived = Boolean(notice.archivedAt);

  return (
    <article
      // The id is the anchor target used by dashboard links and email CTAs.
      id={notice.id}
      className={cn(
        'relative overflow-hidden rounded-lg border bg-surface transition-colors scroll-mt-20',
        notice.isImportant && !archived
          ? 'border-status-progress-border'
          : 'border-border hover:border-border-strong',
        archived && 'opacity-60',
      )}
    >
      {notice.isImportant && !archived ? (
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-status-progress" />
      ) : null}

      <div className={cn('p-5', notice.isImportant && !archived && 'pl-6')}>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              {notice.isImportant ? (
                <Badge tone="progress" size="sm">
                  <Pin aria-hidden />
                  Important
                </Badge>
              ) : null}
              {archived ? (
                <Badge tone="neutral" size="sm">
                  Archived
                </Badge>
              ) : null}
            </div>

            <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-foreground">
              {notice.title}
            </h3>
          </div>

          {actions ? <div className="flex shrink-0 items-center gap-1">{actions(notice)}</div> : null}
        </div>

        <p className="mt-2.5 whitespace-pre-wrap text-[13px] leading-relaxed text-muted">
          {notice.body}
        </p>

        <footer className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-3 text-[11px] text-subtle">
          <span
            aria-hidden
            className="flex size-5 items-center justify-center rounded-full bg-surface-sunken text-[9px] font-semibold text-muted"
          >
            {initials(notice.author.fullName)}
          </span>
          <span className="font-medium text-muted">{notice.author.fullName}</span>
          <span aria-hidden>·</span>
          <time dateTime={notice.publishedAt} title={formatDate(notice.publishedAt)}>
            {formatRelative(notice.publishedAt)}
          </time>
        </footer>
      </div>
    </article>
  );
}
