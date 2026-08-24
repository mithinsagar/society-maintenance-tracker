import 'server-only';

import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';
import { ZodError, type z } from 'zod';

import { PG_ERRORS, pgErrorCode } from './db/errors';
import { AppError, RateLimitError, ValidationError, isAppError, type FieldError } from './errors';

/**
 * The HTTP layer.
 *
 * Every route handler is wrapped by `apiHandler`, which gives the API three
 * properties that are otherwise easy to lose as a codebase grows:
 *
 *  1. A single response envelope, so clients parse one shape.
 *  2. One error mapping, so an unhandled throw anywhere becomes a correct
 *     status code with a safe message rather than a leaked stack trace.
 *  3. One place where unexpected failures are logged with a request id, which
 *     is the id the user is shown — so a support report maps to a log line.
 */

// ---------------------------------------------------------------------------
// Response envelope
// ---------------------------------------------------------------------------

// A type alias rather than an interface: TypeScript gives object type aliases
// an implicit index signature, so this remains assignable to the
// `Record<string, unknown>` half of the meta type below.
export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
};

export interface ApiSuccess<T> {
  data: T;
  /**
   * Pagination for list endpoints, plus any endpoint-specific extras
   * (delivery outcome on a status change, outbox summary on the email log).
   */
  meta?: Partial<PaginationMeta> & Record<string, unknown>;
}

export interface ApiFailure {
  error: {
    code: string;
    message: string;
    details?: FieldError[];
    requestId?: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T, init?: { status?: number; meta?: ApiSuccess<T>['meta'] }) {
  const body: ApiSuccess<T> = init?.meta ? { data, meta: init.meta } : { data };
  return NextResponse.json(body, { status: init?.status ?? 200 });
}

export function created<T>(data: T) {
  return ok(data, { status: 201 });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function buildPaginationMeta(page: number, pageSize: number, total: number): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { page, pageSize, total, totalPages, hasNextPage: page < totalPages };
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function zodToFieldErrors(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '_root',
    message: issue.message,
  }));
}

export function toErrorResponse(error: unknown, requestId: string): NextResponse<ApiFailure> {
  if (error instanceof ZodError) {
    const validation = new ValidationError(undefined, zodToFieldErrors(error));
    return NextResponse.json(
      { error: { code: validation.code, message: validation.message, details: validation.details } },
      { status: validation.status },
    );
  }

  if (isAppError(error)) {
    const headers = new Headers();
    if (error instanceof RateLimitError) {
      headers.set('Retry-After', String(error.retryAfterSeconds));
    }

    // 4xx are expected outcomes, not incidents — logged at a low level with no
    // stack, so real failures stay visible in the logs.
    if (error.status >= 500) {
      console.error(`[api:${requestId}] ${error.code}`, error.message, error.context ?? '');
    }

    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
      { status: error.status, headers },
    );
  }

  // Database constraint violations that escaped a service-layer check. These
  // are mapped rather than surfaced, because the raw driver message contains
  // table and column names.
  const pgCode = pgErrorCode(error);
  if (pgCode) {
    console.error(`[api:${requestId}] postgres ${pgCode}`, error);

    if (pgCode === PG_ERRORS.UNIQUE_VIOLATION) {
      return NextResponse.json(
        { error: { code: 'CONFLICT', message: 'That record already exists.', requestId } },
        { status: 409 },
      );
    }
    if (pgCode === PG_ERRORS.FOREIGN_KEY_VIOLATION || pgCode === PG_ERRORS.RESTRICT_VIOLATION) {
      return NextResponse.json(
        {
          error: {
            code: 'CONFLICT',
            message: 'That action conflicts with related records.',
            requestId,
          },
        },
        { status: 409 },
      );
    }
    if (pgCode === PG_ERRORS.CHECK_VIOLATION) {
      return NextResponse.json(
        {
          error: { code: 'VALIDATION_ERROR', message: 'That change is not allowed.', requestId },
        },
        { status: 422 },
      );
    }
  }

  // Genuinely unexpected. Log everything, return nothing but an id.
  console.error(`[api:${requestId}] unhandled`, error);

  return NextResponse.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong on our end. Please try again.',
        requestId,
      },
    },
    { status: 500 },
  );
}

// ---------------------------------------------------------------------------
// Handler wrapper
// ---------------------------------------------------------------------------

type RouteContext<P> = { params: Promise<P> };

/**
 * Wraps a route handler so no throw escapes unmapped.
 *
 * Handlers stay short: parse, authorize, call a service, return `ok(...)`.
 * Any error they raise — deliberate or not — is turned into the correct
 * response here.
 */
export function apiHandler<P = Record<string, string>>(
  handler: (request: Request, context: RouteContext<P>) => Promise<NextResponse> | NextResponse,
) {
  return async (request: Request, context: RouteContext<P>): Promise<NextResponse> => {
    const requestId = randomUUID();
    try {
      return await handler(request, context);
    } catch (error) {
      return toErrorResponse(error, requestId);
    }
  };
}

// ---------------------------------------------------------------------------
// Request parsing helpers
// ---------------------------------------------------------------------------

/** Parses a JSON body against a schema, converting a malformed body into a 422. */
export async function parseJsonBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError('Request body must be valid JSON.');
  }
  return schema.parse(raw);
}

/** Parses the query string against a schema, collapsing repeated keys into arrays. */
export function parseQuery<T extends z.ZodTypeAny>(request: Request, schema: T): z.infer<T> {
  const url = new URL(request.url);
  const record: Record<string, string | string[]> = {};

  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    const value = values.length > 1 ? values : values[0];
    if (value !== undefined) record[key] = value;
  }

  return schema.parse(record);
}

/** Best-effort client IP, used only for rate limiting and session bookkeeping. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export { AppError };
