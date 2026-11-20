import { RequestLogEntry } from '../../core/diagnostics/request-log';
import { RateLimit } from '../../core/diagnostics/response-facts';

/**
 * The value below which `p` percent of `values` fall, by the nearest-rank method: always one of
 * the values themselves, never an interpolation. Null for no values.
 */
export function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((Math.min(100, Math.max(0, p)) / 100) * sorted.length);
  return sorted[Math.max(1, rank) - 1];
}

export interface SessionStats {
  /** Attempts sent over the network, whatever became of them. */
  readonly requests: number;
  /** Attempts a Break it switch answered instead, which never left the browser. */
  readonly faked: number;
  /** Over the attempts that got an answer or failed after being sent. */
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
  /** Failed attempts out of finished ones, faked included: the failures the app had to handle. */
  readonly failed: number;
  readonly finished: number;
  readonly errorRate: number | null;
  /** Requests the app answered from memory, and responses Vercel's CDN served from its cache. */
  readonly memoryHits: number;
  readonly cdnHits: number;
  /** Cache hits out of everything that could have been one: memory hits plus server answers. */
  readonly cacheHitRate: number | null;
  /** The budget from the latest response with CORE's rate-limit headers. */
  readonly budget: RateLimit | null;
}

const CDN_HITS = new Set(['HIT', 'STALE']);

/** Works out the session's figures from the request log, newest entry first. */
export function sessionStats(entries: readonly RequestLogEntry[]): SessionStats {
  const network = entries.filter((entry) => entry.source === 'network');
  const sent = network.filter((entry) => !entry.injected);
  const finished = network.filter((entry) => entry.outcome === 'ok' || entry.outcome === 'error');
  const failed = finished.filter((entry) => entry.outcome === 'error').length;
  const latencies = sent
    .filter((entry) => entry.outcome === 'ok' || entry.outcome === 'error')
    .flatMap((entry) => (entry.durationMs === null ? [] : [entry.durationMs]));
  const answered = sent.filter((entry) => entry.status !== null && entry.status > 0);
  const memoryHits = entries.length - network.length;
  const cdnHits = answered.filter((entry) => entry.cdnCache && CDN_HITS.has(entry.cdnCache)).length;
  const lookups = memoryHits + answered.length;
  return {
    requests: sent.length,
    faked: network.length - sent.length,
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    failed,
    finished: finished.length,
    errorRate: finished.length ? failed / finished.length : null,
    memoryHits,
    cdnHits,
    cacheHitRate: lookups ? (memoryHits + cdnHits) / lookups : null,
    budget: sent.find((entry) => entry.rateLimit)?.rateLimit ?? null,
  };
}
