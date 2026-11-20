import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError, timeout } from 'rxjs';
import { CoreAggregateResponse, CoreSearchResponse } from '../models/core-api.models';
import { SearchRequest, SearchResult, YearCounts } from '../models/paper';
import { toSearchResult, toYearCounts } from '../models/paper.mapper';
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

  /**
   * How many works matching `query` were published in each year, counted by CORE across all
   * matches in one request. Errors are always emitted as `ApiError`.
   */
  countByYear(query: string): Observable<YearCounts> {
    return this.http
      .post<CoreAggregateResponse>(`${this.config.baseUrl}/search/works/aggregate`, {
        q: query,
        aggregations: ['yearPublished'],
      })
      .pipe(
        timeout(this.config.timeoutMs),
        retryTransient(this.config.retry),
        map(toYearCounts),
        catchError((error: unknown) => throwError(() => toApiError(error))),
      );
  }
}
