import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { ApiErrorKind, toApiError } from '../api/api-error';
import { RetryNote } from '../api/request-trace';
import { FaultPlan } from './fault-injection';
import { ResponseFacts } from './response-facts';
import { RingBuffer } from './ring-buffer';

/** Enough for a session of searching, and small enough never to matter. */
export const REQUEST_LOG_CAPACITY = 100;

/** A monotonic clock in milliseconds, for durations; tests replace it. */
export const MONOTONIC_NOW = new InjectionToken<() => number>('MONOTONIC_NOW', {
  providedIn: 'root',
  factory: () => () => performance.now(),
});

export type RequestOutcome = 'pending' | 'ok' | 'error' | 'cancelled';

/** What the retry policy did after a failed attempt. */
export type FollowUp =
  | { readonly type: 'retry'; readonly delayMs: number; readonly reason: 'backoff' | 'retry-after' }
  | { readonly type: 'give-up'; readonly reason: 'permanent' | 'exhausted' | 'wait-budget' }
  | { readonly type: 'cancelled' };

/** An attempt as it is sent. */
export interface RequestStart {
  /** The logical request the attempt belongs to; its retries share it. */
  readonly trace: number;
  /** From 1. */
  readonly attempt: number;
  readonly method: string;
  /** The path below the API base URL, such as `/search/works/`. */
  readonly endpoint: string;
  /** The search query (`q`), decoded. */
  readonly query: string | null;
  /** A failure faked by a Break it switch instead of sending the request. */
  readonly injected: FaultPlan['failure'];
  /** Time a Break it switch held the request before it was sent or failed. */
  readonly injectedDelayMs: number;
}

/** A request the app answered from its own cache, without asking CORE. */
export interface MemoryHit {
  readonly method: string;
  readonly endpoint: string;
  readonly query: string | null;
}

export interface RequestLogEntry extends Omit<ResponseFacts, 'status'> {
  readonly id: number;
  /** `memory` for a request answered from the app's cache: no request was made. */
  readonly source: 'network' | 'memory';
  /** The logical request; null for a memory hit. */
  readonly trace: number | null;
  /** From 1; 0 for a memory hit. */
  readonly attempt: number;
  readonly method: string;
  readonly endpoint: string;
  readonly query: string | null;
  readonly injected: FaultPlan['failure'];
  readonly injectedDelayMs: number;
  /** Wall-clock time the attempt started, for display. */
  readonly startedAt: number;
  /** Monotonic time it started, for durations. */
  readonly startTime: number;
  readonly durationMs: number | null;
  readonly outcome: RequestOutcome;
  /** `0` for a network failure; null while pending, once cancelled, or for a memory hit. */
  readonly status: number | null;
  readonly errorKind: ApiErrorKind | null;
  readonly followUp: FollowUp | null;
}

const NO_FACTS: Omit<ResponseFacts, 'status'> = {
  sizeBytes: null,
  coreMs: null,
  proxyMs: null,
  cdnCache: null,
  rateLimit: null,
  requestId: null,
};

/**
 * The last 100 requests to CORE, for Under the hood: every attempt as it is sent, completed with
 * its outcome, timings and headers, plus the requests the app answered from memory. Recording is a
 * write to a ring buffer; the newest-first list is only built when something reads it, which is
 * only while the drawer is open. Nothing is stored or sent anywhere: a reload starts afresh.
 */
@Injectable({ providedIn: 'root' })
export class RequestLog {
  private readonly now = inject(MONOTONIC_NOW);
  private readonly buffer = new RingBuffer<RequestLogEntry>(REQUEST_LOG_CAPACITY);
  private readonly version = signal(0);

  /** Newest first. */
  readonly entries = computed(() => {
    this.version();
    return this.buffer.toArray();
  });

  /** Records an attempt as it is sent and returns its id. */
  start(request: RequestStart): number {
    return this.push({
      ...NO_FACTS,
      ...request,
      source: 'network',
      startedAt: Date.now(),
      startTime: this.now(),
      durationMs: null,
      outcome: 'pending',
      status: null,
      errorKind: null,
      followUp: null,
    });
  }

  succeed(id: number, facts: ResponseFacts): void {
    this.settle(id, (entry) => ({ ...entry, ...facts, outcome: 'ok' }));
  }

  /** `facts` is null when the error had no response at all, such as a timeout. */
  fail(id: number, kind: ApiErrorKind, facts: ResponseFacts | null = null): void {
    this.settle(id, (entry) => ({ ...entry, ...facts, outcome: 'error', errorKind: kind }));
  }

  /** The attempt was unsubscribed from before it finished: a new search, or the timeout. */
  cancel(id: number): void {
    this.settle(id, (entry) => ({ ...entry, outcome: 'cancelled' }));
  }

  /** Adds what the retry policy decided to the latest attempt of a logical request. */
  note(trace: number, note: RetryNote): void {
    const latest = this.buffer.toArray().find((entry) => entry.trace === trace);
    if (!latest) {
      return;
    }
    if (note.type !== 'give-up') {
      const followUp: FollowUp =
        note.type === 'retry'
          ? { type: 'retry', delayMs: note.delayMs, reason: note.reason }
          : { type: 'cancelled' };
      this.replace({ ...latest, followUp });
      return;
    }
    // The timeout cancels the attempt before the retry policy hears of it, so this is the first
    // the log knows that the cancelled attempt timed out.
    const timedOut = latest.outcome === 'cancelled' && toApiError(note.error).kind === 'timeout';
    this.replace({
      ...latest,
      ...(timedOut ? { outcome: 'error' as const, errorKind: 'timeout' as const } : {}),
      followUp: { type: 'give-up', reason: note.reason },
    });
  }

  servedFromMemory(hit: MemoryHit): void {
    this.push({
      ...NO_FACTS,
      ...hit,
      source: 'memory',
      trace: null,
      attempt: 0,
      injected: null,
      injectedDelayMs: 0,
      startedAt: Date.now(),
      startTime: this.now(),
      durationMs: 0,
      outcome: 'ok',
      status: null,
      errorKind: null,
      followUp: null,
    });
  }

  clear(): void {
    this.buffer.clear();
    this.changed();
  }

  private push(entry: Omit<RequestLogEntry, 'id'>): number {
    const id = this.buffer.nextSequence;
    this.buffer.push({ ...entry, id });
    this.changed();
    return id;
  }

  /** Completes a pending attempt; a later outcome never overwrites the first. */
  private settle(id: number, update: (entry: RequestLogEntry) => RequestLogEntry): void {
    const entry = this.buffer.get(id);
    if (entry?.outcome === 'pending') {
      this.replace({ ...update(entry), durationMs: this.now() - entry.startTime });
    }
  }

  private replace(entry: RequestLogEntry): void {
    if (this.buffer.replace(entry.id, entry)) {
      this.changed();
    }
  }

  private changed(): void {
    this.version.update((version) => version + 1);
  }
}
