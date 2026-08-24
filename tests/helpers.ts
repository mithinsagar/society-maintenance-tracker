/**
 * Test helpers.
 *
 * These tests exercise the running application over real HTTP against a real
 * PostgreSQL database — not mocks. That is deliberate: the properties under
 * test here are transaction boundaries, database constraints, SQL-level
 * ownership scoping and cookie handling, and every one of those is exactly
 * what a mock would paper over.
 */
import { Pool } from 'pg';

export const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL!;

export const pool = new Pool({
  connectionString,
  max: 3,
  ssl:
    connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
      ? undefined
      : { rejectUnauthorized: false },
});

export interface ApiResult<T = unknown> {
  status: number;
  body: { data?: T; error?: { code: string; message: string; details?: unknown[] }; meta?: Record<string, unknown> };
}

/**
 * A client that carries its own cookie jar, so each test can hold several
 * independent sessions at once (admin, resident A, resident B) and assert that
 * they genuinely see different things.
 */
export class Client {
  private cookie = '';

  async request<T = unknown>(
    path: string,
    init: RequestInit & { json?: unknown } = {},
  ): Promise<ApiResult<T>> {
    const { json, headers, ...rest } = init;

    const response = await fetch(`${BASE_URL}${path}`, {
      ...rest,
      headers: {
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      redirect: 'manual',
    });

    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const parsed = setCookie.split(';')[0];
      if (parsed) this.cookie = parsed;
    }

    let body: ApiResult<T>['body'] = {};
    const text = await response.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { error: { code: 'NON_JSON', message: text.slice(0, 200) } };
      }
    }

    return { status: response.status, body };
  }

  get<T = unknown>(path: string) {
    return this.request<T>(path, { method: 'GET' });
  }
  post<T = unknown>(path: string, json?: unknown) {
    return this.request<T>(path, { method: 'POST', json });
  }
  patch<T = unknown>(path: string, json?: unknown) {
    return this.request<T>(path, { method: 'PATCH', json });
  }
  del<T = unknown>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }

  async login(email: string, password: string): Promise<void> {
    const result = await this.post('/api/auth/login', { email, password });
    if (result.status !== 200) {
      throw new Error(`Login failed for ${email}: ${result.status} ${JSON.stringify(result.body)}`);
    }
  }
}

export const ADMIN = {
  email: process.env.SEED_ADMIN_EMAIL ?? 'admin@greenwoodheights.in',
  password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345',
};

export const RESIDENT_PASSWORD = process.env.SEED_RESIDENT_PASSWORD ?? 'Resident@12345';

export const RESIDENT_A = { email: 'ananya.iyer@greenwoodheights.in', password: RESIDENT_PASSWORD };
export const RESIDENT_B = { email: 'rohit.deshmukh@greenwoodheights.in', password: RESIDENT_PASSWORD };

export async function adminClient(): Promise<Client> {
  const client = new Client();
  await client.login(ADMIN.email, ADMIN.password);
  return client;
}

export async function residentClient(
  account: { email: string; password: string } = RESIDENT_A,
): Promise<Client> {
  const client = new Client();
  await client.login(account.email, account.password);
  return client;
}

/** Restores the overdue threshold so one test cannot leak into another. */
export async function setThreshold(days: number): Promise<void> {
  await pool.query('UPDATE app_settings SET overdue_threshold_days = $1 WHERE id = 1', [days]);
  // The settings service caches for 30s; wait it out rather than reaching into
  // process-internal state the tests should not know about.
  await new Promise((resolve) => setTimeout(resolve, 31_000));
}

/** Directly sets the threshold without waiting — for assertions made in SQL. */
export async function setThresholdRaw(days: number): Promise<void> {
  await pool.query('UPDATE app_settings SET overdue_threshold_days = $1 WHERE id = 1', [days]);
}

export function uniqueEmail(prefix = 'test'): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 100000)}@example.test`;
}
