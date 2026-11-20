import { Injectable } from '@angular/core';
import { LruCache } from '../../core/cache/lru-cache';
import { SearchRequest, SearchResult } from '../../core/models/paper';

const MAX_ENTRIES = 30;
const TTL_MS = 5 * 60_000;

/**
 * Pages of results seen in the last five minutes, so Back, Forward and returning to a page show
 * them at once without asking CORE. Five minutes is also how long the CDN in front of CORE caches
 * a search. Errors are never stored.
 */
@Injectable({ providedIn: 'root' })
export class SearchResultsCache {
  private readonly cache = new LruCache<string, SearchResult>(MAX_ENTRIES, TTL_MS);

  get(request: SearchRequest): SearchResult | undefined {
    return this.cache.get(cacheKey(request));
  }

  set(request: SearchRequest, result: SearchResult): void {
    this.cache.set(cacheKey(request), result);
  }
}

function cacheKey({ query, limit, offset = 0 }: SearchRequest): string {
  return JSON.stringify([query, limit, offset]);
}
