import { HttpErrorResponse } from '@angular/common/http';
import { TimeoutError } from 'rxjs';

export type ApiErrorKind = 'rate-limit' | 'network' | 'timeout' | 'bad-query' | 'server';

const MESSAGES: Record<ApiErrorKind, string> = {
  'rate-limit': 'CORE is limiting how often we can search. Wait a few seconds and try again.',
  network: 'Could not reach CORE. Check your connection and try again.',
  timeout: 'CORE took too long to respond. Try again, or make the search more specific.',
  'bad-query':
    'CORE could not run this search. Check the field names and quotes, or simplify the query.',
  server: 'CORE is having trouble right now. Try again in a moment.',
};

export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly kind: ApiErrorKind,
    readonly status: number | null = null,
    options?: ErrorOptions,
  ) {
    super(MESSAGES[kind], options);
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (error instanceof TimeoutError) {
    return new ApiError('timeout', null, { cause: error });
  }
  if (error instanceof HttpErrorResponse) {
    return new ApiError(kindFor(error), error.status, { cause: error });
  }
  return new ApiError('server', null, { cause: error });
}

/**
 * CORE runs on Azure AI Search and answers some queries that it cannot parse, such as an unknown
 * field, a quoted phrase on its own or a range in square brackets, with a 500 whose message says
 * the search engine refused them with a 400. Unlike other 500s these fail the same way every time.
 */
export function isRejectedQuery(error: HttpErrorResponse): boolean {
  const body: unknown = error.error;
  const message =
    typeof body === 'string'
      ? body
      : body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : '';
  return error.status === 500 && /search failed with status code: 400\b/i.test(message);
}

function kindFor(error: HttpErrorResponse): ApiErrorKind {
  const { status } = error;
  if (isRejectedQuery(error)) {
    return 'bad-query';
  }
  if (status === 0) {
    return 'network';
  }
  if (status === 429) {
    return 'rate-limit';
  }
  if (status === 400 || status === 422) {
    return 'bad-query';
  }
  return 'server';
}
