/**
 * Destructive: drops and recreates the public schema, then re-applies
 * migrations. Development convenience only — refuses to run against a
 * production database URL.
 *
 *   npm run db:reset
 */
import { config } from 'dotenv';
import { Pool } from 'pg';

config({ path: '.env' });

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DIRECT_URL or DATABASE_URL must be set.');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to reset the database with NODE_ENV=production.');
  process.exit(1);
}

const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

async function main() {
  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });

  console.warn('[reset] dropping schemas "public" and "drizzle" …');
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE;');
  // The migration journal lives in its own schema. Dropping only `public`
  // would leave the journal intact and the next `db:migrate` would believe
  // every migration was already applied against an empty database.
  await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE;');
  await pool.query('CREATE SCHEMA public;');
  await pool.end();

  console.info('[reset] schema recreated. Run `npm run db:migrate` next.');
}

main().catch((error: unknown) => {
  console.error('[reset] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
