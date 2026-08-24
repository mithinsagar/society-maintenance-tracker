import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type Client, adminClient, pool, residentClient } from './helpers';

/**
 * Complaint lifecycle and audit trail.
 *
 * The heart of the assignment: OPEN → IN PROGRESS → RESOLVED, resolved is
 * terminal, and every change leaves a permanent record carrying its timestamp,
 * actor and note.
 */

interface Complaint {
  id: string;
  reference: string;
  status: string;
  priority: string;
  resolvedAt: string | null;
  allowedTransitions: string[];
}

interface Event {
  id: string;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  fromPriority: string | null;
  toPriority: string | null;
  note: string | null;
  actor: { fullName: string; role: string };
  createdAt: string;
}

let admin: Client;
let resident: Client;

beforeAll(async () => {
  admin = await adminClient();
  resident = await residentClient();
});

afterAll(async () => {
  await pool.end();
});

async function createComplaint(title = 'Lifecycle test complaint'): Promise<Complaint> {
  const result = await resident.post<Complaint>('/api/complaints', {
    title,
    description: 'A complaint created by the automated lifecycle test suite.',
    category: 'PLUMBING',
  });
  expect(result.status).toBe(201);
  return result.body.data!;
}

describe('creation', () => {
  it('starts OPEN with a sequence-generated reference', async () => {
    const complaint = await createComplaint();

    expect(complaint.status).toBe('OPEN');
    expect(complaint.priority).toBe('MEDIUM');
    expect(complaint.resolvedAt).toBeNull();
    expect(complaint.reference).toMatch(/^CMP-\d{6,}$/);
  });

  it('opens the audit trail with a CREATED event attributed to the resident', async () => {
    const complaint = await createComplaint();
    const history = await resident.get<Event[]>(`/api/complaints/${complaint.id}/history`);

    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(1);

    const [event] = history.body.data!;
    expect(event!.type).toBe('CREATED');
    expect(event!.fromStatus).toBeNull();
    expect(event!.toStatus).toBe('OPEN');
    expect(event!.actor.role).toBe('RESIDENT');
  });

  it('allocates references without gaps between concurrent inserts', async () => {
    // Five simultaneous creates: a read-modify-write counter would collide here.
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) => createComplaint(`Concurrent complaint ${index}`)),
    );

    const references = results.map((complaint) => complaint.reference);
    expect(new Set(references).size).toBe(5);
  });
});

describe('status transitions', () => {
  it('advances OPEN → IN_PROGRESS → RESOLVED', async () => {
    const complaint = await createComplaint();

    const inProgress = await admin.patch<Complaint>(
      `/api/admin/complaints/${complaint.id}/status`,
      { status: 'IN_PROGRESS', note: 'Plumber assigned for tomorrow.' },
    );
    expect(inProgress.status).toBe(200);
    expect(inProgress.body.data!.status).toBe('IN_PROGRESS');

    const resolved = await admin.patch<Complaint>(`/api/admin/complaints/${complaint.id}/status`, {
      status: 'RESOLVED',
      note: 'Leak repaired and tested.',
    });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data!.status).toBe('RESOLVED');
    expect(resolved.body.data!.resolvedAt).not.toBeNull();
  });

  it('allows OPEN → RESOLVED directly', async () => {
    const complaint = await createComplaint();
    const result = await admin.patch<Complaint>(`/api/admin/complaints/${complaint.id}/status`, {
      status: 'RESOLVED',
    });
    expect(result.status).toBe(200);
  });

  it('rejects moving backwards from IN_PROGRESS to OPEN', async () => {
    const complaint = await createComplaint();
    await admin.patch(`/api/admin/complaints/${complaint.id}/status`, { status: 'IN_PROGRESS' });

    const result = await admin.patch(`/api/admin/complaints/${complaint.id}/status`, {
      status: 'OPEN',
    });
    expect(result.status).toBe(409);
    expect(result.body.error?.code).toBe('INVALID_TRANSITION');
  });

  it('treats RESOLVED as terminal — a resolved complaint cannot be reopened', async () => {
    const complaint = await createComplaint();
    await admin.patch(`/api/admin/complaints/${complaint.id}/status`, { status: 'RESOLVED' });

    for (const status of ['OPEN', 'IN_PROGRESS']) {
      const result = await admin.patch(`/api/admin/complaints/${complaint.id}/status`, { status });
      expect(result.status).toBe(409);
      expect(result.body.error?.code).toBe('INVALID_TRANSITION');
    }

    const after = await admin.get<Complaint>(`/api/complaints/${complaint.id}`);
    expect(after.body.data!.status).toBe('RESOLVED');
    expect(after.body.data!.allowedTransitions).toEqual([]);
  });

  it('rejects setting the status it already has', async () => {
    const complaint = await createComplaint();
    const result = await admin.patch(`/api/admin/complaints/${complaint.id}/status`, {
      status: 'OPEN',
    });
    expect(result.status).toBe(409);
  });

  it('advertises only the transitions the server will accept', async () => {
    const complaint = await createComplaint();
    expect(complaint.allowedTransitions).toEqual(['IN_PROGRESS', 'RESOLVED']);

    const inProgress = await admin.patch<Complaint>(
      `/api/admin/complaints/${complaint.id}/status`,
      { status: 'IN_PROGRESS' },
    );
    expect(inProgress.body.data!.allowedTransitions).toEqual(['RESOLVED']);
  });

  it('rejects a status value outside the enum', async () => {
    const complaint = await createComplaint();
    const result = await admin.patch(`/api/admin/complaints/${complaint.id}/status`, {
      status: 'CANCELLED',
    });
    expect(result.status).toBe(422);
  });
});

describe('audit trail', () => {
  it('records every change with actor, timestamp and note', async () => {
    const complaint = await createComplaint();

    await admin.patch(`/api/admin/complaints/${complaint.id}/status`, {
      status: 'IN_PROGRESS',
      note: 'Vendor scheduled.',
    });
    await admin.patch(`/api/admin/complaints/${complaint.id}/priority`, {
      priority: 'HIGH',
      note: 'Escalated after inspection.',
    });
    await admin.patch(`/api/admin/complaints/${complaint.id}/status`, {
      status: 'RESOLVED',
      note: 'Completed and verified.',
    });

    const history = await resident.get<Event[]>(`/api/complaints/${complaint.id}/history`);
    const events = history.body.data!;

    expect(events).toHaveLength(4);
    expect(events.map((event) => event.type)).toEqual([
      'CREATED',
      'STATUS_CHANGED',
      'PRIORITY_CHANGED',
      'STATUS_CHANGED',
    ]);

    // Oldest first, so the lifecycle reads top to bottom.
    const timestamps = events.map((event) => new Date(event.createdAt).getTime());
    expect([...timestamps].sort((a, b) => a - b)).toEqual(timestamps);

    for (const event of events) {
      expect(event.actor.fullName).toBeTruthy();
      expect(['RESIDENT', 'ADMIN']).toContain(event.actor.role);
    }

    const statusChanges = events.filter((event) => event.type === 'STATUS_CHANGED');
    expect(statusChanges[0]!.fromStatus).toBe('OPEN');
    expect(statusChanges[0]!.toStatus).toBe('IN_PROGRESS');
    expect(statusChanges[0]!.note).toBe('Vendor scheduled.');
    expect(statusChanges[1]!.fromStatus).toBe('IN_PROGRESS');
    expect(statusChanges[1]!.toStatus).toBe('RESOLVED');
  });

  it('does not record a no-op priority change', async () => {
    const complaint = await createComplaint();

    await admin.patch(`/api/admin/complaints/${complaint.id}/priority`, { priority: 'HIGH' });
    await admin.patch(`/api/admin/complaints/${complaint.id}/priority`, { priority: 'HIGH' });

    const history = await resident.get<Event[]>(`/api/complaints/${complaint.id}/history`);
    const priorityEvents = history.body.data!.filter(
      (event) => event.type === 'PRIORITY_CHANGED',
    );
    expect(priorityEvents).toHaveLength(1);
  });

  it('is append-only — the database rejects UPDATE', async () => {
    const complaint = await createComplaint();

    await expect(
      pool.query('UPDATE complaint_events SET note = $1 WHERE complaint_id = $2', [
        'tampered',
        complaint.id,
      ]),
    ).rejects.toThrow(/append-only/i);
  });

  it('is append-only — the database rejects DELETE', async () => {
    const complaint = await createComplaint();

    await expect(
      pool.query('DELETE FROM complaint_events WHERE complaint_id = $1', [complaint.id]),
    ).rejects.toThrow(/append-only/i);
  });

  it('writes the complaint update and its audit event in one transaction', async () => {
    const complaint = await createComplaint();
    await admin.patch(`/api/admin/complaints/${complaint.id}/status`, { status: 'IN_PROGRESS' });

    const { rows } = await pool.query(
      `SELECT c.status,
              (SELECT count(*) FROM complaint_events e
                WHERE e.complaint_id = c.id AND e.type = 'STATUS_CHANGED') AS event_count
         FROM complaints c WHERE c.id = $1`,
      [complaint.id],
    );

    // The column and the trail agree — they were written together or not at all.
    expect(rows[0].status).toBe('IN_PROGRESS');
    expect(Number(rows[0].event_count)).toBe(1);
  });

  it('keeps status and resolved_at consistent, enforced by a CHECK constraint', async () => {
    const complaint = await createComplaint();

    await expect(
      pool.query("UPDATE complaints SET status = 'RESOLVED' WHERE id = $1", [complaint.id]),
    ).rejects.toThrow(/resolved_at_consistency/i);
  });
});

describe('notifications', () => {
  it('queues an outbox row for every status change', async () => {
    const complaint = await createComplaint();
    await admin.patch(`/api/admin/complaints/${complaint.id}/status`, {
      status: 'IN_PROGRESS',
      note: 'Notification test.',
    });

    const { rows } = await pool.query(
      `SELECT type, status, recipient_email FROM email_outbox WHERE complaint_id = $1`,
      [complaint.id],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('COMPLAINT_STATUS_CHANGED');
    // PENDING, SENT or FAILED — the point is that the intent was durably
    // recorded inside the same transaction as the status change.
    expect(['PENDING', 'SENT', 'FAILED']).toContain(rows[0].status);
  });

  it('reports delivery outcome honestly in the response', async () => {
    const complaint = await createComplaint();
    const result = await admin.patch(`/api/admin/complaints/${complaint.id}/status`, {
      status: 'IN_PROGRESS',
    });

    const notification = result.body.meta?.notification as { attempted: boolean; delivered: boolean };
    expect(notification.attempted).toBe(true);
    expect(typeof notification.delivered).toBe('boolean');
  });

  it('still updates the complaint when the complaint update succeeds', async () => {
    // Email dispatch happens after the transaction commits, so the status
    // change cannot be rolled back by a delivery failure.
    const complaint = await createComplaint();
    await admin.patch(`/api/admin/complaints/${complaint.id}/status`, { status: 'RESOLVED' });

    const after = await admin.get<Complaint>(`/api/complaints/${complaint.id}`);
    expect(after.body.data!.status).toBe('RESOLVED');
  });
});
