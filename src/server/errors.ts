/**
 * Application error hierarchy.
 *
 * Every error a route can produce is one of these. Each carries a stable
 * machine-readable `code`, an HTTP status, and a message that is safe to show
 * a user. Anything that is *not* an AppError is treated as an unexpected
 * failure: logged in full server-side, and reported to the client as a generic
 * 500 with a request id. Stack traces and driver messages never cross the wire.
 */

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_TRANSITION'
  | 'RATE_LIMITED'
  | 'UPLOAD_FAILED'
  | 'INTERNAL_ERROR';

export interface FieldError {
  path: string;
  message: string;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: FieldError[];
  /** Extra context for the server log only — never serialized to the client. */
  readonly context?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    status: number,
    message: string,
    options?: { details?: FieldError[]; context?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = options?.details;
    this.context = options?.context;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Please correct the highlighted fields.', details?: FieldError[]) {
    super('VALIDATION_ERROR', 422, message, { details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'You need to sign in to continue.') {
    super('UNAUTHORIZED', 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super('FORBIDDEN', 403, message);
  }
}

/**
 * Also used deliberately in place of 403 when a resident requests a resource
 * belonging to someone else. Returning 403 would confirm that the resource
 * exists, which is itself a leak; 404 reveals nothing.
 */
export class NotFoundError extends AppError {
  constructor(message = 'We could not find what you were looking for.') {
    super('NOT_FOUND', 404, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: FieldError[]) {
    super('CONFLICT', 409, message, { details });
  }
}

/** A status change the lifecycle does not allow, e.g. reopening a resolved complaint. */
export class InvalidTransitionError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('INVALID_TRANSITION', 409, message, { context });
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, message = 'Too many attempts. Please try again shortly.') {
    super('RATE_LIMITED', 429, message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class UploadError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('UPLOAD_FAILED', 400, message, { cause: options?.cause });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
