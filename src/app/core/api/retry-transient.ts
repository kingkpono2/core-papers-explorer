import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { MonoTypeOperatorFunction, defer, retry, throwError, timer } from 'rxjs';

export interface RetryPolicy {
  maxRetries: number;
  /** First backoff delay; doubles on each retry. */
  baseDelayMs: number;
  /** Upper bound on the time spent waiting between attempts for one request. */
  maxTotalDelayMs: number;
}

/**
 * Retries rate-limited (429), server (5xx) and network (status 0) failures with exponential
 * backoff. A 429 waits at least until the server's Retry-After time. Gives up instead of waiting
 * past `maxTotalDelayMs`. Other errors, including timeouts and 4xx, are rethrown immediately.
 */
export function retryTransient<T>(policy: RetryPolicy): MonoTypeOperatorFunction<T> {
  return (source) =>
    defer(() => {
      let totalDelayMs = 0;
      return source.pipe(
        retry({
          count: policy.maxRetries,
          delay: (error: unknown, attempt: number) => {
            if (!isTransient(error)) {
              return throwError(() => error);
            }
            const backoffMs = policy.baseDelayMs * 2 ** (attempt - 1);
            const retryAfter = error.status === 429 ? retryAfterMs(error.headers) : null;
            const delayMs = Math.max(backoffMs, retryAfter ?? 0);
            if (totalDelayMs + delayMs > policy.maxTotalDelayMs) {
              return throwError(() => error);
            }
            totalDelayMs += delayMs;
            return timer(delayMs);
          },
        }),
      );
    });
}

export function isTransient(error: unknown): error is HttpErrorResponse {
  return (
    error instanceof HttpErrorResponse &&
    (error.status === 0 || error.status === 429 || error.status >= 500)
  );
}

/**
 * Milliseconds until the server allows another request. CORE sends `X-RateLimit-Retry-After` as a
 * timestamp such as `2026-11-19T21:47:53+0000`; the standard `Retry-After` may be seconds or a date.
 * CORE does not list these headers in Access-Control-Expose-Headers, so browsers currently see
 * null here and the exponential backoff applies.
 */
export function retryAfterMs(headers: HttpHeaders, now = Date.now()): number | null {
  const value = (headers.get('X-RateLimit-Retry-After') ?? headers.get('Retry-After'))?.trim();
  if (!value) {
    return null;
  }
  if (/^\d+$/.test(value)) {
    return Number(value) * 1000;
  }
  const retryAt = Date.parse(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(retryAt) ? null : Math.max(0, retryAt - now);
}
