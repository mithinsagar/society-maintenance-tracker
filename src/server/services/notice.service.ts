import 'server-only';

import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/server/db';
import { notices, users } from '@/server/db/schema';
import { dispatchWithTimeout, enqueueEmails } from '@/server/email/outbox';
import { renderImportantNoticeEmail } from '@/server/email/templates';
import { NotFoundError } from '@/server/errors';

import { getSettings } from './settings.service';

/**
 * Notice board service.
 *
 * Two behaviours carry the requirement:
 *
 *  • Important notices are pinned. Ordering is `is_important DESC,
 *    published_at DESC`, matched exactly by a composite index, so pinning is a
 *    property of the query rather than something the UI re-sorts client-side.
 *
 *  • Publishing an important notice fans out one email per active resident.
 *    Each recipient gets its own outbox row so a single bad address fails
 *    alone and can be retried alone, rather than failing the batch.
 */

export interface SerializedNotice {
  id: string;
  title: string;
  body: string;
  isImportant: boolean;
  publishedAt: string;
  archivedAt: string | null;
  author: { id: string; fullName: string };
  createdAt: string;
  updatedAt: string;
}

const noticeSelection = {
  id: notices.id,
  title: notices.title,
  body: notices.body,
  isImportant: notices.isImportant,
  publishedAt: notices.publishedAt,
  archivedAt: notices.archivedAt,
  createdAt: notices.createdAt,
  updatedAt: notices.updatedAt,
  authorId: notices.authorId,
  authorName: users.fullName,
} as const;

type NoticeRow = {
  [K in keyof typeof noticeSelection]: (typeof noticeSelection)[K] extends { _: { data: infer T } }
    ? T
    : never;
};

function serialize(row: {
  id: string;
  title: string;
  body: string;
  isImportant: boolean;
  publishedAt: Date;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  authorId: string;
  authorName: string;
}): SerializedNotice {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    isImportant: row.isImportant,
    publishedAt: row.publishedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    author: { id: row.authorId, fullName: row.authorName },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listNotices(options: {
  page: number;
  pageSize: number;
  includeArchived?: boolean;
}): Promise<{ notices: SerializedNotice[]; total: number }> {
  // Residents never see archived notices; only an admin may ask for them.
  const where = options.includeArchived ? undefined : isNull(notices.archivedAt);

  const [rows, [totals]] = await Promise.all([
    db
      .select(noticeSelection)
      .from(notices)
      .innerJoin(users, eq(notices.authorId, users.id))
      .where(where)
      // Pinned first, then newest. Matches notices_important_published_idx.
      .orderBy(desc(notices.isImportant), desc(notices.publishedAt))
      .limit(options.pageSize)
      .offset((options.page - 1) * options.pageSize),
    db
      .select({ value: count() })
      .from(notices)
      .innerJoin(users, eq(notices.authorId, users.id))
      .where(where),
  ]);

  return { notices: rows.map(serialize), total: totals?.value ?? 0 };
}

export async function getNotice(noticeId: string): Promise<SerializedNotice> {
  const [row] = await db
    .select(noticeSelection)
    .from(notices)
    .innerJoin(users, eq(notices.authorId, users.id))
    .where(eq(notices.id, noticeId))
    .limit(1);

  if (!row) throw new NotFoundError('That notice could not be found.');
  return serialize(row);
}

export interface CreateNoticeResult {
  notice: SerializedNotice;
  notification: { recipients: number; delivered: number };
}

export async function createNotice(
  input: { title: string; body: string; isImportant: boolean },
  author: { id: string; fullName: string },
): Promise<CreateNoticeResult> {
  const settings = await getSettings();

  const staged = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(notices)
      .values({
        title: input.title,
        body: input.body,
        isImportant: input.isImportant,
        authorId: author.id,
      })
      .returning({ id: notices.id });

    if (!inserted) throw new Error('Failed to create notice.');

    // Only important notices notify. An ordinary notice appears on the board
    // and nothing more — mailing every resident for routine announcements is
    // how a notification channel gets muted.
    if (!input.isImportant) return { noticeId: inserted.id, entries: [] };

    const recipients = await tx
      .select({ id: users.id, email: users.email, fullName: users.fullName })
      .from(users)
      .where(and(eq(users.isActive, true), eq(users.role, 'RESIDENT')));

    const queued = recipients.map((recipient) => ({
      recipientEmail: recipient.email,
      recipientName: recipient.fullName,
      type: 'IMPORTANT_NOTICE' as const,
      noticeId: inserted.id,
      message: renderImportantNoticeEmail({
        residentName: recipient.fullName,
        title: input.title,
        body: input.body,
        authorName: author.fullName,
        societyName: settings.societyName,
        noticeId: inserted.id,
      }),
    }));

    // One row per recipient: individually retryable, individually auditable.
    const outboxIds = await enqueueEmails(tx, queued);

    return {
      noticeId: inserted.id,
      entries: outboxIds.map((outboxId, index) => ({
        outboxId,
        message: queued[index]!.message,
        to: queued[index]!.recipientEmail,
        toName: queued[index]!.recipientName,
      })),
    };
  });

  // Dispatch only after the notice is durably committed.
  const delivery = await dispatchWithTimeout(staged.entries, 8000);

  return {
    notice: await getNotice(staged.noticeId),
    notification: { recipients: staged.entries.length, delivered: delivery.sent },
  };
}

export async function updateNotice(
  noticeId: string,
  input: { title?: string; body?: string; isImportant?: boolean },
): Promise<SerializedNotice> {
  const [updated] = await db
    .update(notices)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.isImportant !== undefined ? { isImportant: input.isImportant } : {}),
    })
    .where(eq(notices.id, noticeId))
    .returning({ id: notices.id });

  if (!updated) throw new NotFoundError('That notice could not be found.');
  return getNotice(noticeId);
}

/**
 * Archives a notice (soft delete).
 *
 * Notices are community record — a resident may have acted on one. Hard
 * deletion would erase the evidence that it was ever posted, so `archived_at`
 * is set instead and the row remains for audit.
 */
export async function archiveNotice(noticeId: string): Promise<void> {
  const [updated] = await db
    .update(notices)
    .set({ archivedAt: new Date() })
    .where(and(eq(notices.id, noticeId), isNull(notices.archivedAt)))
    .returning({ id: notices.id });

  if (!updated) throw new NotFoundError('That notice could not be found, or is already archived.');
}

export async function restoreNotice(noticeId: string): Promise<SerializedNotice> {
  const [updated] = await db
    .update(notices)
    .set({ archivedAt: null })
    .where(eq(notices.id, noticeId))
    .returning({ id: notices.id });

  if (!updated) throw new NotFoundError('That notice could not be found.');
  return getNotice(noticeId);
}

/** Pinned notices for the resident dashboard rail. */
export async function getPinnedNotices(limit = 3): Promise<SerializedNotice[]> {
  const rows = await db
    .select(noticeSelection)
    .from(notices)
    .innerJoin(users, eq(notices.authorId, users.id))
    .where(and(isNull(notices.archivedAt), eq(notices.isImportant, true)))
    .orderBy(desc(notices.publishedAt))
    .limit(limit);

  return rows.map(serialize);
}

export async function getLatestNotices(limit = 4): Promise<SerializedNotice[]> {
  const rows = await db
    .select(noticeSelection)
    .from(notices)
    .innerJoin(users, eq(notices.authorId, users.id))
    .where(isNull(notices.archivedAt))
    .orderBy(desc(notices.isImportant), desc(notices.publishedAt))
    .limit(limit);

  return rows.map(serialize);
}

export async function countNotices(): Promise<{ total: number; important: number }> {
  const [row] = await db
    .select({
      total: count(),
      important: sql<number>`count(*) FILTER (WHERE ${notices.isImportant})::int`,
    })
    .from(notices)
    .where(isNull(notices.archivedAt));

  return { total: row?.total ?? 0, important: row?.important ?? 0 };
}

export type { NoticeRow };
