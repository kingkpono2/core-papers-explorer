import {
  HttpErrorResponse,
  HttpHeaders,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { defer, switchMap, tap, throwError, timer } from 'rxjs';
import { toApiError } from '../api/api-error';
import { CORE_API_CONFIG } from '../api/core-api.config';
import { REQUEST_TRACE } from '../api/request-trace';
import { FaultInjection, FaultPlan, RATE_LIMIT_WAIT_MS } from '../diagnostics/fault-injection';
import { RequestLog } from '../diagnostics/request-log';
import { responseFacts } from '../diagnostics/response-facts';

/**
 * Records every request to the CORE API for Under the hood: each attempt as it is sent, then its
 * status, timings and headers, or how it failed or was cancelled. Retries are recorded as further
 * attempts of the same logical request (see RequestTrace). Registered after the API key
 * interceptor, so what it records is what is sent. Nothing leaves the browser.
 *
 * It also applies the Break it switches (see FaultInjection): it can hold an attempt, or answer it
 * with a faked failure instead of sending it, so the rest of the app meets the failure exactly as
 * it would meet a real one.
 */
export const underTheHoodInterceptor: HttpInterceptorFn = (req, next) => {
  const { baseUrl } = inject(CORE_API_CONFIG);
  if (!req.url.startsWith(`${baseUrl}/`)) {
    return next(req);
  }
  const log = inject(RequestLog);
  const faults = inject(FaultInjection);
  // HttpClient runs the interceptors again for every subscription, so every retry passes here.
  return defer(() => {
    const trace = req.context.get(REQUEST_TRACE);
    const attempt = trace.nextAttempt();
    if (attempt === 1) {
      trace.listen((note) => log.note(trace.id, note));
    }
    const { delayMs, failure } = faults.planFor(attempt);
    const { path, query } = describeRequest(req, baseUrl);
    const id = log.start({
      trace: trace.id,
      attempt,
      method: req.method,
      endpoint: path,
      query,
      injected: failure,
      injectedDelayMs: delayMs,
    });
    const answer = failure ? throwError(() => fakeFailure(failure, req)) : next(req);
    return (delayMs ? timer(delayMs).pipe(switchMap(() => answer)) : answer).pipe(
      tap({
        next: (event) => {
          if (event instanceof HttpResponse) {
            log.succeed(id, responseFacts(event));
          }
        },
        error: (error: unknown) =>
          log.fail(
            id,
            toApiError(error).kind,
            error instanceof HttpErrorResponse ? responseFacts(error) : null,
          ),
        unsubscribe: () => log.cancel(id),
      }),
    );
  });
};

/**
 * The failure a switch fakes, shaped like the real one: what the fetch backend gives for a network
 * failure, CORE's 429 with its own Retry-After header, its 500 for a query its search engine
 * rejects, and a 503.
 */
function fakeFailure(
  failure: NonNullable<FaultPlan['failure']>,
  req: HttpRequest<unknown>,
): HttpErrorResponse {
  const url = req.urlWithParams;
  const note = '(Injected by Under the hood.)';
  switch (failure) {
    case 'offline':
      return new HttpErrorResponse({
        status: 0,
        statusText: 'Unknown Error',
        url,
        error: new TypeError(`Failed to fetch ${note}`),
      });
    case 'rate-limit':
      return new HttpErrorResponse({
        status: 429,
        statusText: 'Too Many Requests',
        url,
        headers: new HttpHeaders({
          'X-RateLimit-Retry-After': coreTimestamp(Date.now() + RATE_LIMIT_WAIT_MS),
        }),
        error: { message: `Too many requests. ${note}` },
      });
    case 'rejected':
      return new HttpErrorResponse({
        status: 500,
        statusText: 'Internal Server Error',
        url,
        error: { message: `Azure search failed with status code: 400. ${note}` },
      });
    case 'unavailable':
      return new HttpErrorResponse({
        status: 503,
        statusText: 'Service Unavailable',
        url,
        error: { message: `Service unavailable. ${note}` },
      });
  }
}

/** A time in CORE's X-RateLimit-Retry-After format, such as `2026-11-19T21:47:53+0000`. */
function coreTimestamp(ms: number): string {
  return new Date(Math.round(ms / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, '+0000');
}

/** The path below the base URL, and the search query from the URL or a JSON body. */
function describeRequest(
  req: HttpRequest<unknown>,
  baseUrl: string,
): { path: string; query: string | null } {
  const queryStart = req.url.indexOf('?');
  const path = req.url.slice(baseUrl.length, queryStart === -1 ? undefined : queryStart);
  const inUrl =
    queryStart === -1 ? null : new URLSearchParams(req.url.slice(queryStart + 1)).get('q');
  const { body } = req;
  const inBody =
    body && typeof body === 'object' && 'q' in body && typeof body.q === 'string' ? body.q : null;
  return { path, query: req.params.get('q') ?? inUrl ?? inBody };
}
