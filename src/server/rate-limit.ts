import 'server-only';

import { env } from '@/lib/env';

import { RateLimitError } from './errors';

/**
 * Fixed-window rate limiter, in memory.
 *
 * Scope and honesty about it: this counts per process. On a single Vercel
 * region that is a real defence against credential stuffing and registration
 * spam from one address. Across many concurrent instances the effective limit
 * is (limit x instances), so this raises the cost of an attack rather than
 * capping it absolutely.
 *
 * The correct production answer is a shared counter — Upstash Redis or
 * Vercel KV — which is a drop-in replacement for `consume()` below. That is
 * noted in the README under future improvements rather than pulled in here,
 * because adding a hosted dependency for a placement build costs more than it
 * returns, and pretending an in-memory limiter is distributed would be worse
 * than saying plainly that it is not.
 */

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

/** Bounded so a flood of unique keys cannot grow the map without limit. */
const MAX_TRACKED_KEYS = 10_000;

function sweep(now: number): void {
  for (const [key, window] of buckets) {
    if (window.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitRule {
  /** Requests permitted within the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export const RATE_LIMITS = {
  /** Credential stuffing is the threat; keep this tight. */
  login: { limit: 8, windowSeconds: 300 },
  /**
   * Guards the same bcrypt comparison as login, against a signed-in caller
   * instead of an IP — a stolen session should not double as an unlimited
   * oracle for guessing the account's current password.
   */
  changePassword: { limit: 8, windowSeconds: 300 },
  /** Registration spam. */
  register: { limit: 5, windowSeconds: 3600 },
  /** Signature issuance — prevents using us as a free Cloudinary proxy. */
  upload: { limit: 30, windowSeconds: 3600 },
  /** Blanket protection for authenticated write endpoints. */
  write: { limit: 120, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Records one attempt against `key`, throwing once the window is exhausted.
 * Call before doing any expensive work (a bcrypt comparison, an upload
 * signature), never after.
 */
export function consume(key: string, rule: RateLimitRule): void {
  // Never true in production — see `env.rateLimitDisabled`.
  if (env.rateLimitDisabled) return;

  const now = Date.now();

  if (buckets.size > MAX_TRACKED_KEYS) sweep(now);

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowSeconds * 1000 });
    return;
  }

  existing.count += 1;

  if (existing.count > rule.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    throw new RateLimitError(retryAfterSeconds);
  }
}

/** Clears all counters. Test-only. */
export function __resetRateLimits(): void {
  buckets.clear();
}
