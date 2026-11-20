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
import { PageSizePreference } from '../page-size-preference';
import { MAX_RESULTS, lastPage, pageOffset, resultRange } from '../paging';
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
  | { status: 'loading'; params: SearchParams }
  | { status: 'success'; params: SearchParams; result: SearchResult }
  | { status: 'error'; params: SearchParams; error: ApiError };

const DEFAULT_QUERY = 'drone';
const SKELETON_COUNT = 3;

@Component({
  selector: 'app-search-page',
  imports: [DecimalPipe, EmptyState, ErrorState, Pagination, PaperCard, RouterLink, SkeletonCard],
  templateUrl: './search-page.html',
  styleUrl: './search-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchPage {
  private readonly api = inject(CoreApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly pageSizePreference = inject(PageSizePreference);
  private readonly numbers = new Intl.NumberFormat(inject(LOCALE_ID));
  private readonly reloads = new Subject<void>();
  private readonly queryParamMap = toSignal(this.route.queryParamMap, { requireSync: true });
  private readonly resultsHeading = viewChild.required<ElementRef<HTMLElement>>('resultsHeading');

  protected readonly exampleQuery = '(drone AND (package OR delivery))';
  protected readonly examples = [
    this.exampleQuery,
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

  /** The text in the search box; follows the URL on Back/Forward but can be edited freely. */
  protected readonly query = linkedSignal(() => this.params().query || DEFAULT_QUERY);

  // switchMap unsubscribes from the previous search, which aborts its HTTP request.
  protected readonly state = toSignal<SearchState, SearchState>(
    merge(toObservable(this.params), this.reloads.pipe(map(() => this.params()))).pipe(
      switchMap((params) =>
        params.query ? this.load(params) : of<SearchState>({ status: 'idle' }),
      ),
    ),
    { initialValue: { status: 'idle' } },
  );

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

    // Once a search settles, move focus to the results so keyboard and screen reader users land
    // there. Focusing also scrolls the heading into view after a page change.
    afterRenderEffect(() => {
      const { status } = this.state();
      if (status === 'success' || status === 'error') {
        this.resultsHeading().nativeElement.focus();
      }
    });
  }

  protected search(event: Event): void {
    event.preventDefault();
    this.searchFor(this.query());
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
    return this.api.searchWorks({ query, limit: size, offset: pageOffset(page, size) }).pipe(
      map((result): SearchState => ({ status: 'success', params, result })),
      catchError((error: unknown) =>
        of<SearchState>({ status: 'error', params, error: toApiError(error) }),
      ),
      startWith<SearchState>({ status: 'loading', params }),
    );
  }
}
