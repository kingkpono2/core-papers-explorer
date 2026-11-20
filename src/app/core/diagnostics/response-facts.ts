import { HttpHeaders, HttpResponseBase } from '@angular/common/http';
import { metricDuration, parseServerTiming } from './server-timing';

export interface RateLimit {
  readonly remaining: number;
  readonly limit: number;
}

/** What a response from CORE, or the proxy in front of it, says about itself in its headers. */
export interface ResponseFacts {
  /** `0` when the request never got a response, such as a network failure. */
  readonly status: number;
  /** From `Content-Length`, when the response has one. */
  readonly sizeBytes: number | null;
  /** From the proxy's `Server-Timing`: the time CORE took, and the whole time in the proxy. */
  readonly coreMs: number | null;
  readonly proxyMs: number | null;
  /** Vercel's CDN: `HIT`, `MISS`, `STALE` and so on. Absent locally, where there is no CDN. */
  readonly cdnCache: string | null;
  /** CORE's `X-RateLimit-Remaining` out of `X-RateLimit-Limit`. */
  readonly rateLimit: RateLimit | null;
  /** The proxy's `X-Request-Id`, which its log lines also carry. */
  readonly requestId: string | null;
}

/** Reads the facts Under the hood shows from a response or an `HttpErrorResponse`. */
export function responseFacts({ status, headers }: HttpResponseBase): ResponseFacts {
  const timing = parseServerTiming(headers.get('Server-Timing'));
  return {
    status,
    sizeBytes: wholeNumber(headers.get('Content-Length')),
    coreMs: metricDuration(timing, 'core'),
    proxyMs: metricDuration(timing, 'proxy'),
    cdnCache: headers.get('X-Vercel-Cache')?.trim().toUpperCase() || null,
    rateLimit: rateLimit(headers),
    requestId: headers.get('X-Request-Id')?.trim() || null,
  };
}

function rateLimit(headers: HttpHeaders): RateLimit | null {
  const remaining = wholeNumber(headers.get('X-RateLimit-Remaining'));
  const limit = wholeNumber(headers.get('X-RateLimit-Limit'));
  return remaining !== null && limit ? { remaining: Math.min(remaining, limit), limit } : null;
}

function wholeNumber(value: string | null): number | null {
  const text = value?.trim();
  return text && /^\d{1,15}$/.test(text) ? Number(text) : null;
}
