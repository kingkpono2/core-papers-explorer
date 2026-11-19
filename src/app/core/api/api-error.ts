import { HttpErrorResponse } from '@angular/common/http';
import { TimeoutError } from 'rxjs';

export type ApiErrorKind = 'rate-limit' | 'network' | 'timeout' | 'bad-query' | 'server';

const MESSAGES: Record<ApiErrorKind, string> = {
  'rate-limit': 'CORE is limiting how often we can search. Wait a few seconds and try again.',
  network: 'Could not reach CORE. Check your connection and try again.',
  timeout: 'CORE took too long to respond. Try again, or make the search more specific.',
  'bad-query': 'CORE could not run this search. Check the query and try again.',
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
    return new ApiError(kindForStatus(error.status), error.status, { cause: error });
  }
  return new ApiError('server', null, { cause: error });
}

function kindForStatus(status: number): ApiErrorKind {
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
