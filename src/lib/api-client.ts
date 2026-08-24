'use client';

/**
 * Browser-side API client.
 *
 * One place that knows the response envelope, so no component parses
 * `{ data }` / `{ error }` by hand. Server errors arrive as a typed
 * `ApiError` carrying the machine code and any field-level details, which is
 * what lets forms map a 422 back onto the exact inputs that failed.
 */

export interface FieldIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: FieldIssue[];
  readonly requestId?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: FieldIssue[],
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  /** Field errors keyed by input name, ready to hand to a form. */
  get fieldErrors(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const issue of this.details ?? []) {
      if (!map[issue.path]) map[issue.path] = issue.message;
    }
    return map;
  }
}

export interface ApiResult<T> {
  data: T;
  meta?: Record<string, unknown>;
}

async function request<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<ApiResult<T>> {
  const { json, headers, ...rest } = init ?? {};

  let response: Response;
  try {
    response = await fetch(path, {
      ...rest,
      headers: {
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      // Cookies carry the session; without this the API sees an anonymous call.
      credentials: 'same-origin',
    });
  } catch {
    // Distinguish "the network failed" from "the server said no" — they need
    // different messages and different recovery advice.
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection.');
  }

  if (response.status === 204) {
    return { data: undefined as T };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError(
      response.status,
      'INVALID_RESPONSE',
      'The server returned an unexpected response.',
    );
  }

  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string; details?: FieldIssue[]; requestId?: string } })
      ?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? 'Something went wrong.',
      error?.details,
      error?.requestId,
    );
  }

  return body as ApiResult<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, json?: unknown) => request<T>(path, { method: 'POST', json }),
  patch: <T>(path: string, json?: unknown) => request<T>(path, { method: 'PATCH', json }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  /** Multipart upload for the local storage provider. */
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', body: formData }),
};

/** Consistent user-facing copy for the common failure modes. */
export function describeError(error: unknown): { title: string; description?: string } {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'NETWORK_ERROR':
        return { title: 'Connection lost', description: 'Check your internet and try again.' };
      case 'RATE_LIMITED':
        return { title: 'Too many attempts', description: error.message };
      case 'UNAUTHORIZED':
        return { title: 'Session expired', description: 'Please sign in again to continue.' };
      case 'FORBIDDEN':
        return { title: 'Not permitted', description: error.message };
      case 'INVALID_TRANSITION':
        return { title: 'Change not allowed', description: error.message };
      case 'VALIDATION_ERROR':
        return { title: 'Please check the form', description: error.message };
      case 'INTERNAL_ERROR':
        return {
          title: 'Something went wrong',
          description: error.requestId
            ? `Please try again. Reference: ${error.requestId.slice(0, 8)}`
            : 'Please try again in a moment.',
        };
      default:
        return { title: error.message };
    }
  }
  return { title: 'Something went wrong', description: 'Please try again.' };
}
