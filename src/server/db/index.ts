import 'server-only';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { env } from '@/lib/env';

import * as schema from './schema';

/**
 * Database client.
 *
 * A single pool is cached on `globalThis` so Next.js' development hot-reload
 * does not open a new pool on every module refresh — the classic way to
 * exhaust Postgres connections locally.
 *
 * `max` is deliberately small: on Vercel each serverless instance keeps its own
 * pool, so a large per-instance pool multiplied by concurrent instances is what
 * exhausts the database. Neon's pooled connection string (PgBouncer) does the
 * real multiplexing; a handful of sockets per instance is the right shape.
 */

declare global {
  var __smtPool: Pool | undefined;
}

function createPool(): Pool {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.isProduction ? 5 : 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Managed Postgres (Neon, Supabase, Render) terminates TLS with a
    // certificate chain Node does not ship a root for. Verification is
    // relaxed only for those remote hosts, never for a local socket.
    ssl: env.DATABASE_URL.includes('localhost') || env.DATABASE_URL.includes('127.0.0.1')
      ? undefined
      : { rejectUnauthorized: false },
  });

  pool.on('error', (error) => {
    // An idle client erroring must never take the process down.
    console.error('[db] idle client error', error.message);
  });

  return pool;
}

const pool = globalThis.__smtPool ?? createPool();

if (!env.isProduction) {
  globalThis.__smtPool = pool;
}

export const db = drizzle(pool, { schema, casing: 'snake_case' });

export type Database = typeof db;

/** Transaction handle — the type passed to every `db.transaction(...)` callback. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Either the root client or an open transaction. Services accept this so they compose. */
export type DbClient = Database | Transaction;

export { schema };
export * from './schema';
