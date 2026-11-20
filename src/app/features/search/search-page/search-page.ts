import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  LOCALE_ID,
  afterRenderEffect,
  computed,
  effect,
  inject,
  linkedSignal,
  untracked,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, Subject, catchError, map, merge, of, startWith, switchMap } from 'rxjs';
import { ApiError, toApiError } from '../../../core/api/api-error';
import { CoreApiService } from '../../../core/api/core-api.service';
import { SearchResult } from '../../../core/models/paper';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { Pagination } from '../../../shared/ui/pagination/pagination';
import { PaperCard } from '../../../shared/ui/paper-card/paper-card';
import { SkeletonCard } from '../../../shared/ui/skeleton-card/skeleton-card';
import { ChartSearch, YearChart } from '../chart/year-chart/year-chart';
import { PageSizePreference } from '../page-size-preference';
import { MAX_RESULTS, lastPage, pageOffset, resultRange } from '../paging';
import { toCoreQuery } from '../query/core-query';
import { analyseQuery, positiveTerms } from '../query/query-analyser';
import { RecentSearches } from '../recent-searches';
import { SearchBar } from '../search-bar/search-bar';
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  SearchParams,
  parseSearchParams,
  sameSearch,
  toPageSize,
  toQueryParams,
} from '../search-params';

type SearchState =
  | { status: 'idle' }
  | { status: 'invalid'; params: SearchParams }
  | { status: 'loading'; params: SearchParams }
  | { status: 'success'; params: SearchParams; result: SearchResult }
  | { status: 'error'; params: SearchParams; error: ApiError };

const SKELETON_COUNT = 3;

@Component({
  selector: 'app-search-page',
  imports: [
    DecimalPipe,
    EmptyState,
    ErrorState,
    Pagination,
    PaperCard,
    RouterLink,
    SearchBar,
    SkeletonCard,
    YearChart,
  ],
  templateUrl: './search-page.html',
  styleUrl: './search-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchPage {
  private readonly api = inject(CoreApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly pageSizePreference = inject(PageSizePreference);
  private readonly recentSearches = inject(RecentSearches);
  private readonly numbers = new Intl.NumberFormat(inject(LOCALE_ID));
  private readonly reloads = new Subject<void>();
  private readonly queryParamMap = toSignal(this.route.queryParamMap, { requireSync: true });
  private readonly resultsHeading = viewChild.required<ElementRef<HTMLElement>>('resultsHeading');

  protected readonly examples = [
    '(drone AND (package OR delivery))',
    'renewable energy AND storage',
    'coral reef bleaching',
  ];
  protected readonly pageSizes = PAGE_SIZES;
  protected readonly maxResults = MAX_RESULTS;
  protected readonly skeletons = Array.from({ length: SKELETON_COUNT }, (_, i) => i);

  /**
   * The URL is the source of truth. The equality check means a URL that only changes in form, such
   * as gaining `size=10`, does not start another search.
   */
  protected readonly params = computed(
    () => parseSearchParams(this.queryParamMap(), this.pageSizePreference.size()),
    { equal: sameSearch },
  );

  // switchMap unsubscribes from the previous search, which aborts its HTTP request. A query with
  // errors (from a hand-edited or old link) is never sent; the search bar explains what is wrong.
  protected readonly state = toSignal<SearchState, SearchState>(
    merge(toObservable(this.params), this.reloads.pipe(map(() => this.params()))).pipe(
      switchMap((params) => {
        if (!params.query) {
          return of<SearchState>({ status: 'idle' });
        }
        return analyseQuery(params.query).hasErrors
          ? of<SearchState>({ status: 'invalid', params })
          : this.load(params);
      }),
    ),
    { initialValue: { status: 'idle' } },
  );

  /**
   * What the chart describes. It follows the query, not the page, so paging keeps the chart as it
   * is, and it is only settled once the results are in, so the chart asks CORE after them.
   */
  protected readonly chartSearch = linkedSignal<SearchState, ChartSearch | null>({
    source: this.state,
    computation: (state, previous) => {
      if (state.status === 'idle' || state.status === 'invalid') {
        return null;
      }
      const query = toCoreQuery(state.params.query);
      const kept = previous?.value?.query === query ? previous.value : null;
      switch (state.status) {
        case 'loading':
          return kept ?? { query, total: null, settled: false };
        case 'error':
          return kept ?? { query, total: null, settled: true };
        case 'success':
          return { query, total: state.result.total, settled: true };
      }
    },
    equal: (a, b) =>
      a === b ||
      (!!a && !!b && a.query === b.query && a.total === b.total && a.settled === b.settled),
  });

  /** Words from the query that was searched, to mark in titles and abstracts. */
  protected readonly highlightTerms = computed(() => {
    const state = this.state();
    return state.status === 'success' ? positiveTerms(analyseQuery(state.params.query).ast) : [];
  });

  protected readonly paging = computed(() => {
    const state = this.state();
    if (state.status !== 'success') {
      return null;
    }
    const { total } = state.result;
    return { last: lastPage(total, state.params.size), capped: total > MAX_RESULTS };
  });

  /** Read out by the live region. Errors are announced by the error state's own alert. */
  protected readonly summary = computed(() => {
    const state = this.state();
    switch (state.status) {
      case 'loading':
        return `Searching CORE for “${state.params.query}”…`;
      case 'success': {
        const { query, page, size } = state.params;
        const { total } = state.result;
        const range = resultRange(page, size, total);
        if (!total) {
          return `No papers found for “${query}”`;
        }
        if (!range) {
          return `Page ${this.numbers.format(page)} is past the end of the results for “${query}”`;
        }
        const shown =
          range.first === range.last
            ? this.numbers.format(range.first)
            : `${this.numbers.format(range.first)}–${this.numbers.format(range.last)}`;
        return `Showing ${shown} of ${this.numbers.format(total)} ${total === 1 ? 'paper' : 'papers'} for “${query}”`;
      }
      default:
        return '';
    }
  });

  constructor() {
    // Rewrite missing or invalid params in place (size=999 becomes size=100), so the address bar
    // always matches what is shown. The router ignores navigation to the URL it is already on.
    effect(() => {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: toQueryParams(this.params()),
        replaceUrl: true,
      });
    });

    effect(() => {
      const state = this.state();
      if (state.status === 'success') {
        untracked(() => this.recentSearches.add(state.params.query));
      }
    });

    // Once a search settles, move focus to the results so keyboard and screen reader users land
    // there. Focusing also scrolls the heading into view after a page change.
    afterRenderEffect(() => {
      const { status } = this.state();
      if (status === 'success' || status === 'error') {
        this.resultsHeading().nativeElement.focus();
      }
    });
  }

  protected searchFor(query: string): void {
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }
    const params = { ...this.params(), query: trimmed, page: 1 };
    // Searching again for what is on screen leaves the URL as it is, so nothing else would run it.
    if (sameSearch(params, this.params())) {
      this.reload();
    } else {
      this.navigate(params);
    }
  }

  protected changePageSize(value: string): void {
    const size = toPageSize(value) ?? DEFAULT_PAGE_SIZE;
    this.pageSizePreference.set(size);
    this.navigate({ ...this.params(), size, page: 1 });
  }

  protected reload(): void {
    this.reloads.next();
  }

  /** Searches only ever start from the URL (or a reload), so each user action makes one request. */
  private navigate(params: SearchParams): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: toQueryParams(params) });
  }

  private load(params: SearchParams): Observable<SearchState> {
    const { query, page, size } = params;
    const request = { query: toCoreQuery(query), limit: size, offset: pageOffset(page, size) };
    return this.api.searchWorks(request).pipe(
      map((result): SearchState => ({ status: 'success', params, result })),
      catchError((error: unknown) =>
        of<SearchState>({ status: 'error', params, error: toApiError(error) }),
      ),
      startWith<SearchState>({ status: 'loading', params }),
    );
  }
}
