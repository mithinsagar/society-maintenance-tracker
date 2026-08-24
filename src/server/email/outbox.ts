import 'server-only';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { env } from '@/lib/env';
import { db, type DbClient } from '@/server/db';
import { emailOutbox, type EmailStatus, type EmailType } from '@/server/db/schema';

import type { EmailMessage } from './provider';
import { getEmailProvider } from './providers';

/**
 * Transactional outbox for email.
 *
 * The problem this solves: a status change must update the complaint, append
 * an audit event, and notify the resident. Those first two belong in one
 * transaction. The third is a network call to a third party that can be slow,
 * can fail, and must never roll back the first two.
 *
 * So the flow is:
 *
 *   ── transaction ──────────────────────────────────
 *     update complaint
 *     insert audit event
 *     insert outbox row (PENDING)          <- durable intent to notify
 *   ── commit ──────────────────────────────────────
 *     dispatch outbox row  ->  SENT | FAILED
 *
 * Because the intent is committed with the domain change, a notification can
 * never be silently lost: if the process dies before dispatch, the row is
 * still PENDING and can be retried. And because dispatch happens after commit,
 * a provider outage degrades to "the update worked, the email did not" —
 * which the API reports honestly and the UI surfaces as a soft warning.
 */

export interface QueuedEmail {
  recipientEmail: string;
  recipientName?: string | null;
  type: EmailType;
  message: EmailMessage;
  complaintId?: string;
  noticeId?: string;
}

/**
 * Stage 1 — inside the transaction. Records the intent to notify.
 * Returns the outbox row ids so the caller can dispatch them after commit.
 */
export async function enqueueEmails(client: DbClient, emails: QueuedEmail[]): Promise<string[]> {
  if (emails.length === 0) return [];

  const rows = await client
    .insert(emailOutbox)
    .values(
      emails.map((email) => ({
        recipientEmail: email.recipientEmail,
        recipientName: email.recipientName ?? null,
        type: email.type,
        subject: email.message.subject,
        status: 'PENDING' as const,
        complaintId: email.complaintId ?? null,
        noticeId: email.noticeId ?? null,
      })),
    )
    .returning({ id: emailOutbox.id });

  return rows.map((row) => row.id);
}

/**
 * Stage 2 — after commit. Sends the rendered messages and records the outcome.
 *
 * Never throws. The worst case is that every row ends as FAILED with a reason
 * recorded, which is a state the admin Email Log can show and retry from.
 */
export async function dispatchEmails(
  entries: Array<{ outboxId: string; message: EmailMessage; to: string; toName?: string | null }>,
): Promise<{ sent: number; failed: number }> {
  if (entries.length === 0) return { sent: 0, failed: 0 };

  const provider = getEmailProvider();
  let sent = 0;
  let failed = 0;

  const results = await Promise.allSettled(
    entries.map(async (entry) => {
      // Demo safety valve: route everything to one inbox while keeping the
      // intended recipient visible, so a reviewer can see real delivery
      // without the seeded (fictional) addresses bouncing.
      const redirected = env.EMAIL_REDIRECT_TO.length > 0;
      const to = redirected ? env.EMAIL_REDIRECT_TO : entry.to;
      const subject = redirected
        ? `[to: ${entry.to}] ${entry.message.subject}`
        : entry.message.subject;

      const result = await provider.send({
        ...entry.message,
        to,
        toName: entry.toName,
        subject,
      });

      if (result.ok) {
        await db
          .update(emailOutbox)
          .set({
            status: 'SENT',
            sentAt: new Date(),
            providerMessageId: result.providerMessageId ?? null,
            attempts: sql`${emailOutbox.attempts} + 1`,
            lastError: null,
          })
          .where(eq(emailOutbox.id, entry.outboxId));
        return true;
      }

      await db
        .update(emailOutbox)
        .set({
          status: 'FAILED',
          attempts: sql`${emailOutbox.attempts} + 1`,
          lastError: result.error?.slice(0, 1000) ?? 'Unknown failure',
        })
        .where(eq(emailOutbox.id, entry.outboxId));

      // Logged without the message body, so nothing sensitive reaches the log.
      console.warn(`[email] delivery failed for outbox ${entry.outboxId}: ${result.error}`);
      return false;
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) sent += 1;
    else failed += 1;
  }

  return { sent, failed };
}

/**
 * Fire-and-forget dispatch with a ceiling on how long the request will wait.
 *
 * The caller has already committed its work and is ready to respond. We give
 * delivery a short window so the common case reports an accurate result, then
 * stop waiting — a slow provider must not hold the user's request open.
 */
export async function dispatchWithTimeout(
  entries: Array<{ outboxId: string; message: EmailMessage; to: string; toName?: string | null }>,
  timeoutMs = 4000,
): Promise<{ sent: number; failed: number; timedOut: boolean }> {
  if (entries.length === 0) return { sent: 0, failed: 0, timedOut: false };

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });

  try {
    const outcome = await Promise.race([dispatchEmails(entries), timeout]);
    if (outcome === 'timeout') {
      return { sent: 0, failed: 0, timedOut: true };
    }
    return { ...outcome, timedOut: false };
  } catch (error) {
    // Dispatch is best-effort by contract; a throw here must not reach the user.
    console.error('[email] dispatch raised unexpectedly', error);
    return { sent: 0, failed: entries.length, timedOut: false };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Admin visibility
// ---------------------------------------------------------------------------

export async function listOutbox(options: {
  page: number;
  pageSize: number;
  status?: EmailStatus[];
}) {
  const conditions = options.status?.length
    ? [inArray(emailOutbox.status, options.status)]
    : [];

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [counted]] = await Promise.all([
    db
      .select()
      .from(emailOutbox)
      .where(where)
      .orderBy(desc(emailOutbox.createdAt))
      .limit(options.pageSize)
      .offset((options.page - 1) * options.pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(emailOutbox).where(where),
  ]);

  return { rows, total: counted?.count ?? 0 };
}

export async function outboxSummary() {
  const rows = await db
    .select({ status: emailOutbox.status, count: sql<number>`count(*)::int` })
    .from(emailOutbox)
    .groupBy(emailOutbox.status);

  const summary: Record<EmailStatus, number> = { PENDING: 0, SENT: 0, FAILED: 0 };
  for (const row of rows) summary[row.status] = row.count;
  return summary;
}
