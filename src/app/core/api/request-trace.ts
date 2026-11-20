import { HttpContextToken } from '@angular/common/http';

/** What the retry policy did after an attempt failed. */
export type RetryNote =
  /** It will try again after `delayMs`: the backoff, or longer if CORE said to wait. */
  | { readonly type: 'retry'; readonly delayMs: number; readonly reason: 'backoff' | 'retry-after' }
  /**
   * It stopped: the error would only happen again (`permanent`), every retry was used
   * (`exhausted`), or waiting as long as CORE asked would pass the wait budget (`wait-budget`).
   */
  | {
      readonly type: 'give-up';
      readonly reason: 'permanent' | 'exhausted' | 'wait-budget';
      readonly error: unknown;
    }
  /** The request was cancelled while it waited to try again. */
  | { readonly type: 'cancelled' };

let lastTraceId = 0;

/**
 * Follows one logical request through its attempts. CoreApiService puts one in the request's
 * HttpContext, which every retry and clone of the request shares; the Under the hood interceptor
 * numbers the attempts as they go out and listens to what retryTransient decides after each failure.
 */
export class RequestTrace {
  readonly id = ++lastTraceId;
  private attempts = 0;
  private listener: ((note: RetryNote) => void) | null = null;

  /** Counts an attempt as it is sent and returns its number, from 1. */
  nextAttempt(): number {
    return ++this.attempts;
  }

  listen(listener: (note: RetryNote) => void): void {
    this.listener = listener;
  }

  note(note: RetryNote): void {
    this.listener?.(note);
  }
}

/** A request sent without a trace gets its own, so its attempts are still counted. */
export const REQUEST_TRACE = new HttpContextToken<RequestTrace>(() => new RequestTrace());
