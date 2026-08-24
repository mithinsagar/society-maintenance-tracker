import 'server-only';

/**
 * PostgreSQL error inspection.
 *
 * Drizzle wraps driver errors in its own `DrizzleQueryError`, so the pg error
 * code is not on the object you catch — it is further down the `cause` chain.
 * Checking only the top-level object silently misses every constraint
 * violation, which turns an expected 409 into an unhandled 500.
 *
 * This walks the chain and is the one place that knows the shape.
 */

export const PG_ERRORS = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514',
  RESTRICT_VIOLATION: '23001',
  EXCLUSION_VIOLATION: '23P01',
} as const;

const MAX_DEPTH = 8;

/** Returns the SQLSTATE code from anywhere in the error's cause chain. */
export function pgErrorCode(error: unknown): string | undefined {
  let current = error;

  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) return undefined;

    if ('code' in current) {
      const code = (current as { code: unknown }).code;
      // SQLSTATE codes are five characters; Node system errors also use
      // `code` (e.g. 'ECONNREFUSED'), so check the shape before trusting it.
      if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    }

    if (!('cause' in current)) return undefined;
    current = (current as { cause: unknown }).cause;
  }

  return undefined;
}

/** The constraint name that failed, when the driver reports one. */
export function pgConstraintName(error: unknown): string | undefined {
  let current = error;

  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) return undefined;
    if ('constraint' in current) {
      const constraint = (current as { constraint: unknown }).constraint;
      if (typeof constraint === 'string') return constraint;
    }
    if (!('cause' in current)) return undefined;
    current = (current as { cause: unknown }).cause;
  }

  return undefined;
}

export function isUniqueViolation(error: unknown): boolean {
  return pgErrorCode(error) === PG_ERRORS.UNIQUE_VIOLATION;
}
