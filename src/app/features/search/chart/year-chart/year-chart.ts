import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, merge, of, startWith, switchMap } from 'rxjs';
import { ApiError, toApiError } from '../../../../core/api/api-error';
import { YearCounts } from '../../../../core/models/paper';
import { BarChart, BarDatum } from '../../../../shared/ui/bar-chart/bar-chart';
import { narrowQuery } from '../../query/core-query';
import { PublicationYears } from '../publication-years';
import { YearBucket, buildYearSeries } from '../year-series';

/** The search the chart describes. */
export interface ChartSearch {
  /** The query as sent to CORE. */
  query: string;
  /** Matching papers, once the results have arrived. */
  total: number | null;
  /** False while the results are loading, so the chart asks CORE only after them. */
  settled: boolean;
}

type CountsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; counts: YearCounts }
  | { status: 'error'; error: ApiError };

const SKELETON_HEIGHTS = [18, 22, 30, 26, 38, 44, 52, 60, 66, 74, 80, 70];

@Component({
  selector: 'app-year-chart',
  imports: [BarChart],
  templateUrl: './year-chart.html',
  styleUrl: './year-chart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YearChart {
  private readonly years = inject(PublicationYears);
  private readonly numbers = new Intl.NumberFormat(inject(LOCALE_ID));
  private readonly reloads = new Subject<void>();

  readonly search = input.required<ChartSearch | null>();
  readonly currentYear = input(new Date().getFullYear());
  /** A narrower query for the chosen year, for the page to search. */
  readonly narrowed = output<string>();

  protected readonly skeleton = SKELETON_HEIGHTS;
  protected readonly showTable = signal(false);

  /** A string, so paging or a new total for the same query does not ask CORE again. */
  private readonly request = computed(() => {
    const search = this.search();
    return search?.settled && search.total !== 0 ? search.query : null;
  });

  private readonly counts = toSignal<CountsState, CountsState>(
    merge(toObservable(this.request), this.reloads.pipe(map(() => this.request()))).pipe(
      switchMap((query) =>
        query
          ? this.years.countByYear(query).pipe(
              map((counts): CountsState => ({ status: 'success', counts })),
              catchError((error: unknown) =>
                of<CountsState>({ status: 'error', error: toApiError(error) }),
              ),
              startWith<CountsState>({ status: 'loading' }),
            )
          : of<CountsState>({ status: 'idle' }),
      ),
    ),
    { initialValue: { status: 'idle' } },
  );

  protected readonly view = computed(() => {
    const search = this.search();
    const counts = this.counts();
    if (!search) {
      return { status: 'blank' as const };
    }
    if (search.total === 0) {
      return { status: 'empty' as const };
    }
    switch (counts.status) {
      case 'idle':
      case 'loading':
        return { status: 'loading' as const, total: this.formatTotal(search) };
      case 'error':
        return { status: 'error' as const, error: counts.error };
      case 'success':
        return this.describe(search, counts.counts);
    }
  });

  protected readonly selectable = computed(() => {
    const query = this.search()?.query;
    return !!query && narrowQuery(query, 'yearPublished:2000') !== null;
  });

  protected reload(): void {
    this.reloads.next();
  }

  protected selectYear(bar: BarDatum): void {
    this.narrow(`yearPublished:${bar.key}`);
  }

  protected narrow(clause: string): void {
    const query = this.search()?.query;
    const narrowed = query ? narrowQuery(query, clause) : null;
    if (narrowed) {
      this.narrowed.emit(narrowed);
    }
  }

  private formatTotal({ total }: ChartSearch): string | null {
    return total === null ? null : this.numbers.format(total);
  }

  private describe(search: ChartSearch, { counts, truncated }: YearCounts) {
    const { buckets, dated } = buildYearSeries(counts, this.currentYear());
    if (!dated) {
      return { status: 'empty' as const };
    }
    const years = buckets.filter((bucket) => bucket.kind === 'year');
    const earlier = buckets.find((bucket) => bucket.kind === 'earlier') ?? null;
    const partial = years.find((bucket) => bucket.partial) ?? null;
    const undated = search.total === null ? 0 : Math.max(0, search.total - dated);
    // Missing sparse years can only make the earlier count larger.
    const earlierCount =
      earlier && `${truncated ? 'At least ' : ''}${this.numbers.format(earlier.count)}`;
    return {
      status: 'success' as const,
      total: this.formatTotal(search),
      bars: years.map((bucket) => this.toBar(bucket)),
      rows: [
        ...(earlier ? [{ label: `Before ${earlier.year}`, count: earlierCount! }] : []),
        ...years.map(({ year, count, partial }) => ({
          label: partial ? `${year} (so far)` : String(year),
          count: this.numbers.format(count),
        })),
      ],
      earlier: earlier && {
        before: earlier.year,
        text: `${earlierCount} ${earlier.count === 1 ? 'paper' : 'papers'}`,
      },
      partial: partial?.year ?? null,
      undated: undated ? this.papers(undated) : null,
      truncated,
    };
  }

  private toBar({ year, count, partial }: YearBucket): BarDatum {
    const when = partial ? `${year} so far` : String(year);
    return {
      key: String(year),
      label: String(year),
      value: count,
      description: `${when}: ${this.papers(count)}`,
    };
  }

  private papers(count: number): string {
    return `${this.numbers.format(count)} ${count === 1 ? 'paper' : 'papers'}`;
  }
}
