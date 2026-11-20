import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TimeoutError } from 'rxjs';
import { MONOTONIC_NOW, REQUEST_LOG_CAPACITY, RequestLog, RequestStart } from './request-log';
import { ResponseFacts } from './response-facts';

describe('RequestLog', () => {
  const startedAt = Date.parse('2026-11-20T10:00:00Z');
  const facts: ResponseFacts = {
    status: 200,
    sizeBytes: 2048,
    coreMs: 400,
    proxyMs: 410,
    cdnCache: 'MISS',
    rateLimit: { remaining: 9, limit: 10 },
    requestId: 'abc',
  };
  let log: RequestLog;
  let now: number;

  const start = (overrides: Partial<RequestStart> = {}) =>
    log.start({
      trace: 1,
      attempt: 1,
      method: 'GET',
      endpoint: '/search/works/',
      query: 'drone',
      injected: null,
      injectedDelayMs: 0,
      ...overrides,
    });
  const entry = (id: number) => log.entries().find((e) => e.id === id)!;

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(startedAt));
    now = 1_000;
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: MONOTONIC_NOW, useValue: () => now },
      ],
    });
    log = TestBed.inject(RequestLog);
  });

  afterEach(() => jasmine.clock().uninstall());

  it('records an attempt as pending, then completes it with its duration and headers', () => {
    const id = start();

    expect(entry(id)).toEqual(
      jasmine.objectContaining({
        source: 'network',
        trace: 1,
        attempt: 1,
        method: 'GET',
        endpoint: '/search/works/',
        query: 'drone',
        startedAt,
        outcome: 'pending',
        durationMs: null,
        status: null,
      }),
    );

    now += 640.5;
    log.succeed(id, facts);

    expect(entry(id)).toEqual(
      jasmine.objectContaining({ ...facts, outcome: 'ok', durationMs: 640.5, errorKind: null }),
    );
  });

  it('records a failure with its kind, with or without a response', () => {
    const limited = start();
    const timedOut = start({ trace: 2 });
    now += 20;

    log.fail(limited, 'rate-limit', { ...facts, status: 429, rateLimit: null });
    log.fail(timedOut, 'timeout');

    expect(entry(limited)).toEqual(
      jasmine.objectContaining({ outcome: 'error', status: 429, errorKind: 'rate-limit' }),
    );
    expect(entry(timedOut)).toEqual(
      jasmine.objectContaining({ outcome: 'error', status: null, errorKind: 'timeout' }),
    );
  });

  it('records a cancelled attempt, and never changes an attempt once it has finished', () => {
    const cancelled = start();
    const done = start({ trace: 2 });
    log.succeed(done, facts);

    log.cancel(cancelled);
    log.cancel(done);
    log.fail(cancelled, 'network');

    expect(entry(cancelled).outcome).toBe('cancelled');
    expect(entry(done).outcome).toBe('ok');
  });

  it(`keeps only the last ${REQUEST_LOG_CAPACITY} entries, newest first`, () => {
    const ids = Array.from({ length: REQUEST_LOG_CAPACITY + 5 }, (_, i) =>
      start({ trace: i + 1, query: `query ${i + 1}` }),
    );

    const entries = log.entries();
    expect(entries.length).toBe(REQUEST_LOG_CAPACITY);
    expect(entries[0].query).toBe(`query ${REQUEST_LOG_CAPACITY + 5}`);
    expect(entries.at(-1)!.query).toBe('query 6');

    // Finishing an attempt that has been pushed out changes nothing.
    log.succeed(ids[0], facts);
    expect(log.entries()).toBe(entries);
  });

  it('adds the retry decision to the latest attempt of its request', () => {
    const first = start({ trace: 7 });
    log.fail(first, 'rate-limit', { ...facts, status: 429 });
    log.note(7, { type: 'retry', delayMs: 3_000, reason: 'retry-after' });
    const second = start({ trace: 7, attempt: 2 });
    const other = start({ trace: 8 });
    log.fail(second, 'server', { ...facts, status: 503 });
    log.note(7, { type: 'give-up', reason: 'exhausted', error: new Error('503') });
    log.note(99, { type: 'cancelled' });

    expect(entry(first).followUp).toEqual({ type: 'retry', delayMs: 3_000, reason: 'retry-after' });
    expect(entry(second).followUp).toEqual({ type: 'give-up', reason: 'exhausted' });
    expect(entry(other).followUp).toBeNull();
  });

  it('turns an attempt cancelled by the timeout into a timed-out one', () => {
    const id = start({ trace: 3 });
    now += 30_000;
    log.cancel(id);

    log.note(3, { type: 'give-up', reason: 'permanent', error: new TimeoutError() });

    expect(entry(id)).toEqual(
      jasmine.objectContaining({
        outcome: 'error',
        errorKind: 'timeout',
        durationMs: 30_000,
        followUp: { type: 'give-up', reason: 'permanent' },
      }),
    );
  });

  it('keeps the outcome when giving up on an attempt that failed', () => {
    const id = start({ trace: 4 });
    log.fail(id, 'bad-query', { ...facts, status: 500 });

    log.note(4, {
      type: 'give-up',
      reason: 'permanent',
      error: new HttpErrorResponse({ status: 500 }),
    });

    expect(entry(id)).toEqual(
      jasmine.objectContaining({ outcome: 'error', errorKind: 'bad-query' }),
    );
  });

  it('records a request answered from memory as a request that was never sent', () => {
    log.servedFromMemory({ method: 'GET', endpoint: '/search/works/', query: 'drone' });

    expect(log.entries()[0]).toEqual(
      jasmine.objectContaining({
        source: 'memory',
        trace: null,
        attempt: 0,
        method: 'GET',
        query: 'drone',
        startedAt,
        outcome: 'ok',
        durationMs: 0,
        status: null,
      }),
    );
  });

  it('clears every entry', () => {
    start();
    log.servedFromMemory({ method: 'GET', endpoint: '/search/works/', query: 'drone' });

    log.clear();

    expect(log.entries()).toEqual([]);
  });

  it('builds the list only when something changed', () => {
    start();
    const before = log.entries();

    expect(log.entries()).toBe(before);
    start();
    expect(log.entries()).not.toBe(before);
  });
});
