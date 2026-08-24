import 'server-only';

import { z } from 'zod';

/**
 * Validated environment.
 *
 * Every environment variable in the application is read exactly once, here,
 * and validated at module load. A missing or malformed value fails the boot
 * with a readable message instead of surfacing later as an opaque runtime 500.
 *
 * This module is server-only. Importing it from a client component is a build
 * error, which is the guarantee that no secret can reach the browser bundle.
 */

const booleanish = z
  .string()
  .trim()
  .transform((value) => value.length > 0);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().min(1).optional(),

  APP_URL: z
    .string()
    .url('APP_URL must be an absolute URL, e.g. http://localhost:3000')
    .transform((value) => value.replace(/\/$/, '')),

  AUTH_SECRET: z
    .string()
    .min(32, 'AUTH_SECRET must be at least 32 characters. Generate with: openssl rand -base64 48'),

  /**
   * Seeds the initial overdue threshold only. Once the app_settings row
   * exists, that row is authoritative and this value is ignored.
   */
  OVERDUE_THRESHOLD_DAYS: z.coerce.number().int().min(1).max(365).default(7),

  CLOUDINARY_CLOUD_NAME: z.string().default(''),
  CLOUDINARY_API_KEY: z.string().default(''),
  CLOUDINARY_API_SECRET: z.string().default(''),
  CLOUDINARY_UPLOAD_FOLDER: z.string().default('society-maintenance/complaints'),

  /**
   * Test-only escape hatch for the in-memory rate limiter.
   *
   * The integration suite signs in many times from one address, which is
   * exactly what the limiter exists to stop. This is force-disabled in
   * production below, so setting it there has no effect.
   */
  RATE_LIMIT_DISABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  RESEND_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().default('Society Maintenance <onboarding@resend.dev>'),
  EMAIL_REDIRECT_TO: z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  throw new Error(
    `Invalid environment configuration:\n${issues}\n\n` +
      'Copy .env.example to .env and fill in the required values.',
  );
}

const raw = parsed.data;

export const env = {
  ...raw,

  isProduction: raw.NODE_ENV === 'production',
  isDevelopment: raw.NODE_ENV === 'development',
  isTest: raw.NODE_ENV === 'test',

  /**
   * Cloudinary is optional. When it is not fully configured the application
   * falls back to the local-disk storage provider, so the whole app remains
   * functional with zero third-party credentials.
   */
  hasCloudinary: Boolean(
    raw.CLOUDINARY_CLOUD_NAME && raw.CLOUDINARY_API_KEY && raw.CLOUDINARY_API_SECRET,
  ),

  /**
   * Resend is optional. Without a key the console provider renders emails to
   * the server log; the outbox records every attempt either way, so the
   * notification pipeline stays observable.
   */
  hasResend: Boolean(raw.RESEND_API_KEY),

  /**
   * Rate limiting can only ever be disabled outside production. The guard is
   * here rather than at the call site so there is exactly one place to audit.
   */
  rateLimitDisabled: raw.NODE_ENV !== 'production' && raw.RATE_LIMIT_DISABLED,
} as const;

export type Env = typeof env;

void booleanish;
