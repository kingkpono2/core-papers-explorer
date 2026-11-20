import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  LOCALE_ID,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RequestLog, RequestLogEntry } from '../../../core/diagnostics/request-log';
import {
  SEGMENT_LABELS,
  Segment,
  SegmentKind,
  describeSegments,
  endpointLabel,
  followUpText,
  formatBytes,
  formatMs,
  injectedLabel,
  segments,
  statusOf,
  timelineScale,
} from '../timeline';

const CONFIRMATION_MS = 2_000;
const CDN_HITS = new Set(['HIT', 'STALE']);
const LEGEND: SegmentKind[] = ['core', 'proxy', 'network', 'held'];

/** Everything a row shows, worked out once per change rather than in the template. */
interface Row {
  readonly entry: RequestLogEntry;
  readonly endpoint: string;
  readonly status: ReturnType<typeof statusOf>;
  readonly duration: string | null;
  /** The bar's length, as a share of the slowest attempt listed. */
  readonly barPercent: number;
  /** Its parts, each as a share of the bar. */
  readonly bars: readonly (Segment & { share: number })[];
  readonly split: string | null;
  /** When, which attempt of which request, size and budget, such as `13:57:02 · …`. */
  readonly meta: string;
  /** Vercel's CDN cache status, as a badge; a hit never reached the proxy or CORE. */
  readonly cdn: { readonly label: string; readonly hit: boolean } | null;
  readonly injected: string | null;
  readonly followUp: string | null;
}

/**
 * The live list of requests, newest first: when, what, the outcome, where the time went, cache and
 * attempt, the proxy's request id, and what the retry policy did next.
 */
@Component({
  selector: 'app-request-timeline',
  templateUrl: './request-timeline.html',
  styleUrl: './request-timeline.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestTimeline {
  /** Newest first, as the request log lists them. */
  readonly entries = input.required<readonly RequestLogEntry[]>();

  private readonly log = inject(RequestLog);
  private readonly navigator = inject(DOCUMENT).defaultView!.navigator;
  private readonly clock = new Intl.DateTimeFormat(inject(LOCALE_ID), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  private timer?: ReturnType<typeof setTimeout>;

  protected readonly legend = LEGEND.map((kind) => ({ kind, label: SEGMENT_LABELS[kind] }));
  protected readonly copied = signal<string | null>(null);

  protected readonly rows = computed(() => {
    const entries = this.entries();
    const scale = timelineScale(entries);
    return entries.map((entry): Row => {
      const parts = segments(entry);
      const total = parts.reduce((sum, part) => sum + part.ms, 0);
      return {
        entry,
        endpoint: endpointLabel(entry.endpoint),
        status: statusOf(entry),
        duration:
          entry.source === 'network' && entry.durationMs !== null
            ? formatMs(entry.durationMs)
            : null,
        barPercent: (total / scale) * 100,
        bars: parts.map((part) => ({ ...part, share: (part.ms / total) * 100 })),
        split: parts.length ? describeSegments(parts) : null,
        meta: [
          this.clock.format(entry.startedAt),
          entry.trace === null ? null : `request ${entry.trace}, attempt ${entry.attempt}`,
          entry.sizeBytes === null ? null : formatBytes(entry.sizeBytes),
          entry.rateLimit ? `budget ${entry.rateLimit.remaining}/${entry.rateLimit.limit}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        cdn: entry.cdnCache
          ? { label: `CDN ${entry.cdnCache.toLowerCase()}`, hit: CDN_HITS.has(entry.cdnCache) }
          : null,
        injected: injectedLabel(entry),
        followUp: followUpText(entry),
      };
    });
  });

  /** Behind the dev proxy there is no Server-Timing, so the time cannot be split. */
  protected readonly noServerTiming = computed(() =>
    this.entries().some(
      (entry) =>
        entry.source === 'network' &&
        entry.outcome === 'ok' &&
        entry.proxyMs === null &&
        !entry.cdnCache,
    ),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected clear(): void {
    this.log.clear();
  }

  protected async copy(requestId: string): Promise<void> {
    try {
      await this.navigator.clipboard.writeText(requestId);
      clearTimeout(this.timer);
      this.copied.set(requestId);
      this.timer = setTimeout(() => this.copied.set(null), CONFIRMATION_MS);
    } catch {
      this.copied.set(null);
    }
  }
}
