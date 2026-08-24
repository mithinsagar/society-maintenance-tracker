import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Client, adminClient, pool, residentClient } from './helpers';

/**
 * Notice board, validation and error handling.
 */

interface Notice {
  id: string;
  title: string;
  isImportant: boolean;
  archivedAt: string | null;
  notification?: { recipients: number; delivered: number };
}

let admin: Client;
let resident: Client;
const createdNoticeIds: string[] = [];

beforeAll(async () => {
  admin = await adminClient();
  resident = await residentClient();
});

afterAll(async () => {
  if (createdNoticeIds.length > 0) {
    await pool.query('DELETE FROM notices WHERE id = ANY($1::uuid[])', [createdNoticeIds]);
  }
  await pool.end();
});

async function createNotice(overrides: Partial<{ title: string; body: string; isImportant: boolean }> = {}) {
  const result = await admin.post<Notice>('/api/admin/notices', {
    title: overrides.title ?? 'Automated test notice for the board',
    body: overrides.body ?? 'This notice was created by the automated test suite.',
    isImportant: overrides.isImportant ?? false,
  });
  if (result.body.data?.id) createdNoticeIds.push(result.body.data.id);
  return result;
}

describe('notice board', () => {
  it('publishes a notice visible to residents', async () => {
    const created = await createNotice({ title: 'Ordinary notice from the test suite' });
    expect(created.status).toBe(201);

    const board = await resident.get<Notice[]>('/api/notices?pageSize=100');
    expect(board.body.data!.some((notice) => notice.id === created.body.data!.id)).toBe(true);
  });

  it('pins important notices above ordinary ones', async () => {
    await createNotice({ title: 'Important test notice — should pin', isImportant: true });

    const board = await resident.get<Notice[]>('/api/notices?pageSize=100');
    const notices = board.body.data!;

    const firstOrdinaryIndex = notices.findIndex((notice) => !notice.isImportant);
    const lastImportantIndex = notices.map((n) => n.isImportant).lastIndexOf(true);

    if (firstOrdinaryIndex !== -1 && lastImportantIndex !== -1) {
      // Every important notice precedes every ordinary one.
      expect(lastImportantIndex).toBeLessThan(firstOrdinaryIndex);
    }
  });

  it('queues one email per active resident for an important notice', async () => {
    const created = await createNotice({
      title: 'Important notice triggering the email fan-out',
      isImportant: true,
    });

    const noticeId = created.body.data!.id;
    const { rows } = await pool.query(
      `SELECT count(*)::int AS value FROM email_outbox WHERE notice_id = $1`,
      [noticeId],
    );

    const { rows: residents } = await pool.query(
      `SELECT count(*)::int AS value FROM users WHERE is_active AND role = 'RESIDENT'`,
    );

    // One row per recipient, so each is retryable and auditable on its own.
    expect(rows[0].value).toBe(residents[0].value);
  });

  it('does not email for an ordinary notice', async () => {
    const created = await createNotice({ title: 'Ordinary notice, no email expected' });

    const { rows } = await pool.query(
      `SELECT count(*)::int AS value FROM email_outbox WHERE notice_id = $1`,
      [created.body.data!.id],
    );
    expect(rows[0].value).toBe(0);
  });

  it('toggles importance', async () => {
    const created = await createNotice({ title: 'Notice to be pinned then unpinned' });
    const noticeId = created.body.data!.id;

    const pinned = await admin.patch<Notice>(`/api/admin/notices/${noticeId}`, {
      isImportant: true,
    });
    expect(pinned.body.data!.isImportant).toBe(true);

    const unpinned = await admin.patch<Notice>(`/api/admin/notices/${noticeId}`, {
      isImportant: false,
    });
    expect(unpinned.body.data!.isImportant).toBe(false);
  });

  it('archives rather than deletes, and hides the notice from residents', async () => {
    const created = await createNotice({ title: 'Notice that will be archived' });
    const noticeId = created.body.data!.id;

    expect((await admin.del(`/api/admin/notices/${noticeId}`)).status).toBe(200);

    // The row still exists — notices are community record.
    const { rows } = await pool.query('SELECT archived_at FROM notices WHERE id = $1', [noticeId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].archived_at).not.toBeNull();

    const board = await resident.get<Notice[]>('/api/notices?pageSize=100');
    expect(board.body.data!.some((notice) => notice.id === noticeId)).toBe(false);
  });

  it('ignores includeArchived for residents', async () => {
    const board = await resident.get<Notice[]>('/api/notices?pageSize=100&includeArchived=true');
    expect(board.body.data!.every((notice) => notice.archivedAt === null)).toBe(true);
  });
});

describe('validation', () => {
  it('rejects a description that is too short', async () => {
    const result = await resident.post('/api/complaints', {
      title: 'Valid title here',
      description: 'too short',
      category: 'PLUMBING',
    });
    expect(result.status).toBe(422);
    expect(result.body.error?.code).toBe('VALIDATION_ERROR');
    expect(result.body.error?.details?.length).toBeGreaterThan(0);
  });

  it('rejects an unknown category', async () => {
    const result = await resident.post('/api/complaints', {
      title: 'Valid title here',
      description: 'A description long enough to satisfy the minimum length rule.',
      category: 'TELEPORTATION',
    });
    expect(result.status).toBe(422);
  });

  it('rejects a malformed JSON body', async () => {
    const result = await resident.request('/api/complaints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not json',
    });
    expect(result.status).toBe(422);
    expect(result.body.error?.message).toMatch(/valid JSON/i);
  });

  it('rejects a malformed identifier', async () => {
    const result = await resident.get('/api/complaints/not-a-uuid');
    expect(result.status).toBe(422);
  });

  it('rejects a weak password at registration', async () => {
    const result = await new Client().post('/api/auth/register', {
      fullName: 'Weak Password',
      email: `weak.${Date.now()}@example.test`,
      password: 'short',
      flatNumber: 'A-1',
    });
    expect(result.status).toBe(422);
  });

  it('returns 409 with a field error for a duplicate email', async () => {
    const result = await new Client().post('/api/auth/register', {
      fullName: 'Duplicate Account',
      email: 'ananya.iyer@greenwoodheights.in',
      password: 'Passw0rdTest',
      flatNumber: 'A-1',
    });
    expect(result.status).toBe(409);
    expect(result.body.error?.code).toBe('CONFLICT');
    expect(result.body.error?.details).toBeDefined();
  });

  it('never leaks a stack trace or SQL to the client', async () => {
    const result = await resident.get('/api/complaints/00000000-0000-0000-0000-000000000000');
    const serialized = JSON.stringify(result.body);

    expect(serialized).not.toMatch(/at .+\(.+:\d+:\d+\)/);
    expect(serialized).not.toMatch(/select .+ from/i);
    expect(serialized).not.toContain('password_hash');
  });
});

describe('pagination and filtering', () => {
  it('reports totals for the whole result set, not the page', async () => {
    const page = await admin.get<unknown[]>('/api/admin/complaints?pageSize=2&page=1');

    expect(page.body.data!.length).toBeLessThanOrEqual(2);
    expect(page.body.meta!.total as number).toBeGreaterThanOrEqual(page.body.data!.length);
    expect(page.body.meta!.totalPages as number).toBeGreaterThanOrEqual(1);
  });

  it('returns different rows on different pages', async () => {
    const first = await admin.get<Array<{ id: string }>>('/api/admin/complaints?pageSize=3&page=1');
    const second = await admin.get<Array<{ id: string }>>('/api/admin/complaints?pageSize=3&page=2');

    const firstIds = new Set(first.body.data!.map((row) => row.id));
    for (const row of second.body.data!) {
      expect(firstIds.has(row.id)).toBe(false);
    }
  });

  it('filters by status in SQL', async () => {
    const result = await admin.get<Array<{ status: string }>>(
      '/api/admin/complaints?status=RESOLVED&pageSize=100',
    );
    expect(result.body.data!.every((row) => row.status === 'RESOLVED')).toBe(true);
  });

  it('filters by category in SQL', async () => {
    const result = await admin.get<Array<{ category: string }>>(
      '/api/admin/complaints?category=PLUMBING&pageSize=100',
    );
    expect(result.body.data!.every((row) => row.category === 'PLUMBING')).toBe(true);
  });

  it('filters by priority in SQL', async () => {
    const result = await admin.get<Array<{ priority: string }>>(
      '/api/admin/complaints?priority=HIGH&pageSize=100',
    );
    expect(result.body.data!.every((row) => row.priority === 'HIGH')).toBe(true);
  });

  it('accepts multiple values for one filter', async () => {
    const result = await admin.get<Array<{ status: string }>>(
      '/api/admin/complaints?status=OPEN,IN_PROGRESS&pageSize=100',
    );
    expect(result.body.data!.every((row) => ['OPEN', 'IN_PROGRESS'].includes(row.status))).toBe(true);
  });

  it('searches reference, title and description', async () => {
    const all = await admin.get<Array<{ reference: string }>>('/api/admin/complaints?pageSize=1');
    const reference = all.body.data![0]!.reference;

    const found = await admin.get<Array<{ reference: string }>>(
      `/api/admin/complaints?q=${encodeURIComponent(reference)}`,
    );
    expect(found.body.data!.some((row) => row.reference === reference)).toBe(true);
  });

  it('caps page size so a client cannot request the whole table', async () => {
    const result = await admin.get('/api/admin/complaints?pageSize=100000');
    expect(result.status).toBe(422);
  });
});

describe('dashboard accuracy', () => {
  it('status totals sum to the overall total', async () => {
    const dashboard = await admin.get<{
      totals: { total: number; open: number; inProgress: number; resolved: number };
      statusBreakdown: Array<{ status: string; count: number }>;
      categoryBreakdown: Array<{ count: number }>;
    }>('/api/admin/dashboard');

    const { totals, statusBreakdown, categoryBreakdown } = dashboard.body.data!;

    expect(totals.open + totals.inProgress + totals.resolved).toBe(totals.total);
    expect(statusBreakdown.reduce((sum, row) => sum + row.count, 0)).toBe(totals.total);
    expect(categoryBreakdown.reduce((sum, row) => sum + row.count, 0)).toBe(totals.total);
  });

  it('agrees with the complaint list totals', async () => {
    const dashboard = await admin.get<{ totals: { total: number } }>('/api/admin/dashboard');
    const list = await admin.get('/api/admin/complaints?pageSize=1');

    expect(dashboard.body.data!.totals.total).toBe(list.body.meta!.total);
  });

  it('returns a full 30-day trend series with no gaps', async () => {
    const dashboard = await admin.get<{ trend: Array<{ date: string }> }>('/api/admin/dashboard');
    const trend = dashboard.body.data!.trend;

    expect(trend.length).toBeGreaterThanOrEqual(30);
    // Generated from a date series, so quiet days appear as zeros.
    const dates = trend.map((point) => point.date);
    expect(new Set(dates).size).toBe(dates.length);
  });
});
