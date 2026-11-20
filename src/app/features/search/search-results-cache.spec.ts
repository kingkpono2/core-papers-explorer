import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { makePaper } from '../../../testing/paper.fixture';
import { RequestLog } from '../../core/diagnostics/request-log';
import { SearchResult } from '../../core/models/paper';
import { SearchResultsCache } from './search-results-cache';

describe('SearchResultsCache', () => {
  const result: SearchResult = { total: 1, papers: [makePaper()], limit: 10, offset: 0 };
  let cache: SearchResultsCache;

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-11-20T10:00:00Z'));
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    cache = TestBed.inject(SearchResultsCache);
  });

  afterEach(() => jasmine.clock().uninstall());

  it('keeps a page per query, page size and offset', () => {
    cache.set({ query: 'drone', limit: 10, offset: 0 }, result);

    expect(cache.get({ query: 'drone', limit: 10 })).toBe(result);
    expect(cache.get({ query: 'drone', limit: 10, offset: 10 })).toBeUndefined();
    expect(cache.get({ query: 'drone', limit: 25, offset: 0 })).toBeUndefined();
    expect(cache.get({ query: 'drones', limit: 10, offset: 0 })).toBeUndefined();
  });

  it('logs each page it serves as a request that was never made', () => {
    const log = TestBed.inject(RequestLog);
    cache.set({ query: 'drone', limit: 10, offset: 0 }, result);

    cache.get({ query: 'robots', limit: 10 });
    expect(log.entries()).toEqual([]);

    cache.get({ query: 'drone', limit: 10 });
    expect(log.entries()).toEqual([
      jasmine.objectContaining({
        source: 'memory',
        method: 'GET',
        endpoint: '/search/works/',
        query: 'drone',
      }),
    ]);
  });

  it('forgets results after five minutes', () => {
    cache.set({ query: 'drone', limit: 10 }, result);

    jasmine.clock().tick(5 * 60_000 - 1);
    expect(cache.get({ query: 'drone', limit: 10 })).toBe(result);

    jasmine.clock().tick(1);
    expect(cache.get({ query: 'drone', limit: 10 })).toBeUndefined();
  });
});
