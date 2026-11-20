import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { makePaper } from '../../../testing/paper.fixture';
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

  it('forgets results after five minutes', () => {
    cache.set({ query: 'drone', limit: 10 }, result);

    jasmine.clock().tick(5 * 60_000 - 1);
    expect(cache.get({ query: 'drone', limit: 10 })).toBe(result);

    jasmine.clock().tick(1);
    expect(cache.get({ query: 'drone', limit: 10 })).toBeUndefined();
  });
});
