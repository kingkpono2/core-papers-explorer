import { HttpRequest, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CoreSearchResponse } from '../models/core-api.models';
import { SearchResult, YearCounts } from '../models/paper';
import { ApiError } from './api-error';
import { CORE_API_CONFIG, CoreApiConfig } from './core-api.config';
import { CoreApiService } from './core-api.service';
import { REQUEST_TRACE } from './request-trace';

const config: CoreApiConfig = {
  baseUrl: 'https://api.test/v3',
  apiKey: '',
  timeoutMs: 30_000,
  retry: { maxRetries: 3, baseDelayMs: 1_000, maxTotalDelayMs: 10_000 },
};

const searchUrl = 'https://api.test/v3/search/works/';
const isSearch = (req: HttpRequest<unknown>) => req.url === searchUrl;

const okResponse: CoreSearchResponse = {
  totalHits: 2,
  limit: 10,
  offset: 0,
  results: [
    { id: 1, title: 'First', authors: [{ name: 'Ada Lovelace' }] },
    { id: 2, title: 'Second' },
  ],
};

describe('CoreApiService', () => {
  let service: CoreApiService;
  let http: HttpTestingController;
  let result: SearchResult | undefined;
  let error: ApiError | undefined;

  const search = (query = 'drone') =>
    service.searchWorks({ query, limit: 10 }).subscribe({
      next: (value) => (result = value),
      error: (err: ApiError) => (error = err),
    });

  const fail = (status: number, headers: Record<string, string> = {}) =>
    http.expectOne(isSearch).flush({ message: 'error' }, { status, statusText: 'Error', headers });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CORE_API_CONFIG, useValue: config },
      ],
    });
    service = TestBed.inject(CoreApiService);
    http = TestBed.inject(HttpTestingController);
    result = undefined;
    error = undefined;
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    http.verify();
  });

  it('calls the trailing-slash search URL with query, paging and field exclusion', () => {
    service.searchWorks({ query: '(drone AND delivery)', limit: 25, offset: 50 }).subscribe();

    const req = http.expectOne(isSearch);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('q')).toBe('(drone AND delivery)');
    expect(req.request.params.get('limit')).toBe('25');
    expect(req.request.params.get('offset')).toBe('50');
    expect(req.request.params.get('exclude')).toBe('fullText');
    req.flush(okResponse);
  });

  it('maps the response to a SearchResult', () => {
    search();
    http.expectOne(isSearch).flush(okResponse);

    expect(result?.total).toBe(2);
    expect(result?.papers.map((paper) => paper.title)).toEqual(['First', 'Second']);
    expect(result?.papers[0].authors).toEqual(['Ada Lovelace']);
  });

  it('waits for X-RateLimit-Retry-After before retrying a 429', () => {
    search();
    fail(429, { 'X-RateLimit-Retry-After': '2026-01-01T00:00:03+0000' });

    jasmine.clock().tick(2_999);
    http.expectNone(isSearch);

    jasmine.clock().tick(1);
    http.expectOne(isSearch).flush(okResponse);
    expect(result?.total).toBe(2);
  });

  it('gives up straight away when Retry-After is beyond the wait budget', () => {
    search();
    fail(429, { 'X-RateLimit-Retry-After': '2026-01-01T00:01:00+0000' });

    jasmine.clock().tick(60_000);
    http.expectNone(isSearch);
    expect(error?.kind).toBe('rate-limit');
    expect(error?.status).toBe(429);
  });

  it('retries server errors with exponential backoff', () => {
    search();
    fail(503);
    jasmine.clock().tick(1_000);
    fail(502);
    jasmine.clock().tick(1_999);
    http.expectNone(isSearch);
    jasmine.clock().tick(1);
    http.expectOne(isSearch).flush(okResponse);

    expect(result?.total).toBe(2);
  });

  it('reports a network error once retries are exhausted', () => {
    search();
    for (const delayMs of [1_000, 2_000, 4_000]) {
      http.expectOne(isSearch).error(new ProgressEvent('error'));
      jasmine.clock().tick(delayMs);
    }
    http.expectOne(isSearch).error(new ProgressEvent('error'));

    expect(error).toEqual(jasmine.any(ApiError));
    expect(error?.kind).toBe('network');
    expect(error?.message).toContain('Could not reach CORE');
  });

  it('does not retry other client errors', () => {
    search();
    fail(400);

    jasmine.clock().tick(10_000);
    http.expectNone(isSearch);
    expect(error?.kind).toBe('bad-query');
  });

  it("does not retry CORE's 500 for a query its search engine rejects", () => {
    search('drone AND foo:bar');
    http
      .expectOne(isSearch)
      .flush(
        { message: 'Azure search failed with status code: 400. foo is not a searchable field.' },
        { status: 500, statusText: 'Internal Server Error' },
      );

    jasmine.clock().tick(10_000);
    http.expectNone(isSearch);
    expect(error?.kind).toBe('bad-query');
  });

  it('gives the attempts of a request one trace, and every request its own', () => {
    search();
    const first = http.expectOne(isSearch);
    const trace = first.request.context.get(REQUEST_TRACE);
    first.flush(null, { status: 503, statusText: 'Service Unavailable' });
    jasmine.clock().tick(1_000);
    const retried = http.expectOne(isSearch);

    expect(retried.request.context.get(REQUEST_TRACE)).toBe(trace);
    retried.flush(okResponse);

    search('robots');
    expect(http.expectOne(isSearch).request.context.get(REQUEST_TRACE)).not.toBe(trace);
  });

  it('times out and cancels a slow request', () => {
    search();
    const req = http.expectOne(isSearch);

    jasmine.clock().tick(29_999);
    expect(req.cancelled).toBeFalse();

    jasmine.clock().tick(1);
    expect(req.cancelled).toBeTrue();
    expect(error?.kind).toBe('timeout');
    http.expectNone(isSearch);
  });

  describe('countByYear', () => {
    const aggregateUrl = 'https://api.test/v3/search/works/aggregate';

    it('posts the query and the yearPublished aggregation, and maps the counts', () => {
      let counts: YearCounts | undefined;
      service.countByYear('drone AND (package OR delivery)').subscribe((value) => (counts = value));

      const req = http.expectOne(aggregateUrl);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        q: 'drone AND (package OR delivery)',
        aggregations: ['yearPublished'],
      });
      req.flush({ aggregations: { yearPublished: { '2020': 354, '2019': 252 } } });

      expect(counts).toEqual({
        counts: [
          { year: 2019, count: 252 },
          { year: 2020, count: 354 },
        ],
        truncated: false,
      });
    });

    it('retries a rate-limited request and reports a lasting failure as an ApiError', () => {
      service.countByYear('drone').subscribe({ error: (err: ApiError) => (error = err) });

      http.expectOne(aggregateUrl).flush(null, { status: 429, statusText: 'Too Many Requests' });
      jasmine.clock().tick(1_000);
      http.expectOne(aggregateUrl).flush(null, { status: 400, statusText: 'Bad Request' });

      expect(error?.kind).toBe('bad-query');
    });
  });
});
