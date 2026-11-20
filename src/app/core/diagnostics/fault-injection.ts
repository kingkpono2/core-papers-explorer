import { Injectable, computed, signal } from '@angular/core';

export type FaultMode = 'offline' | 'rate-limit' | 'slow' | 'rejected' | 'unavailable';

/** Fixed rather than configurable, so the demonstration is the same every time. */
export const RATE_LIMITED_ATTEMPTS = 2;
export const RATE_LIMIT_WAIT_MS = 3_000;
export const SLOW_DELAY_MS = 5_000;

export interface FaultSwitch {
  readonly mode: FaultMode;
  readonly label: string;
  /** What the switch does, and what the app should do about it, in a line. */
  readonly description: string;
}

/** The Break it switches, in the order the drawer lists them. */
export const FAULT_SWITCHES: readonly FaultSwitch[] = [
  {
    mode: 'rate-limit',
    label: 'Rate limited',
    description:
      'The first two attempts of each request get a 429 asking to wait 3 s. Expect the app to wait twice as told, then show the results.',
  },
  {
    mode: 'offline',
    label: 'Offline',
    description:
      'Every request fails as if the network were down. Expect retries after 1, 2 and 4 s, then “Could not reach CORE” with Retry.',
  },
  {
    mode: 'slow',
    label: 'Slow CORE',
    description:
      'Every request is held for 5 s before it is sent. Expect placeholders for longer, then the results: the app allows 30 s.',
  },
  {
    mode: 'rejected',
    label: 'CORE rejects the query',
    description:
      'CORE’s 500 for a query its search engine refuses. Expect no retry and a message to check the query, with no Retry button.',
  },
  {
    mode: 'unavailable',
    label: 'CORE unavailable',
    description:
      'Every attempt gets a 503. Expect retries after 1, 2 and 4 s, then “CORE is having trouble” with Retry.',
  },
];

/** What to do to one attempt: hold it for `delayMs`, then fake `failure` instead of sending it. */
export interface FaultPlan {
  readonly delayMs: number;
  readonly failure: Exclude<FaultMode, 'slow'> | null;
}

/**
 * The Break it switches of Under the hood. They live in memory only, so they are off whenever the
 * app starts, and they only change what the interceptor answers in this tab: CORE never sees a
 * faked request, and the app handles the answers with its real retry and error code.
 */
@Injectable({ providedIn: 'root' })
export class FaultInjection {
  private readonly modes = signal<ReadonlySet<FaultMode>>(new Set());

  /** The switches that are on. */
  readonly enabled = this.modes.asReadonly();
  readonly active = computed(() => this.modes().size > 0);

  set(mode: FaultMode, on: boolean): void {
    this.modes.update((modes) => {
      const next = new Set(modes);
      if (on) {
        next.add(mode);
      } else {
        next.delete(mode);
      }
      return next;
    });
  }

  turnOff(): void {
    this.modes.set(new Set());
  }

  /**
   * Faults apply in the order a request meets them: the network (offline, which fails at once),
   * the time it takes (slow), CORE's rate limiter (the first two attempts), then CORE itself
   * (unavailable, then rejected).
   */
  planFor(attempt: number): FaultPlan {
    const modes = this.modes();
    if (modes.has('offline')) {
      return { delayMs: 0, failure: 'offline' };
    }
    const delayMs = modes.has('slow') ? SLOW_DELAY_MS : 0;
    if (modes.has('rate-limit') && attempt <= RATE_LIMITED_ATTEMPTS) {
      return { delayMs, failure: 'rate-limit' };
    }
    if (modes.has('unavailable')) {
      return { delayMs, failure: 'unavailable' };
    }
    return { delayMs, failure: modes.has('rejected') ? 'rejected' : null };
  }
}
