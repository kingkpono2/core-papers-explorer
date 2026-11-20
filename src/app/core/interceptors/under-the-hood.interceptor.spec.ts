import { HttpClient, HttpRequest, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApiError } from '../api/api-error';
import { CORE_API_CONFIG, CoreApiConfig } from '../api/core-api.config';
import { CoreApiService } from '../api/core-api.service';
import { FaultInjection } from '../diagnostics/fault-injection';
import { MONOTONIC_NOW, RequestLog, RequestLogEntry } from '../diagnostics/request-log';
import { SearchResult } from '../models/paper';
import { CoreSearchResponse } from '../models/core-api.models';
import { apiKeyInterceptor } from './api-key.interceptor';
import { underTheHoodInterceptor } from './under-the-hood.interceptor';

const searchUrl = '/core-api/v3/search/works/';
const aggregateUrl = '/core-api/v3/search/works/aggregate';
const isSearch = (req: HttpRequest<unknown>) => req.url === searchUrl;
const okResponse: CoreSearchResponse = { totalHits: 0, limit: 10, offset: 0, results: [] };
const rejected = {
  message: 'Azure search failed with status code: 400. foo is not a searchable field.',
};

describe('underTheHoodInterceptor', () => {
  let http: HttpTestingController;
  let api: CoreApiService;
  let log: RequestLog;

  const configure = (apiKey = '') => {
    const config: CoreApiConfig = {
      baseUrl: '/core-api/v3',
      apiKey,
      timeoutMs: 30_000,
      retry: { maxRetries: 3, baseDelayMs: 1_000, maxTotalDelayMs: 10_000 },
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([apiKeyInterceptor, underTheHoodInterceptor])),
        provideHttpClientTesting(),
        { provide: CORE_API_CONFIG, useValue: config },
        // The mock clock moves Date, so durations follow jasmine.clock().tick().
        { provide: MONOTONIC_NOW, useValue: () => Date.now() },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(CoreApiService);
    log = TestBed.inject(RequestLog);
  };

  /** Oldest first, which reads more naturally in a test. */
  const recorded = (): RequestLogEntry[] => [...log.entries()].reverse();
  const search = (query = 'drone') =>
    api.searchWorks({ query, limit: 10 }).subscribe({ error: () => undefined });

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-11-20T10:00:00Z'));
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    http.verify();
  });

  describe('recording', () => {
    beforeEach(() => configure());

    it('records a search as it is sent, then its status, timings and headers', () => {
      search('drone AND (package OR delivery)');
      const req = http.expectOne(isSearch);

      expect(recorded()).toEqual([
        jasmine.objectContaining({
          source: 'network',
          attempt: 1,
          method: 'GET',
          endpoint: '/search/works/',
          query: 'drone AND (package OR delivery)',
          startedAt: Date.parse('2026-11-20T10:00:00Z'),
          outcome: 'pending',
        }),
      ]);

      jasmine.clock().tick(640);
      req.flush(okResponse, {
        headers: {
          'Content-Length': '2048',
          'Server-Timing': 'core;dur=512.4;desc="CORE API", proxy;dur=530;desc="Proxy total"',
          'X-Vercel-Cache': 'MISS',
          'X-RateLimit-Remaining': '9',
          'X-RateLimit-Limit': '10',
          'X-Request-Id': '3f2a91c4',
        },
      });

      expect(recorded()).toEqual([
        jasmine.objectContaining({
          outcome: 'ok',
          status: 200,
          durationMs: 640,
          sizeBytes: 2048,
          coreMs: 512.4,
          proxyMs: 530,
          cdnCache: 'MISS',
          rateLimit: { remaining: 9, limit: 10 },
          requestId: '3f2a91c4',
          errorKind: null,
          followUp: null,
        }),
      ]);
    });

    it('records the query of an aggregation from its body', () => {
      api.countByYear('drone AND delivery').subscribe();
      http.expectOne(aggregateUrl).flush({ aggregations: { yearPublished: {} } });

      expect(recorded()).toEqual([
        jasmine.objectContaining({
          method: 'POST',
          endpoint: '/search/works/aggregate',
          query: 'drone AND delivery',
          outcome: 'ok',
        }),
      ]);
    });

    it('reads a query written into the URL', () => {
      TestBed.inject(HttpClient).get(`${searchUrl}?q=solar%20cells&limit=1`).subscribe();
      http.expectOne(`${searchUrl}?q=solar%20cells&limit=1`).flush(okResponse);

      expect(recorded()[0]).toEqual(
        jasmine.objectContaining({ endpoint: '/search/works/', query: 'solar cells' }),
      );
    });

    it('leaves requests to anything but the CORE API alone', () => {
      const client = TestBed.inject(HttpClient);
      client.get('/assets/data.json').subscribe();
      client.get('https://example.com/core-api/v3/search/works/').subscribe();
      http.expectOne('/assets/data.json').flush({});
      http.expectOne('https://example.com/core-api/v3/search/works/').flush({});

      expect(log.entries()).toEqual([]);
    });

    it("records a failure with the app's name for it and the response headers", () => {
      search('drone AND foo:bar');
      jasmine.clock().tick(85);
      http.expectOne(isSearch).flush(rejected, {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'X-Request-Id': 'req-500' },
      });

      expect(recorded()).toEqual([
        jasmine.objectContaining({
          outcome: 'error',
          status: 500,
          errorKind: 'bad-query',
          durationMs: 85,
          requestId: 'req-500',
          followUp: { type: 'give-up', reason: 'permanent' },
        }),
      ]);
    });

    it('records a network failure', () => {
      api.countByYear('drone').subscribe({ error: () => undefined });
      http.expectOne(aggregateUrl).error(new ProgressEvent('error'));

      expect(recorded()[0]).toEqual(
        jasmine.objectContaining({
          outcome: 'error',
          status: 0,
          errorKind: 'network',
          followUp: { type: 'retry', delayMs: 1_000, reason: 'backoff' },
        }),
      );
      jasmine.clock().tick(1_000);
      http.expectOne(aggregateUrl).flush({ aggregations: { yearPublished: {} } });
    });

    it('records a request cancelled by a new search', () => {
      const subscription = search();
      const req = http.expectOne(isSearch);
      jasmine.clock().tick(300);

      subscription.unsubscribe();

      expect(req.cancelled).toBeTrue();
      expect(recorded()).toEqual([
        jasmine.objectContaining({ outcome: 'cancelled', durationMs: 300, status: null }),
      ]);
    });

    it('records an attempt that timed out', () => {
      search();
      const req = http.expectOne(isSearch);

      jasmine.clock().tick(30_000);

      expect(req.cancelled).toBeTrue();
      expect(recorded()).toEqual([
        jasmine.objectContaining({
          outcome: 'error',
          errorKind: 'timeout',
          durationMs: 30_000,
          followUp: { type: 'give-up', reason: 'permanent' },
        }),
      ]);
    });
  });

  describe('retries', () => {
    it('records each retry as another attempt of the same request, with why it waited', () => {
      configure();
      search();
      http.expectOne(isSearch).flush(null, {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'X-RateLimit-Retry-After': '2026-11-20T10:00:03+0000' },
      });
      jasmine.clock().tick(3_000);
      http.expectOne(isSearch).flush(null, { status: 503, statusText: 'Service Unavailable' });
      jasmine.clock().tick(2_000);
      http.expectOne(isSearch).flush(okResponse);

      const [first, second, third] = recorded();
      expect([first.attempt, second.attempt, third.attempt]).toEqual([1, 2, 3]);
      expect(new Set([first.trace, second.trace, third.trace]).size).toBe(1);
      expect(first).toEqual(
        jasmine.objectContaining({
          status: 429,
          errorKind: 'rate-limit',
          followUp: { type: 'retry', delayMs: 3_000, reason: 'retry-after' },
        }),
      );
      expect(second).toEqual(
        jasmine.objectContaining({
          status: 503,
          errorKind: 'server',
          startedAt: Date.parse('2026-11-20T10:00:03Z'),
          followUp: { type: 'retry', delayMs: 2_000, reason: 'backoff' },
        }),
      );
      expect(third).toEqual(jasmine.objectContaining({ status: 200, followUp: null }));
    });

    it('links attempts even when the API key interceptor clones the request', () => {
      configure('secret');
      search();
      const first = http.expectOne(isSearch);
      expect(first.request.headers.get('Authorization')).toBe('Bearer secret');
      first.flush(null, { status: 502, statusText: 'Bad Gateway' });
      jasmine.clock().tick(1_000);
      http.expectOne(isSearch).flush(okResponse);

      const [a, b] = recorded();
      expect([a.attempt, b.attempt]).toEqual([1, 2]);
      expect(a.trace).toBe(b.trace);
    });

    it('gives separate requests separate traces', () => {
      configure();
      search('drone');
      search('robots');
      http.match(isSearch).forEach((req) => req.flush(okResponse));

      const [a, b] = recorded();
      expect(a.trace).not.toBe(b.trace);
      expect([a.attempt, b.attempt]).toEqual([1, 1]);
    });

    it('notes when the retries ran out', () => {
      configure();
      search();
      for (const delayMs of [1_000, 2_000, 4_000]) {
        http.expectOne(isSearch).flush(null, { status: 503, statusText: 'Service Unavailable' });
        jasmine.clock().tick(delayMs);
      }
      http.expectOne(isSearch).flush(null, { status: 503, statusText: 'Service Unavailable' });

      expect(recorded().map((entry) => entry.followUp)).toEqual([
        { type: 'retry', delayMs: 1_000, reason: 'backoff' },
        { type: 'retry', delayMs: 2_000, reason: 'backoff' },
        { type: 'retry', delayMs: 4_000, reason: 'backoff' },
        { type: 'give-up', reason: 'exhausted' },
      ]);
    });

    it('notes a retry cancelled while it waited', () => {
      configure();
      const subscription = search();
      http.expectOne(isSearch).flush(null, { status: 503, statusText: 'Service Unavailable' });

      subscription.unsubscribe();
      jasmine.clock().tick(5_000);

      http.expectNone(isSearch);
      expect(recorded().map((entry) => entry.followUp)).toEqual([{ type: 'cancelled' }]);
    });
  });
  describe('Break it switches', () => {
    let faults: FaultInjection;
    let result: SearchResult | undefined;
    let error: ApiError | undefined;

    const searchAndWatch = (query = 'drone') =>
      api.searchWorks({ query, limit: 10 }).subscribe({
        next: (value) => (result = value),
        error: (err: ApiError) => (error = err),
      });

    beforeEach(() => {
      configure();
      faults = TestBed.inject(FaultInjection);
      result = undefined;
      error = undefined;
    });

    it('fails every attempt as a network failure when offline, without sending it', () => {
      faults.set('offline', true);
      searchAndWatch();

      for (const delayMs of [1_000, 2_000, 4_000]) {
        http.expectNone(isSearch);
        jasmine.clock().tick(delayMs);
      }

      http.expectNone(isSearch);
      expect(error?.kind).toBe('network');
      expect(recorded().map((entry) => [entry.attempt, entry.status, entry.injected])).toEqual([
        [1, 0, 'offline'],
        [2, 0, 'offline'],
        [3, 0, 'offline'],
        [4, 0, 'offline'],
      ]);
    });

    it("answers the first two attempts with CORE's 429 and waits as it asks, then sends", () => {
      faults.set('rate-limit', true);
      searchAndWatch();

      http.expectNone(isSearch);
      jasmine.clock().tick(2_999);
      http.expectNone(isSearch);
      jasmine.clock().tick(1);
      http.expectNone(isSearch);
      jasmine.clock().tick(3_000);
      http.expectOne(isSearch).flush(okResponse);

      expect(result?.total).toBe(0);
      const [first, second, third] = recorded();
      for (const faked of [first, second]) {
        expect(faked).toEqual(
          jasmine.objectContaining({
            status: 429,
            errorKind: 'rate-limit',
            injected: 'rate-limit',
            // The wait comes from the X-RateLimit-Retry-After header on the faked 429.
            followUp: { type: 'retry', delayMs: 3_000, reason: 'retry-after' },
          }),
        );
      }
      expect(third).toEqual(
        jasmine.objectContaining({ attempt: 3, status: 200, injected: null, trace: first.trace }),
      );
    });

    it('holds each attempt for 5 s when slow, then sends it', () => {
      faults.set('slow', true);
      searchAndWatch();

      jasmine.clock().tick(4_999);
      http.expectNone(isSearch);
      jasmine.clock().tick(1);
      const req = http.expectOne(isSearch);
      jasmine.clock().tick(250);
      req.flush(okResponse);

      expect(result?.total).toBe(0);
      expect(recorded()).toEqual([
        jasmine.objectContaining({
          outcome: 'ok',
          injected: null,
          injectedDelayMs: 5_000,
          durationMs: 5_250,
        }),
      ]);
    });

    it("answers with CORE's 500 for a rejected query, which is not retried", () => {
      faults.set('rejected', true);
      searchAndWatch();
      jasmine.clock().tick(10_000);

      http.expectNone(isSearch);
      expect(error?.kind).toBe('bad-query');
      expect(recorded()).toEqual([
        jasmine.objectContaining({
          status: 500,
          errorKind: 'bad-query',
          injected: 'rejected',
          followUp: { type: 'give-up', reason: 'permanent' },
        }),
      ]);
    });

    it('answers every attempt with a 503 when CORE is unavailable, which is retried', () => {
      faults.set('unavailable', true);
      searchAndWatch();
      jasmine.clock().tick(1_000 + 2_000 + 4_000);

      http.expectNone(isSearch);
      expect(error?.kind).toBe('server');
      expect(error?.status).toBe(503);
      expect(recorded().map((entry) => entry.followUp?.type)).toEqual([
        'retry',
        'retry',
        'retry',
        'give-up',
      ]);
    });

    it('stops sabotaging as soon as the switch is turned off', () => {
      faults.set('offline', true);
      searchAndWatch();
      faults.turnOff();
      jasmine.clock().tick(1_000);

      http.expectOne(isSearch).flush(okResponse);

      expect(result?.total).toBe(0);
      expect(recorded().map((entry) => entry.injected)).toEqual(['offline', null]);
    });

    it('never touches requests outside the CORE API', () => {
      faults.set('offline', true);
      TestBed.inject(HttpClient).get('/assets/data.json').subscribe();

      http.expectOne('/assets/data.json').flush({});
      expect(log.entries()).toEqual([]);
    });
  });
});
