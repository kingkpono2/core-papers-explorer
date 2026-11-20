import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { MonoTypeOperatorFunction, defer, retry, tap, throwError, timer } from 'rxjs';
import { isRejectedQuery } from './api-error';
import { RequestTrace } from './request-trace';

export interface RetryPolicy {
  maxRetries: number;
  /** First backoff delay; doubles on each retry. */
  baseDelayMs: number;
  /** Upper bound on the time spent waiting between attempts for one request. */
  maxTotalDelayMs: number;
}

/**
 * Retries rate-limited (429), server (5xx) and network (status 0) failures with exponential
 * backoff, except CORE's 500 for a query it cannot parse, which would only fail again. A 429 waits
 * at least until the server's Retry-After time. Gives up instead of waiting past
 * `maxTotalDelayMs`. Other errors, including timeouts and 4xx, are rethrown immediately.
 *
 * Each decision is noted on `trace`, if given, so Under the hood can say why an attempt was or was
 * not followed by another.
 */
export function retryTransient<T>(
  policy: RetryPolicy,
  trace?: RequestTrace,
): MonoTypeOperatorFunction<T> {
  return (source) =>
    defer(() => {
      let totalDelayMs = 0;
      let waiting = false;
      let settled = false;
      const giveUp = (error: unknown, reason: 'permanent' | 'wait-budget') => {
        settled = true;
        trace?.note({ type: 'give-up', reason, error });
        return throwError(() => error);
      };
      return source.pipe(
        retry({
          count: policy.maxRetries,
          delay: (error: unknown, attempt: number) => {
            if (!isTransient(error)) {
              return giveUp(error, 'permanent');
            }
            const backoffMs = policy.baseDelayMs * 2 ** (attempt - 1);
            const retryAfter = error.status === 429 ? retryAfterMs(error.headers) : null;
            const delayMs = Math.max(backoffMs, retryAfter ?? 0);
            if (totalDelayMs + delayMs > policy.maxTotalDelayMs) {
              return giveUp(error, 'wait-budget');
            }
            totalDelayMs += delayMs;
            waiting = true;
            trace?.note({
              type: 'retry',
              delayMs,
              reason: delayMs > backoffMs ? 'retry-after' : 'backoff',
            });
            return timer(delayMs).pipe(tap(() => (waiting = false)));
          },
        }),
        tap({
          complete: () => (settled = true),
          // Once every retry is used, retry() passes the last error on without asking delay().
          error: (error: unknown) => {
            if (!settled) {
              settled = true;
              const reason = isTransient(error) ? 'exhausted' : 'permanent';
              trace?.note({ type: 'give-up', reason, error });
            }
          },
          // Unsubscribing during an attempt cancels that request, which the interceptor records;
          // during a wait it cancels the retry, which only this operator knows about.
          unsubscribe: () => {
            if (waiting) {
              trace?.note({ type: 'cancelled' });
            }
          },
        }),
      );
    });
}

export function isTransient(error: unknown): error is HttpErrorResponse {
  return (
    error instanceof HttpErrorResponse &&
    (error.status === 0 || error.status === 429 || error.status >= 500) &&
    !isRejectedQuery(error)
  );
}

/**
 * Milliseconds until the server allows another request. CORE sends `X-RateLimit-Retry-After` as a
 * timestamp such as `2026-11-19T21:47:53+0000`; the standard `Retry-After` may be seconds or a date.
 * CORE does not list these headers in Access-Control-Expose-Headers, but the app calls CORE through
 * a same-origin proxy, so the browser can read them.
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
