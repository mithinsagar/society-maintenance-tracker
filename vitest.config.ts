import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

config({ path: '.env' });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The API tests drive a real server and a real database; the default
    // 5s ceiling is not enough for bcrypt at cost 12 plus a round trip.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Sequential: these tests share one database and assert on global counts,
    // so parallel workers would interfere with each other.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
