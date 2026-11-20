import { ApiErrorKind } from '../../core/api/api-error';
import { AGGREGATE_PATH, SEARCH_PATH } from '../../core/api/core-api.config';
import { FAULT_SWITCHES } from '../../core/diagnostics/fault-injection';
import { RequestLogEntry } from '../../core/diagnostics/request-log';

export type SegmentKind = 'held' | 'core' | 'proxy' | 'network' | 'total';

export interface Segment {
  readonly kind: SegmentKind;
  readonly ms: number;
}

export const SEGMENT_LABELS: Record<SegmentKind, string> = {
  held: 'held by Break it',
  core: 'CORE',
  proxy: 'proxy',
  network: 'network',
  total: 'total',
};

const CDN_HITS = new Set(['HIT', 'STALE']);

/**
 * Where an attempt's time went. The browser times the whole attempt; the proxy's Server-Timing
 * gives the time CORE took and the whole time in the proxy, so the rest of the proxy and the
 * network between browser and proxy follow. Time a Break it switch held the attempt comes first.
 * A CDN hit never reached the proxy, so it is all network. Without Server-Timing, behind the dev
 * proxy, the time is not split.
 */
export function segments(entry: RequestLogEntry): Segment[] {
  const { durationMs } = entry;
  if (entry.source === 'memory' || durationMs === null) {
    return [];
  }
  const held = Math.min(entry.injectedDelayMs, durationMs);
  const rest = durationMs - held;
  const parts: Segment[] = [{ kind: 'held', ms: held }];
  if (entry.injected) {
    // A faked failure was never sent, so nothing else took any time.
  } else if (entry.cdnCache && CDN_HITS.has(entry.cdnCache)) {
    parts.push({ kind: 'network', ms: rest });
  } else if (entry.proxyMs === null) {
    parts.push({ kind: 'total', ms: rest });
  } else {
    const core = Math.min(entry.coreMs ?? 0, rest);
    const proxy = Math.min(Math.max(entry.proxyMs - (entry.coreMs ?? 0), 0), rest - core);
    parts.push(
      { kind: 'core', ms: core },
      { kind: 'proxy', ms: proxy },
      { kind: 'network', ms: rest - core - proxy },
    );
  }
  return parts.filter((part) => part.ms > 0);
}

/** The duration the bars are drawn against: the slowest attempt listed, and at least a second. */
export function timelineScale(entries: readonly RequestLogEntry[]): number {
  return Math.max(1_000, ...entries.map((entry) => entry.durationMs ?? 0));
}

export function formatMs(ms: number): string {
  if (ms < 1_000) {
    return `${Math.round(ms)} ms`;
  }
  return `${(ms / 1_000).toFixed(ms < 9_950 ? 1 : 0)} s`;
}

export function formatBytes(bytes: number): string {
  return bytes < 1_000 ? `${bytes} B` : `${(bytes / 1_000).toFixed(1)} kB`;
}

/** Such as `CORE 512 ms · proxy 18 ms · network 110 ms`. */
export function describeSegments(parts: readonly Segment[]): string {
  return parts.map(({ kind, ms }) => `${SEGMENT_LABELS[kind]} ${formatMs(ms)}`).join(' · ');
}

export function endpointLabel(endpoint: string): string {
  switch (endpoint) {
    case SEARCH_PATH:
      return 'search';
    case AGGREGATE_PATH:
      return 'aggregate';
    default:
      return endpoint;
  }
}

export type StatusTone = 'ok' | 'warning' | 'danger' | 'neutral' | 'memory';

const KIND_LABELS: Record<ApiErrorKind, string> = {
  'rate-limit': 'Rate limited',
  network: 'No response',
  timeout: 'Timed out',
  'bad-query': 'Rejected',
  server: 'Server error',
};

export function statusOf(entry: RequestLogEntry): { label: string; tone: StatusTone } {
  if (entry.source === 'memory') {
    return { label: 'Memory', tone: 'memory' };
  }
  switch (entry.outcome) {
    case 'pending':
      return { label: 'Pending', tone: 'neutral' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'neutral' };
    case 'ok':
      return { label: String(entry.status), tone: 'ok' };
    case 'error': {
      const kind = entry.errorKind ?? 'server';
      const label = entry.status ? `${entry.status} ${KIND_LABELS[kind]}` : KIND_LABELS[kind];
      return { label, tone: kind === 'rate-limit' ? 'warning' : 'danger' };
    }
  }
}

/** The Break it switch that faked the attempt's answer, such as `Rate limited`. */
export function injectedLabel(entry: RequestLogEntry): string | null {
  return FAULT_SWITCHES.find(({ mode }) => mode === entry.injected)?.label ?? null;
}

/** What the retry policy did after the attempt, in words. */
export function followUpText(entry: RequestLogEntry): string | null {
  const { followUp } = entry;
  if (!followUp) {
    return null;
  }
  if (followUp.type === 'retry') {
    return followUp.reason === 'retry-after'
      ? `Next attempt after ${formatMs(followUp.delayMs)}, as CORE’s Retry-After asked`
      : `Next attempt after ${formatMs(followUp.delayMs)}: exponential backoff`;
  }
  if (followUp.type === 'cancelled') {
    return 'Retry cancelled by a newer request';
  }
  switch (followUp.reason) {
    case 'permanent':
      if (entry.errorKind === 'bad-query') {
        return 'Not retried: CORE rejected the query, so it would fail again';
      }
      return entry.errorKind === 'timeout'
        ? 'Not retried: it timed out'
        : 'Not retried: it would fail again';
    case 'exhausted':
      return 'Gave up: every retry was used';
    case 'wait-budget':
      return 'Gave up: CORE asked for a longer wait than the app allows';
  }
}
