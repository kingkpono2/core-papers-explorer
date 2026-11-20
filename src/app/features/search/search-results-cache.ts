import { Injectable, inject } from '@angular/core';
import { SEARCH_PATH } from '../../core/api/core-api.config';
import { LruCache } from '../../core/cache/lru-cache';
import { RequestLog } from '../../core/diagnostics/request-log';
import { SearchRequest, SearchResult } from '../../core/models/paper';

const MAX_ENTRIES = 30;
const TTL_MS = 5 * 60_000;

/**
 * Pages of results seen in the last five minutes, so Back, Forward and returning to a page show
 * them at once without asking CORE. Five minutes is also how long the CDN in front of CORE caches
 * a search. Errors are never stored. Each page served from here is logged for Under the hood as a
 * request that was never made.
 */
@Injectable({ providedIn: 'root' })
export class SearchResultsCache {
  private readonly log = inject(RequestLog);
  private readonly cache = new LruCache<string, SearchResult>(MAX_ENTRIES, TTL_MS);

  get(request: SearchRequest): SearchResult | undefined {
    const result = this.cache.get(cacheKey(request));
    if (result) {
      this.log.servedFromMemory({ method: 'GET', endpoint: SEARCH_PATH, query: request.query });
    }
    return result;
  }

  set(request: SearchRequest, result: SearchResult): void {
    this.cache.set(cacheKey(request), result);
  }
}

function cacheKey({ query, limit, offset = 0 }: SearchRequest): string {
  return JSON.stringify([query, limit, offset]);
}
