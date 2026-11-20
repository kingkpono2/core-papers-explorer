import { Injectable, inject } from '@angular/core';
import {
  Observable,
  catchError,
  concat,
  filter,
  from,
  map,
  merge,
  mergeMap,
  of,
  scan,
  startWith,
} from 'rxjs';
import { ApiError, toApiError } from '../../core/api/api-error';
import { YearCounts } from '../../core/models/paper';
import { PublicationYears } from '../search/chart/publication-years';

/** Two requests at a time: quick enough, and gentle on CORE's rate limit. */
export const COMPARE_CONCURRENCY = 2;

export type TrendState =
  | { status: 'loading' }
  | { status: 'success'; counts: YearCounts }
  | { status: 'error'; error: ApiError };

interface Update {
  index: number;
  state: TrendState;
}

/**
 * Loads the year counts for several queries, one aggregation request per query and two at a time,
 * through the chart's per-query cache, so a query already charted on the search page costs nothing.
 * A failure only affects its own series. Unsubscribing cancels whatever is still in flight.
 */
@Injectable({ providedIn: 'root' })
export class CompareTrends {
  private readonly years = inject(PublicationYears);

  /**
   * `queries` are as sent to CORE. Emits the state of every series after each change. A number on
   * `retries` loads that series again.
   */
  load(queries: readonly string[], retries: Observable<number>): Observable<TrendState[]> {
    const initial = queries.map((): TrendState => ({ status: 'loading' }));
    const first = from(queries.keys()).pipe(
      mergeMap((index) => this.fetch(index, queries[index]), COMPARE_CONCURRENCY),
    );
    const again = retries.pipe(
      filter((index) => index >= 0 && index < queries.length),
      mergeMap((index) =>
        concat(
          of<Update>({ index, state: { status: 'loading' } }),
          this.fetch(index, queries[index]),
        ),
      ),
    );
    return merge(first, again).pipe(
      scan(
        (states, { index, state }) => states.map((current, i) => (i === index ? state : current)),
        initial,
      ),
      startWith(initial),
    );
  }

  private fetch(index: number, query: string): Observable<Update> {
    return this.years.countByYear(query).pipe(
      map((counts): Update => ({ index, state: { status: 'success', counts } })),
      catchError((error: unknown) =>
        of<Update>({ index, state: { status: 'error', error: toApiError(error) } }),
      ),
    );
  }
}
