import 'server-only';

import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';

import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  STATUS_TRANSITIONS,
  canTransition,
} from '@/lib/constants';
import { computeOverdueState, overdueCutoff, type OverdueState } from '@/lib/overdue';
import type { ComplaintQuery, CreateComplaintInput } from '@/lib/validation';
import { db } from '@/server/db';
import {
  complaintEvents,
  complaints,
  users,
  type Complaint,
  type ComplaintCategory,
  type ComplaintEventType,
  type ComplaintStatus,
  type Priority,
  type Role,
} from '@/server/db/schema';
import { enqueueEmails, dispatchWithTimeout } from '@/server/email/outbox';
import { renderStatusChangeEmail } from '@/server/email/templates';
import { ForbiddenError, InvalidTransitionError, NotFoundError } from '@/server/errors';
import { getStorageProvider } from '@/server/storage';

import { getSettings } from './settings.service';

/**
 * Complaint service — all complaint business rules live here.
 *
 * Route handlers stay thin: parse, authorize, delegate, respond. Anything that
 * decides *what the product does* is in this file, which is what makes the
 * lifecycle rules testable without an HTTP layer.
 */

// ---------------------------------------------------------------------------
// Serialized shapes (the API contract)
// ---------------------------------------------------------------------------

export interface ComplaintActor {
  id: string;
  fullName: string;
  flatNumber: string;
  email: string;
  role: Role;
}

export interface SerializedComplaint {
  id: string;
  reference: string;
  title: string;
  description: string;
  category: ComplaintCategory;
  categoryLabel: string;
  status: ComplaintStatus;
  statusLabel: string;
  priority: Priority;
  photo: { url: string; thumbnailUrl: string; width: number; height: number } | null;
  resident: ComplaintActor;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  /** Derived overdue state — never stored. See src/lib/overdue.ts. */
  isOverdue: boolean;
  daysOpen: number;
  overdueByDays: number;
  dueAt: string;
  /** The transitions the server will accept from the current status. */
  allowedTransitions: ComplaintStatus[];
}

export interface SerializedEvent {
  id: string;
  type: ComplaintEventType;
  fromStatus: ComplaintStatus | null;
  toStatus: ComplaintStatus | null;
  fromPriority: Priority | null;
  toPriority: Priority | null;
  note: string | null;
  actor: { id: string; fullName: string; role: Role };
  createdAt: string;
}

type ComplaintRow = Complaint & {
  residentName: string;
  residentFlat: string;
  residentEmail: string;
  residentRole: Role;
};

function serializeComplaint(row: ComplaintRow, thresholdDays: number, now: Date): SerializedComplaint {
  const overdue: OverdueState = computeOverdueState(
    { status: row.status, createdAt: row.createdAt, resolvedAt: row.resolvedAt },
    thresholdDays,
    now,
  );

  const storage = getStorageProvider();

  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    description: row.description,
    category: row.category,
    categoryLabel: CATEGORY_LABELS[row.category],
    status: row.status,
    statusLabel: STATUS_LABELS[row.status],
    priority: row.priority,
    photo:
      row.photoUrl && row.photoPublicId
        ? {
            url: row.photoUrl,
            thumbnailUrl: storage.thumbnailUrl(row.photoPublicId, 160),
            width: row.photoWidth ?? 1200,
            height: row.photoHeight ?? 900,
          }
        : null,
    resident: {
      id: row.residentId,
      fullName: row.residentName,
      flatNumber: row.residentFlat,
      email: row.residentEmail,
      role: row.residentRole,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    isOverdue: overdue.isOverdue,
    daysOpen: overdue.daysOpen,
    overdueByDays: overdue.overdueByDays,
    dueAt: overdue.dueAt.toISOString(),
    // Read from the lifecycle table rather than restated here, so the
    // transitions the UI offers are exactly the ones the server will accept.
    allowedTransitions: [...STATUS_TRANSITIONS[row.status]],
  };
}

const complaintSelection = {
  id: complaints.id,
  reference: complaints.reference,
  residentId: complaints.residentId,
  title: complaints.title,
  description: complaints.description,
  category: complaints.category,
  status: complaints.status,
  priority: complaints.priority,
  photoUrl: complaints.photoUrl,
  photoPublicId: complaints.photoPublicId,
  photoWidth: complaints.photoWidth,
  photoHeight: complaints.photoHeight,
  createdAt: complaints.createdAt,
  updatedAt: complaints.updatedAt,
  resolvedAt: complaints.resolvedAt,
  residentName: users.fullName,
  residentFlat: users.flatNumber,
  residentEmail: users.email,
  residentRole: users.role,
} as const;

// ---------------------------------------------------------------------------
// Query building
// ---------------------------------------------------------------------------

/**
 * Translates a validated query into SQL predicates.
 *
 * All filtering happens in the database. Fetching a page of rows and filtering
 * in JavaScript would return wrong totals, break pagination, and transfer data
 * the user never sees.
 */
function buildFilters(
  query: ComplaintQuery,
  thresholdDays: number,
  now: Date,
  residentId?: string,
): SQL[] {
  const filters: SQL[] = [];

  // Ownership scope. When present this is applied unconditionally, so a
  // resident's list cannot be widened by any combination of query parameters.
  if (residentId) filters.push(eq(complaints.residentId, residentId));

  if (query.status?.length) filters.push(inArray(complaints.status, query.status));
  if (query.category?.length) filters.push(inArray(complaints.category, query.category));
  if (query.priority?.length) filters.push(inArray(complaints.priority, query.priority));

  if (query.from) filters.push(gte(complaints.createdAt, query.from));
  if (query.to) {
    // `to` is inclusive of the whole day the user picked.
    const end = new Date(query.to);
    end.setHours(23, 59, 59, 999);
    filters.push(lte(complaints.createdAt, end));
  }

  if (query.q) {
    const term = `%${query.q}%`;
    const searchCondition = or(
      ilike(complaints.reference, term),
      ilike(complaints.title, term),
      ilike(complaints.description, term),
    );
    if (searchCondition) filters.push(searchCondition);
  }

  // The overdue predicate, expressed in SQL from the same rule as the
  // in-memory calculation: not resolved, and older than the cutoff.
  if (query.overdue !== undefined) {
    const cutoff = overdueCutoff(thresholdDays, now);
    if (query.overdue) {
      filters.push(
        and(sql`${complaints.status} <> 'RESOLVED'`, lte(complaints.createdAt, cutoff)) as SQL,
      );
    } else {
      filters.push(
        or(sql`${complaints.status} = 'RESOLVED'`, gte(complaints.createdAt, cutoff)) as SQL,
      );
    }
  }

  return filters;
}

function buildOrder(query: ComplaintQuery, adminDefault: boolean, thresholdDays: number, now: Date) {
  const direction = query.order === 'asc' ? asc : desc;

  // Priority is an enum ordered LOW, MEDIUM, HIGH in the type, so sorting on
  // the column directly would put LOW first. Rank it explicitly instead.
  const priorityRank = sql`CASE ${complaints.priority} WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ELSE 1 END`;

  if (query.sort === 'priority') {
    return [direction(priorityRank), desc(complaints.createdAt)];
  }
  if (query.sort === 'status') {
    const statusRank = sql`CASE ${complaints.status} WHEN 'OPEN' THEN 1 WHEN 'IN_PROGRESS' THEN 2 ELSE 3 END`;
    return [direction(statusRank), desc(complaints.createdAt)];
  }
  if (query.sort === 'reference') return [direction(complaints.reference)];
  if (query.sort === 'updatedAt') return [direction(complaints.updatedAt)];

  // The admin queue's default answers "what needs attention?" — overdue items
  // first, then by urgency, then oldest-first within a band.
  if (adminDefault && query.sort === 'createdAt' && query.order === 'desc') {
    const cutoff = overdueCutoff(thresholdDays, now);
    const overdueRank = sql`CASE WHEN ${complaints.status} <> 'RESOLVED' AND ${complaints.createdAt} <= ${cutoff} THEN 0 ELSE 1 END`;
    return [asc(overdueRank), desc(priorityRank), asc(complaints.createdAt)];
  }

  return [direction(complaints.createdAt)];
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface ListResult {
  complaints: SerializedComplaint[];
  total: number;
}

/** Admin listing: every complaint, fully filterable. */
export async function listComplaintsForAdmin(query: ComplaintQuery): Promise<ListResult> {
  return listComplaints(query, undefined);
}

/** Resident listing: hard-scoped to the caller's own complaints. */
export async function listComplaintsForResident(
  residentId: string,
  query: ComplaintQuery,
): Promise<ListResult> {
  return listComplaints(query, residentId);
}

async function listComplaints(query: ComplaintQuery, residentId?: string): Promise<ListResult> {
  const now = new Date();
  const { overdueThresholdDays } = await getSettings();

  const filters = buildFilters(query, overdueThresholdDays, now, residentId);
  const where = filters.length > 0 ? and(...filters) : undefined;

  const [rows, [totals]] = await Promise.all([
    db
      .select(complaintSelection)
      .from(complaints)
      .innerJoin(users, eq(complaints.residentId, users.id))
      .where(where)
      .orderBy(...buildOrder(query, residentId === undefined, overdueThresholdDays, now))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ value: count() })
      .from(complaints)
      .innerJoin(users, eq(complaints.residentId, users.id))
      .where(where),
  ]);

  return {
    complaints: rows.map((row) => serializeComplaint(row, overdueThresholdDays, now)),
    total: totals?.value ?? 0,
  };
}

/**
 * Fetches one complaint, enforcing access.
 *
 * A resident asking for someone else's complaint gets NotFound, not Forbidden.
 * Forbidden would confirm the record exists, which is itself a disclosure; 404
 * reveals nothing about complaints the caller may not see.
 */
export async function getComplaintForUser(
  complaintId: string,
  user: { id: string; role: Role },
): Promise<SerializedComplaint> {
  const now = new Date();
  const { overdueThresholdDays } = await getSettings();

  const rows = await db
    .select(complaintSelection)
    .from(complaints)
    .innerJoin(users, eq(complaints.residentId, users.id))
    .where(eq(complaints.id, complaintId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new NotFoundError('That complaint could not be found.');

  if (user.role !== 'ADMIN' && row.residentId !== user.id) {
    throw new NotFoundError('That complaint could not be found.');
  }

  return serializeComplaint(row, overdueThresholdDays, now);
}

/** The full audit trail for one complaint, oldest first. Access is re-checked. */
export async function getComplaintHistory(
  complaintId: string,
  user: { id: string; role: Role },
): Promise<SerializedEvent[]> {
  // Re-uses the access check above rather than duplicating it, so the two can
  // never diverge.
  await getComplaintForUser(complaintId, user);

  const rows = await db
    .select({
      id: complaintEvents.id,
      type: complaintEvents.type,
      fromStatus: complaintEvents.fromStatus,
      toStatus: complaintEvents.toStatus,
      fromPriority: complaintEvents.fromPriority,
      toPriority: complaintEvents.toPriority,
      note: complaintEvents.note,
      createdAt: complaintEvents.createdAt,
      actorId: complaintEvents.actorId,
      actorRole: complaintEvents.actorRole,
      actorName: users.fullName,
    })
    .from(complaintEvents)
    .innerJoin(users, eq(complaintEvents.actorId, users.id))
    .where(eq(complaintEvents.complaintId, complaintId))
    .orderBy(asc(complaintEvents.createdAt));

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    fromPriority: row.fromPriority,
    toPriority: row.toPriority,
    note: row.note,
    // The role stored on the event, not the actor's current role.
    actor: { id: row.actorId, fullName: row.actorName, role: row.actorRole },
    createdAt: row.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Creates a complaint and opens its audit trail in one transaction.
 *
 * The `CREATED` event (null -> OPEN) is what makes the lifecycle fully
 * reconstructible from the event log alone — without it, the trail would begin
 * at the first admin action and the complaint's own origin would be implicit.
 */
export async function createComplaint(
  input: CreateComplaintInput,
  resident: { id: string; role: Role },
): Promise<SerializedComplaint> {
  // Verify the photo *before* opening the transaction: the client-supplied
  // publicId is untrusted, and a network call to the storage provider has no
  // business holding a database transaction open.
  let photo: { url: string; publicId: string; width: number; height: number } | null = null;
  if (input.photo) {
    const asset = await getStorageProvider().verifyAsset(input.photo.publicId);
    photo = {
      url: asset.url,
      publicId: asset.publicId,
      width: asset.width,
      height: asset.height,
    };
  }

  const complaintId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(complaints)
      .values({
        residentId: resident.id,
        title: input.title,
        description: input.description,
        category: input.category,
        photoUrl: photo?.url ?? null,
        photoPublicId: photo?.publicId ?? null,
        photoWidth: photo?.width ?? null,
        photoHeight: photo?.height ?? null,
      })
      .returning({ id: complaints.id });

    if (!inserted) throw new Error('Failed to create complaint.');

    await tx.insert(complaintEvents).values({
      complaintId: inserted.id,
      type: 'CREATED',
      toStatus: 'OPEN',
      actorId: resident.id,
      actorRole: resident.role,
    });

    return inserted.id;
  });

  return getComplaintForUser(complaintId, resident);
}

export interface StatusUpdateResult {
  complaint: SerializedComplaint;
  /** Honest reporting: the update succeeded, but did the notification? */
  notification: { attempted: boolean; delivered: boolean };
}

/**
 * Transitions a complaint's status.
 *
 * The ordering here is the whole point:
 *
 *   1. Re-read the complaint **inside** the transaction, locked FOR UPDATE, so
 *      two admins clicking at once cannot both pass the transition check.
 *   2. Validate the transition against the lifecycle table.
 *   3. Update the complaint and append the audit event — atomically.
 *   4. Record the intent to notify, still inside the transaction.
 *   5. Commit.
 *   6. Only then attempt delivery.
 *
 * If email fails, the complaint is still updated and the API says so.
 */
export async function updateComplaintStatus(
  complaintId: string,
  input: { status: ComplaintStatus; note?: string },
  actor: { id: string; role: Role; fullName: string },
): Promise<StatusUpdateResult> {
  if (actor.role !== 'ADMIN') {
    throw new ForbiddenError('Only society administrators can change a complaint status.');
  }

  const settings = await getSettings();

  const outcome = await db.transaction(async (tx) => {
    // SELECT ... FOR UPDATE. Without this lock, two concurrent requests could
    // both read status=OPEN, both consider OPEN->RESOLVED valid, and both
    // write an event — producing a duplicate entry in an audit trail that is
    // supposed to be authoritative.
    const locked = await tx.execute<{
      id: string;
      status: ComplaintStatus;
      reference: string;
      title: string;
      category: ComplaintCategory;
      resident_id: string;
    }>(
      sql`SELECT id, status, reference, title, category, resident_id
          FROM complaints WHERE id = ${complaintId} FOR UPDATE`,
    );

    const current = locked.rows[0];
    if (!current) throw new NotFoundError('That complaint could not be found.');

    if (current.status === input.status) {
      throw new InvalidTransitionError(
        `This complaint is already marked ${STATUS_LABELS[input.status]}.`,
      );
    }

    if (!canTransition(current.status, input.status)) {
      throw new InvalidTransitionError(
        current.status === 'RESOLVED'
          ? 'This complaint is resolved and closed. Resolved complaints cannot be reopened.'
          : `A complaint cannot move from ${STATUS_LABELS[current.status]} to ${STATUS_LABELS[input.status]}.`,
        { from: current.status, to: input.status },
      );
    }

    const resolvedAt = input.status === 'RESOLVED' ? new Date() : null;

    await tx
      .update(complaints)
      .set({ status: input.status, resolvedAt })
      .where(eq(complaints.id, complaintId));

    await tx.insert(complaintEvents).values({
      complaintId,
      type: 'STATUS_CHANGED',
      fromStatus: current.status,
      toStatus: input.status,
      note: input.note ?? null,
      actorId: actor.id,
      actorRole: actor.role,
    });

    const [resident] = await tx
      .select({ email: users.email, fullName: users.fullName })
      .from(users)
      .where(eq(users.id, current.resident_id))
      .limit(1);

    if (!resident) throw new Error('Complaint resident not found.');

    const message = renderStatusChangeEmail({
      residentName: resident.fullName,
      reference: current.reference,
      title: current.title,
      category: current.category,
      fromStatus: current.status,
      toStatus: input.status,
      note: input.note ?? null,
      actorName: actor.fullName,
      societyName: settings.societyName,
      complaintId,
    });

    const [outboxId] = await enqueueEmails(tx, [
      {
        recipientEmail: resident.email,
        recipientName: resident.fullName,
        type: 'COMPLAINT_STATUS_CHANGED',
        message,
        complaintId,
      },
    ]);

    return { outboxId, message, to: resident.email, toName: resident.fullName };
  });

  // Past this line the domain change is durable. Everything below is
  // best-effort and cannot fail the request.
  const delivery = outcome.outboxId
    ? await dispatchWithTimeout([
        {
          outboxId: outcome.outboxId,
          message: outcome.message,
          to: outcome.to,
          toName: outcome.toName,
        },
      ])
    : { sent: 0, failed: 0, timedOut: false };

  return {
    complaint: await getComplaintForUser(complaintId, actor),
    notification: { attempted: true, delivered: delivery.sent > 0 },
  };
}

/** Changes priority and records it in the same audit trail as status changes. */
export async function updateComplaintPriority(
  complaintId: string,
  input: { priority: Priority; note?: string },
  actor: { id: string; role: Role },
): Promise<SerializedComplaint> {
  if (actor.role !== 'ADMIN') {
    throw new ForbiddenError('Only society administrators can change a complaint priority.');
  }

  await db.transaction(async (tx) => {
    const locked = await tx.execute<{ id: string; priority: Priority }>(
      sql`SELECT id, priority FROM complaints WHERE id = ${complaintId} FOR UPDATE`,
    );

    const current = locked.rows[0];
    if (!current) throw new NotFoundError('That complaint could not be found.');

    // A no-op write would add a meaningless entry to the audit trail.
    if (current.priority === input.priority) return;

    await tx.update(complaints).set({ priority: input.priority }).where(eq(complaints.id, complaintId));

    await tx.insert(complaintEvents).values({
      complaintId,
      type: 'PRIORITY_CHANGED',
      fromPriority: current.priority,
      toPriority: input.priority,
      note: input.note ?? null,
      actorId: actor.id,
      actorRole: actor.role,
    });
  });

  return getComplaintForUser(complaintId, actor);
}

// ---------------------------------------------------------------------------
// Resident summary (dashboard)
// ---------------------------------------------------------------------------

export async function getResidentSummary(residentId: string) {
  const now = new Date();
  const { overdueThresholdDays } = await getSettings();
  const cutoff = overdueCutoff(overdueThresholdDays, now);

  const [byStatus, [overdueRow], recent] = await Promise.all([
    db
      .select({ status: complaints.status, value: count() })
      .from(complaints)
      .where(eq(complaints.residentId, residentId))
      .groupBy(complaints.status),
    db
      .select({ value: count() })
      .from(complaints)
      .where(
        and(
          eq(complaints.residentId, residentId),
          sql`${complaints.status} <> 'RESOLVED'`,
          lte(complaints.createdAt, cutoff),
        ),
      ),
    db
      .select(complaintSelection)
      .from(complaints)
      .innerJoin(users, eq(complaints.residentId, users.id))
      .where(eq(complaints.residentId, residentId))
      .orderBy(desc(complaints.updatedAt))
      .limit(5),
  ]);

  const counts: Record<ComplaintStatus, number> = { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0 };
  for (const row of byStatus) counts[row.status] = row.value;

  return {
    counts,
    total: counts.OPEN + counts.IN_PROGRESS + counts.RESOLVED,
    overdue: overdueRow?.value ?? 0,
    recent: recent.map((row) => serializeComplaint(row, overdueThresholdDays, now)),
  };
}

export { serializeComplaint, complaintSelection, isNull };
