import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ADMIN,
  Client,
  RESIDENT_A,
  RESIDENT_B,
  adminClient,
  pool,
  residentClient,
  uniqueEmail,
} from './helpers';

/**
 * Authorization.
 *
 * The assignment's hardest requirement to get right, and the easiest to fake:
 * plenty of submissions hide admin links in the UI and call it role-based
 * access. These tests bypass the UI entirely and call the API directly as each
 * role, which is exactly what an attacker would do.
 */

let admin: Client;
let residentA: Client;
let residentB: Client;
let residentAComplaintId: string;

beforeAll(async () => {
  admin = await adminClient();
  residentA = await residentClient(RESIDENT_A);
  residentB = await residentClient(RESIDENT_B);

  const created = await residentA.post<{ id: string }>('/api/complaints', {
    title: 'Authorization fixture complaint',
    description: 'Raised by resident A so resident B can be denied access to it.',
    category: 'OTHER',
  });
  residentAComplaintId = created.body.data!.id;
});

afterAll(async () => {
  await pool.end();
});

describe('unauthenticated access', () => {
  const anonymous = new Client();

  it.each([
    ['/api/auth/me'],
    ['/api/complaints'],
    ['/api/notices'],
    ['/api/admin/complaints'],
    ['/api/admin/dashboard'],
    ['/api/admin/settings'],
    ['/api/admin/emails'],
  ])('rejects GET %s with 401', async (path) => {
    const result = await anonymous.get(path);
    expect(result.status).toBe(401);
    expect(result.body.error?.code).toBe('UNAUTHORIZED');
  });

  it('rejects writes without a session', async () => {
    const result = await anonymous.post('/api/complaints', {
      title: 'Should never be created',
      description: 'This request carries no session cookie at all.',
      category: 'OTHER',
    });
    expect(result.status).toBe(401);
  });
});

describe('resident cannot reach admin endpoints', () => {
  it('is forbidden from the admin complaint list', async () => {
    const result = await residentA.get('/api/admin/complaints');
    expect(result.status).toBe(403);
    expect(result.body.error?.code).toBe('FORBIDDEN');
  });

  it('is forbidden from admin analytics', async () => {
    expect((await residentA.get('/api/admin/dashboard')).status).toBe(403);
  });

  it('is forbidden from creating notices', async () => {
    const result = await residentA.post('/api/admin/notices', {
      title: 'Resident should not be able to post this',
      body: 'If this succeeds, any resident can broadcast to the whole society.',
      isImportant: true,
    });
    expect(result.status).toBe(403);
  });

  it('is forbidden from changing complaint status — even on their own complaint', async () => {
    const result = await residentA.patch(
      `/api/admin/complaints/${residentAComplaintId}/status`,
      { status: 'RESOLVED' },
    );
    expect(result.status).toBe(403);
  });

  it('is forbidden from changing priority', async () => {
    const result = await residentA.patch(
      `/api/admin/complaints/${residentAComplaintId}/priority`,
      { priority: 'HIGH' },
    );
    expect(result.status).toBe(403);
  });

  it('is forbidden from changing society settings', async () => {
    const result = await residentA.patch('/api/admin/settings', { overdueThresholdDays: 1 });
    expect(result.status).toBe(403);
  });

  it('is forbidden from reading the email log', async () => {
    expect((await residentA.get('/api/admin/emails')).status).toBe(403);
  });
});

describe('cross-resident data isolation', () => {
  it("returns 404 — not 403 — for another resident's complaint", async () => {
    const result = await residentB.get(`/api/complaints/${residentAComplaintId}`);
    // 403 would confirm the record exists, which is itself a disclosure.
    expect(result.status).toBe(404);
    expect(result.body.error?.code).toBe('NOT_FOUND');
  });

  it("returns 404 for another resident's history", async () => {
    const result = await residentB.get(`/api/complaints/${residentAComplaintId}/history`);
    expect(result.status).toBe(404);
  });

  it('scopes the complaint list to the caller in SQL', async () => {
    const result = await residentA.get<Array<{ resident: { id: string } }>>(
      '/api/complaints?pageSize=100',
    );
    expect(result.status).toBe(200);

    const distinctOwners = new Set(result.body.data!.map((row) => row.resident.id));
    expect(distinctOwners.size).toBeLessThanOrEqual(1);
  });

  it('cannot widen its own list with query parameters', async () => {
    const scoped = await residentA.get<unknown[]>('/api/complaints?pageSize=100');
    const attempted = await residentA.get<unknown[]>(
      '/api/complaints?pageSize=100&residentId=all&status=OPEN,IN_PROGRESS,RESOLVED',
    );

    // The injected parameter is ignored; the ownership filter is not optional.
    expect(attempted.body.data!.length).toBeLessThanOrEqual(scoped.body.data!.length);
  });

  it('lets an admin read any complaint', async () => {
    const result = await admin.get(`/api/complaints/${residentAComplaintId}`);
    expect(result.status).toBe(200);
  });
});

describe('privilege escalation', () => {
  it('ignores a role supplied at registration', async () => {
    const client = new Client();
    const email = uniqueEmail('escalation');

    const result = await client.post<{ user: { role: string } }>('/api/auth/register', {
      fullName: 'Escalation Attempt',
      email,
      password: 'Passw0rdTest',
      flatNumber: 'Z-999',
      // Not part of the schema — must be stripped, never honoured.
      role: 'ADMIN',
    });

    expect(result.status).toBe(201);
    expect(result.body.data!.user.role).toBe('RESIDENT');

    const { rows } = await pool.query('SELECT role FROM users WHERE email = $1', [email]);
    expect(rows[0].role).toBe('RESIDENT');

    await pool.query('DELETE FROM users WHERE email = $1', [email]);
  });
});

describe('session handling', () => {
  it('does not reveal whether an email is registered', async () => {
    const client = new Client();

    const wrongPassword = await client.post('/api/auth/login', {
      email: RESIDENT_A.email,
      password: 'DefinitelyWrong1',
    });
    const noSuchUser = await client.post('/api/auth/login', {
      email: 'nobody.at.all@example.test',
      password: 'DefinitelyWrong1',
    });

    expect(wrongPassword.status).toBe(401);
    expect(noSuchUser.status).toBe(401);
    // Identical message: the response must not distinguish the two cases.
    expect(wrongPassword.body.error?.message).toBe(noSuchUser.body.error?.message);
  });

  it('revokes the session server-side on logout', async () => {
    const client = new Client();
    await client.login(ADMIN.email, ADMIN.password);

    expect((await client.get('/api/auth/me')).status).toBe(200);
    expect((await client.post('/api/auth/logout')).status).toBe(200);
    // The cookie is cleared, and the row behind it is gone — an opaque session
    // is genuinely dead after logout, unlike a JWT.
    expect((await client.get('/api/auth/me')).status).toBe(401);
  });

  it('stores only a hash of the session token', async () => {
    const { rows } = await pool.query('SELECT token_hash FROM sessions LIMIT 1');
    if (rows.length > 0) {
      // HMAC-SHA256 hex — never the raw token the cookie carries.
      expect(rows[0].token_hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('never stores a password in plaintext', async () => {
    const { rows } = await pool.query('SELECT password_hash FROM users LIMIT 5');
    for (const row of rows) {
      expect(row.password_hash).toMatch(/^\$2[aby]\$\d{2}\$/);
      expect(row.password_hash).not.toContain('Admin@');
      expect(row.password_hash).not.toContain('Resident@');
    }
  });
});
