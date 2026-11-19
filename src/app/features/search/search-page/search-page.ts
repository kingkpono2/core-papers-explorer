import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  LOCALE_ID,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { ApiError, toApiError } from '../../../core/api/api-error';
import { CoreApiService } from '../../../core/api/core-api.service';
import { SearchResult } from '../../../core/models/paper';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { PaperCard } from '../../../shared/ui/paper-card/paper-card';
import { SkeletonCard } from '../../../shared/ui/skeleton-card/skeleton-card';

type SearchState =
  | { status: 'idle' }
  | { status: 'loading'; query: string }
  | { status: 'success'; query: string; result: SearchResult }
  | { status: 'error'; query: string; error: ApiError };

const PAGE_SIZE = 10;
const SKELETON_COUNT = 3;

@Component({
  selector: 'app-search-page',
  imports: [EmptyState, ErrorState, PaperCard, SkeletonCard],
  templateUrl: './search-page.html',
  styleUrl: './search-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchPage {
  private readonly api = inject(CoreApiService);
  private readonly numbers = new Intl.NumberFormat(inject(LOCALE_ID));
  private readonly searches = new Subject<string>();
  private readonly resultsHeading = viewChild.required<ElementRef<HTMLElement>>('resultsHeading');

  protected readonly exampleQuery = '(drone AND (package OR delivery))';
  protected readonly examples = [
    this.exampleQuery,
    'renewable energy AND storage',
    'coral reef bleaching',
  ];
  protected readonly skeletons = Array.from({ length: SKELETON_COUNT }, (_, i) => i);
  protected readonly query = signal('drone');

  // switchMap unsubscribes from the previous search, which aborts its HTTP request.
  protected readonly state = toSignal<SearchState, SearchState>(
    this.searches.pipe(
      switchMap((query) =>
        this.api.searchWorks({ query, limit: PAGE_SIZE }).pipe(
          map((result): SearchState => ({ status: 'success', query, result })),
          catchError((error: unknown) =>
            of<SearchState>({ status: 'error', query, error: toApiError(error) }),
          ),
          startWith<SearchState>({ status: 'loading', query }),
        ),
      ),
    ),
    { initialValue: { status: 'idle' } },
  );

  /** Read out by the live region. Errors are announced by the error state's own alert. */
  protected readonly summary = computed(() => {
    const state = this.state();
    switch (state.status) {
      case 'loading':
        return `Searching CORE for “${state.query}”…`;
      case 'success': {
        const { total } = state.result;
        return total
          ? `${this.numbers.format(total)} ${total === 1 ? 'paper' : 'papers'} found for “${state.query}”`
          : `No papers found for “${state.query}”`;
      }
      default:
        return '';
    }
  });

  constructor() {
    // Once a search settles, move focus to the results so keyboard and screen reader users land there.
    afterRenderEffect(() => {
      const { status } = this.state();
      if (status === 'success' || status === 'error') {
        this.resultsHeading().nativeElement.focus();
      }
    });
  }

  protected search(event: Event): void {
    event.preventDefault();
    this.run(this.query());
  }

  protected searchFor(query: string): void {
    this.query.set(query);
    this.run(query);
  }

  protected run(query: string): void {
    const trimmed = query.trim();
    if (trimmed) {
      this.searches.next(trimmed);
    }
  }
}
