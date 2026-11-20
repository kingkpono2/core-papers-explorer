import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, defer, map, throwError, timeout } from 'rxjs';
import { CoreAggregateResponse, CoreSearchResponse } from '../models/core-api.models';
import { SearchRequest, SearchResult, YearCounts } from '../models/paper';
import { toSearchResult, toYearCounts } from '../models/paper.mapper';
import { toApiError } from './api-error';
import { AGGREGATE_PATH, CORE_API_CONFIG, SEARCH_PATH } from './core-api.config';
import { REQUEST_TRACE, RequestTrace } from './request-trace';
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

    return this.send((context) =>
      this.http.get<CoreSearchResponse>(`${this.config.baseUrl}${SEARCH_PATH}`, {
        params,
        context,
      }),
    ).pipe(
      map(toSearchResult),
      catchError((error: unknown) => throwError(() => toApiError(error))),
    );
  }

  /**
   * How many works matching `query` were published in each year, counted by CORE across all
   * matches in one request. Errors are always emitted as `ApiError`.
   */
  countByYear(query: string): Observable<YearCounts> {
    return this.send((context) =>
      this.http.post<CoreAggregateResponse>(
        `${this.config.baseUrl}${AGGREGATE_PATH}`,
        { q: query, aggregations: ['yearPublished'] },
        { context },
      ),
    ).pipe(
      map(toYearCounts),
      catchError((error: unknown) => throwError(() => toApiError(error))),
    );
  }

  /**
   * Sends one logical request with the timeout and retry policy. Its attempts share a trace, in a
   * context of their own for each subscription, so Under the hood can link retries to the request.
   */
  private send<T>(request: (context: HttpContext) => Observable<T>): Observable<T> {
    return defer(() => {
      const trace = new RequestTrace();
      return request(new HttpContext().set(REQUEST_TRACE, trace)).pipe(
        timeout(this.config.timeoutMs),
        retryTransient(this.config.retry, trace),
      );
    });
  }
}
