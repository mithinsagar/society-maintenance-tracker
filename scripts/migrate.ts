/**
 * Migration runner.
 *
 * Applies every SQL file in ./drizzle in journal order, inside a transaction,
 * recording each in drizzle's migrations table. Safe to re-run: already-applied
 * migrations are skipped.
 *
 *   npm run db:migrate
 */
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

config({ path: '.env' });

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DIRECT_URL or DATABASE_URL must be set.');
  process.exit(1);
}

const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

async function main() {
  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
  const db = drizzle(pool);

  console.info('[migrate] applying migrations from ./drizzle …');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.info('[migrate] done.');

  await pool.end();
}

main().catch((error: unknown) => {
  console.error('[migrate] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
