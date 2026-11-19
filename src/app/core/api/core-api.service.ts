import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError, timeout } from 'rxjs';
import { CoreSearchResponse } from '../models/core-api.models';
import { SearchRequest, SearchResult } from '../models/paper';
import { toSearchResult } from '../models/paper.mapper';
import { toApiError } from './api-error';
import { CORE_API_CONFIG } from './core-api.config';
import { retryTransient } from './retry-transient';

@Injectable({ providedIn: 'root' })
export class CoreApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(CORE_API_CONFIG);

  /** Errors are always emitted as `ApiError`. */
  searchWorks({ query, limit, offset = 0 }: SearchRequest): Observable<SearchResult> {
    const params = new HttpParams()
      .set('q', query)
      .set('limit', limit)
      .set('offset', offset)
      // Full text can be megabytes per paper and is never shown.
      .set('exclude', 'fullText');

    // The trailing slash matters: without it CORE answers with a 301 that costs a rate-limit token.
    return this.http
      .get<CoreSearchResponse>(`${this.config.baseUrl}/search/works/`, { params })
      .pipe(
        timeout(this.config.timeoutMs),
        retryTransient(this.config.retry),
        map(toSearchResult),
        catchError((error: unknown) => throwError(() => toApiError(error))),
      );
  }
}
