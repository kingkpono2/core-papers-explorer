import { Injectable, inject } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
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
  private readonly cache = new Map<string, YearCounts>();

  /** `query` is the query as sent to CORE, so equivalent spellings share an entry. */
  countByYear(query: string): Observable<YearCounts> {
    const cached = this.cache.get(query);
    if (cached) {
      // Map keeps insertion order; moving the entry to the end makes eviction least recently used.
      this.cache.delete(query);
      this.cache.set(query, cached);
      return of(cached);
    }
    return this.api.countByYear(query).pipe(
      tap((counts) => {
        this.cache.set(query, counts);
        if (this.cache.size > MAX_ENTRIES) {
          this.cache.delete(this.cache.keys().next().value!);
        }
      }),
    );
  }
}
