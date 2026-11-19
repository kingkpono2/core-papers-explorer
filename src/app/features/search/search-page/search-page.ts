import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { ApiError, toApiError } from '../../../core/api/api-error';
import { CoreApiService } from '../../../core/api/core-api.service';
import { SearchResult } from '../../../core/models/paper';

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; result: SearchResult }
  | { status: 'error'; error: ApiError };

const PAGE_SIZE = 10;

@Component({
  selector: 'app-search-page',
  imports: [DecimalPipe],
  templateUrl: './search-page.html',
  styleUrl: './search-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchPage {
  private readonly api = inject(CoreApiService);
  private readonly searches = new Subject<string>();

  protected readonly exampleQuery = '(drone AND (package OR delivery))';
  protected readonly query = signal('drone');

  // switchMap unsubscribes from the previous search, which aborts its HTTP request.
  protected readonly state = toSignal<SearchState, SearchState>(
    this.searches.pipe(
      switchMap((query) =>
        this.api.searchWorks({ query, limit: PAGE_SIZE }).pipe(
          map((result): SearchState => ({ status: 'success', result })),
          catchError((error: unknown) =>
            of<SearchState>({ status: 'error', error: toApiError(error) }),
          ),
          startWith<SearchState>({ status: 'loading' }),
        ),
      ),
    ),
    { initialValue: { status: 'idle' } },
  );

  protected search(event: Event): void {
    event.preventDefault();
    const query = this.query().trim();
    if (query) {
      this.searches.next(query);
    }
  }
}
