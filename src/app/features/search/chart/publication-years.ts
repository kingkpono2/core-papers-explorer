import { Injectable, inject } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { LruCache } from '../../../core/cache/lru-cache';
import { CoreApiService } from '../../../core/api/core-api.service';
import { YearCounts } from '../../../core/models/paper';

const MAX_ENTRIES = 20;

/**
 * Year counts per query, kept for the session so that paging, changing the page size or going back
 * to an earlier search never asks CORE again. Failures are not kept.
 */
@Injectable({ providedIn: 'root' })
export class PublicationYears {
  private readonly api = inject(CoreApiService);
  private readonly cache = new LruCache<string, YearCounts>(MAX_ENTRIES);

  /** `query` is the query as sent to CORE, so equivalent spellings share an entry. */
  countByYear(query: string): Observable<YearCounts> {
    const cached = this.cache.get(query);
    return cached
      ? of(cached)
      : this.api.countByYear(query).pipe(tap((counts) => this.cache.set(query, counts)));
  }
}
