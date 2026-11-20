import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { defer, tap } from 'rxjs';
import { toApiError } from '../api/api-error';
import { CORE_API_CONFIG } from '../api/core-api.config';
import { REQUEST_TRACE } from '../api/request-trace';
import { RequestLog } from '../diagnostics/request-log';
import { responseFacts } from '../diagnostics/response-facts';

/**
 * Records every request to the CORE API for Under the hood: each attempt as it is sent, then its
 * status, timings and headers, or how it failed or was cancelled. Retries are recorded as further
 * attempts of the same logical request (see RequestTrace). Registered after the API key
 * interceptor, so what it records is what is sent. Nothing leaves the browser.
 */
export const underTheHoodInterceptor: HttpInterceptorFn = (req, next) => {
  const { baseUrl } = inject(CORE_API_CONFIG);
  if (!req.url.startsWith(`${baseUrl}/`)) {
    return next(req);
  }
  const log = inject(RequestLog);
  // HttpClient runs the interceptors again for every subscription, so every retry passes here.
  return defer(() => {
    const trace = req.context.get(REQUEST_TRACE);
    const attempt = trace.nextAttempt();
    if (attempt === 1) {
      trace.listen((note) => log.note(trace.id, note));
    }
    const { path, query } = describeRequest(req, baseUrl);
    const id = log.start({ trace: trace.id, attempt, method: req.method, endpoint: path, query });
    return next(req).pipe(
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
