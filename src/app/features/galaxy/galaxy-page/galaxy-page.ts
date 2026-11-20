import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, catchError, map, merge, of, startWith, switchMap, tap } from 'rxjs';
import { ApiError, toApiError } from '../../../core/api/api-error';
import { CORE_MAX_LIMIT } from '../../../core/api/core-api.config';
import { CoreApiService } from '../../../core/api/core-api.service';
import { Paper } from '../../../core/models/paper';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { ViewSwitch } from '../../../shared/ui/view-switch/view-switch';
import { coreQueryAdjustment, toCoreQuery } from '../../search/query/core-query';
import { analyseQuery, normaliseQuery } from '../../search/query/query-analyser';
import { SearchBar } from '../../search/search-bar/search-bar';
import { SearchResultsCache } from '../../search/search-results-cache';
import { GalaxyAnalyser } from '../galaxy-analyser';
import { GalaxyMap } from '../galaxy-map/galaxy-map';
import { mergeDuplicates } from '../merge-duplicates';

/** Papers in a galaxy: as many as CORE returns in one request. */
export const GALAXY_PAPERS = CORE_MAX_LIMIT;
/** Fewer papers than this are listed instead: there is too little to find topics in. */
export const MIN_GALAXY_PAPERS = 12;

type GalaxyState =
  | { status: 'idle' }
  | { status: 'invalid'; query: string }
  | { status: 'loading'; query: string }
  | { status: 'error'; query: string; error: ApiError }
  | { status: 'success'; query: string; total: number; papers: Paper[]; merged: number };

/**
 * The Research Galaxy for a query (`/galaxy?q=...`): its 100 most relevant papers, grouped into
 * topics and drawn as a night sky. The URL is the source of truth, so a galaxy can be shared. One
 * request to CORE, through the same results cache as the search page.
 */
@Component({
  selector: 'app-galaxy-page',
  imports: [EmptyState, ErrorState, GalaxyMap, SearchBar, ViewSwitch],
  templateUrl: './galaxy-page.html',
  styleUrl: './galaxy-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The worker lives as long as the page.
  providers: [GalaxyAnalyser],
})
export class GalaxyPage {
  private readonly api = inject(CoreApiService);
  private readonly cache = inject(SearchResultsCache);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly numbers = new Intl.NumberFormat(inject(LOCALE_ID));
  private readonly reloads = new Subject<void>();
  private readonly searchBar = viewChild.required(SearchBar);
  private readonly queryParamMap = toSignal(this.route.queryParamMap, { requireSync: true });

  protected readonly examples = ['drone AND delivery', 'coral AND reef', 'solar AND energy'];
  protected readonly minPapers = MIN_GALAXY_PAPERS;

  protected readonly query = computed(() => normaliseQuery(this.queryParamMap().get('q') ?? ''));

  protected readonly state = toSignal<GalaxyState, GalaxyState>(
    merge(
      toObservable(this.query).pipe(map((query) => ({ query, fresh: false }))),
      this.reloads.pipe(map(() => ({ query: this.query(), fresh: true }))),
    ).pipe(
      switchMap(({ query, fresh }) => {
        if (!query) {
          return of<GalaxyState>({ status: 'idle' });
        }
        return analyseQuery(query).hasErrors
          ? of<GalaxyState>({ status: 'invalid', query })
          : this.load(query, fresh);
      }),
    ),
    { initialValue: { status: 'idle' } },
  );

  protected readonly adjustment = computed(() => {
    const state = this.state();
    return state.status === 'idle' || state.status === 'invalid'
      ? null
      : coreQueryAdjustment(state.query);
  });

  /** Read out by the live region. */
  protected readonly summary = computed(() => {
    const state = this.state();
    switch (state.status) {
      case 'loading':
        return `Fetching the ${GALAXY_PAPERS} most relevant papers for “${state.query}”…`;
      case 'success': {
        const { total, papers, merged } = state;
        if (!total) {
          return `No papers found for “${state.query}”`;
        }
        const shown = `${this.numbers.format(papers.length)} ${papers.length === 1 ? 'paper' : 'papers'}`;
        const duplicates = merged
          ? ` (${merged} duplicate ${merged === 1 ? 'record' : 'records'} merged)`
          : '';
        return `The ${shown} most relevant to “${state.query}”${duplicates}, of ${this.numbers.format(total)} matches`;
      }
      default:
        return '';
    }
  });

  protected map(query: string): void {
    const trimmed = normaliseQuery(query);
    if (trimmed === this.query()) {
      this.reload();
    } else {
      void this.router.navigate([], { relativeTo: this.route, queryParams: { q: trimmed } });
    }
  }

  protected reload(): void {
    this.reloads.next();
  }

  protected openHelp(): void {
    this.searchBar().showHelp('search-help-nested-or');
  }

  private load(query: string, fresh: boolean): Observable<GalaxyState> {
    const request = { query: toCoreQuery(query), limit: GALAXY_PAPERS, offset: 0 };
    const success = ({ total, papers }: { total: number; papers: Paper[] }): GalaxyState => ({
      status: 'success',
      query,
      total,
      ...mergeDuplicates(papers),
    });
    const cached = fresh ? undefined : this.cache.get(request);
    if (cached) {
      return of(success(cached));
    }
    return this.api.searchWorks(request).pipe(
      tap((result) => this.cache.set(request, result)),
      map(success),
      catchError((error: unknown) =>
        of<GalaxyState>({ status: 'error', query, error: toApiError(error) }),
      ),
      startWith<GalaxyState>({ status: 'loading', query }),
    );
  }
}
