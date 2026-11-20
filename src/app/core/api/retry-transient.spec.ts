import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { NEVER, Observable, defer, of, throwError } from 'rxjs';
import { RequestTrace, RetryNote } from './request-trace';
import { RetryPolicy, isTransient, retryAfterMs, retryTransient } from './retry-transient';

describe('retryAfterMs', () => {
  const now = Date.parse('2026-01-01T00:00:00Z');
  const headers = (values: Record<string, string>) => new HttpHeaders(values);

  it("parses CORE's timestamp format", () => {
    expect(
      retryAfterMs(headers({ 'X-RateLimit-Retry-After': '2026-01-01T00:00:05+0000' }), now),
    ).toBe(5_000);
  });

  it('accepts a standard Retry-After in seconds', () => {
    expect(retryAfterMs(headers({ 'Retry-After': '2' }), now)).toBe(2_000);
  });

  it('never returns a negative delay', () => {
    expect(
      retryAfterMs(headers({ 'X-RateLimit-Retry-After': '2025-12-31T23:59:00+0000' }), now),
    ).toBe(0);
  });

  it('returns null when the header is missing or unreadable', () => {
    expect(retryAfterMs(headers({}), now)).toBeNull();
    expect(retryAfterMs(headers({ 'Retry-After': 'soon' }), now)).toBeNull();
  });
});

describe('isTransient', () => {
  const httpError = (status: number) => new HttpErrorResponse({ status });

  it('treats network, 429 and 5xx failures as transient', () => {
    expect([0, 429, 500, 503].map((status) => isTransient(httpError(status)))).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it("treats CORE's 500 for a rejected query as permanent", () => {
    const error = new HttpErrorResponse({
      status: 500,
      error: { message: 'Azure search failed with status code: 400. Error context: …' },
    });

    expect(isTransient(error)).toBeFalse();
  });

  it('treats other client errors and non-HTTP errors as permanent', () => {
    expect(isTransient(httpError(400))).toBeFalse();
    expect(isTransient(httpError(404))).toBeFalse();
    expect(isTransient(new Error('boom'))).toBeFalse();
  });
});

describe('retryTransient notes', () => {
  const policy: RetryPolicy = { maxRetries: 3, baseDelayMs: 1_000, maxTotalDelayMs: 10_000 };
  const rejected = new HttpErrorResponse({
    status: 500,
    error: { message: 'Azure search failed with status code: 400. foo is not a searchable field.' },
  });
  const httpError = (status: number, headers: Record<string, string> = {}) =>
    new HttpErrorResponse({ status, headers: new HttpHeaders(headers) });
  let trace: RequestTrace;
  let notes: RetryNote[];

  /** A request that fails with each of `errors` in turn, then succeeds. */
  const flaky = (...errors: unknown[]): Observable<string> =>
    defer(() => {
      const error = errors.shift();
      return error ? throwError(() => error) : of('ok');
    });

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-01-01T00:00:00Z'));
    trace = new RequestTrace();
    notes = [];
    trace.listen((note) => notes.push(note));
  });

  afterEach(() => jasmine.clock().uninstall());

  it('notes each retry with its delay, and whether CORE asked for a longer wait', () => {
    const values: string[] = [];
    flaky(httpError(503), httpError(429, { 'X-RateLimit-Retry-After': '2026-01-01T00:00:05+0000' }))
      .pipe(retryTransient(policy, trace))
      .subscribe((value) => values.push(value));

    jasmine.clock().tick(1_000);
    jasmine.clock().tick(4_000);

    expect(notes).toEqual([
      { type: 'retry', delayMs: 1_000, reason: 'backoff' },
      { type: 'retry', delayMs: 4_000, reason: 'retry-after' },
    ]);
    expect(values).toEqual(['ok']);
  });

  it('notes giving up on an error that would happen again', () => {
    flaky(rejected)
      .pipe(retryTransient(policy, trace))
      .subscribe({ error: () => undefined });

    expect(notes).toEqual([{ type: 'give-up', reason: 'permanent', error: rejected }]);
  });

  it('notes giving up when CORE asks for a wait beyond the budget', () => {
    const limited = httpError(429, { 'X-RateLimit-Retry-After': '2026-01-01T00:01:00+0000' });
    flaky(limited)
      .pipe(retryTransient(policy, trace))
      .subscribe({ error: () => undefined });

    expect(notes).toEqual([{ type: 'give-up', reason: 'wait-budget', error: limited }]);
  });

  it('notes giving up once every retry is used', () => {
    const last = httpError(503);
    flaky(httpError(503), httpError(503), httpError(503), last)
      .pipe(retryTransient(policy, trace))
      .subscribe({ error: () => undefined });

    jasmine.clock().tick(1_000 + 2_000 + 4_000);

    expect(notes.map((note) => note.type)).toEqual(['retry', 'retry', 'retry', 'give-up']);
    expect(notes[3]).toEqual({ type: 'give-up', reason: 'exhausted', error: last });
  });

  it('notes a retry cancelled while it waits, but not a cancelled attempt', () => {
    flaky(httpError(503)).pipe(retryTransient(policy, trace)).subscribe().unsubscribe();
    expect(notes.map((note) => note.type)).toEqual(['retry', 'cancelled']);

    notes = [];
    trace.listen((note) => notes.push(note));
    NEVER.pipe(retryTransient(policy, trace)).subscribe().unsubscribe();
    expect(notes).toEqual([]);
  });

  it('says nothing about a request that succeeds first time', () => {
    flaky().pipe(retryTransient(policy, trace)).subscribe();

    expect(notes).toEqual([]);
  });
});
