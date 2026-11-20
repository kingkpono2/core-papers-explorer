import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  LOCALE_ID,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
  viewChildren,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, of, switchMap } from 'rxjs';
import { LineCategory, LineChart, LineSeries } from '../../../shared/ui/line-chart/line-chart';
import { coreQueryAdjustment, toCoreQuery } from '../../search/query/core-query';
import { Diagnostic, analyseQuery, normaliseQuery } from '../../search/query/query-analyser';
import {
  COMPARE_EXAMPLES,
  MAX_COMPARED,
  MIN_COMPARED,
  parseCompareQueries,
  sameQueries,
  tidyQueries,
} from '../compare-params';
import { CompareTrends, TrendState } from '../compare-trends';
import { alignTrends, compareGrowth, trendInsight } from '../trend-insights';

type SeriesState = TrendState | { status: 'invalid'; message: string };

interface Entry {
  query: string;
  /** Colour and marker of the series, by its place in the URL. */
  slot: number;
  /** Position among the queries that are sent to CORE, or -1 for one with errors. */
  load: number;
  coreQuery: string;
  adjustment: ReturnType<typeof coreQueryAdjustment>;
  error: string | null;
}

/**
 * Compares how many papers matching two or three queries were published each year. The URL holds
 * the queries (`?q=...&q=...`), so a comparison can be shared, and each one is checked with the
 * same analyser as the search box before it is sent.
 */
@Component({
  selector: 'app-compare-page',
  imports: [LineChart, RouterLink],
  templateUrl: './compare-page.html',
  styleUrl: './compare-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComparePage {
  /** For tests; the real year otherwise. */
  readonly currentYear = input(new Date().getFullYear());

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly trends = inject(CompareTrends);
  private readonly injector = inject(Injector);
  private readonly numbers = new Intl.NumberFormat(inject(LOCALE_ID));
  private readonly retries = new Subject<number>();
  private readonly fields = viewChildren<ElementRef<HTMLInputElement>>('field');
  private readonly queryParamMap = toSignal(this.route.queryParamMap, { requireSync: true });

  protected readonly examples = COMPARE_EXAMPLES;
  protected readonly maxCompared = MAX_COMPARED;
  protected readonly minCompared = MIN_COMPARED;

  protected readonly queries = computed(() => parseCompareQueries(this.queryParamMap()), {
    equal: sameQueries,
  });

  /** What is typed in the boxes; reset whenever the URL changes. */
  protected readonly drafts = linkedSignal(() => {
    const queries = this.queries();
    return queries.length >= MIN_COMPARED ? [...queries] : [...queries, '', ''].slice(0, 2);
  });
  /** Problems found on submit, per box. */
  protected readonly problems = linkedSignal<string[], Diagnostic[][]>({
    source: this.queries,
    computation: () => [],
  });
  protected readonly fieldProblems = computed(() =>
    this.drafts().map((_, i) => this.problems()[i] ?? []),
  );
  protected readonly formError = linkedSignal<string[], string | null>({
    source: this.queries,
    computation: () => null,
  });
  protected readonly showTable = signal(false);
  /** Each series as a share of its busiest year, so topics of very different sizes can be compared. */
  protected readonly relative = signal(false);

  private readonly entries = computed<Entry[]>(() => {
    let load = 0;
    return this.queries().map((query, i) => {
      const analysis = analyseQuery(query);
      const error = analysis.diagnostics.find((d) => d.severity === 'error')?.message ?? null;
      return {
        query,
        slot: i + 1,
        load: error ? -1 : load++,
        coreQuery: toCoreQuery(query),
        adjustment: error ? null : coreQueryAdjustment(query),
        error,
      };
    });
  });

  private readonly requests = computed(
    () =>
      this.queries().length < MIN_COMPARED
        ? []
        : this.entries()
            .filter((entry) => !entry.error)
            .map((entry) => entry.coreQuery),
    { equal: sameQueries },
  );

  // switchMap drops the previous comparison when the queries change, which aborts its requests.
  private readonly states = toSignal<TrendState[], TrendState[]>(
    toObservable(this.requests).pipe(
      switchMap((requests) =>
        requests.length ? this.trends.load(requests, this.retries) : of<TrendState[]>([]),
      ),
    ),
    { initialValue: [] },
  );

  protected readonly view = computed(() => {
    const queries = this.queries();
    if (queries.length < MIN_COMPARED) {
      return { status: 'empty' as const, single: queries[0] ?? null };
    }
    const states = this.states();
    const currentYear = this.currentYear();
    const series = this.entries().map((entry) => ({
      ...entry,
      state: (entry.error
        ? { status: 'invalid', message: entry.error }
        : (states[entry.load] ?? { status: 'loading' })) as SeriesState,
    }));
    const done = series.flatMap((s) =>
      s.state.status === 'success' ? [{ ...s, counts: s.state.counts }] : [],
    );
    const aligned = alignTrends(
      done.map((s) => s.counts),
      currentYear,
    );
    const format = (value: number) => this.numbers.format(value);
    const insights = done.map((s) => ({
      slot: s.slot,
      ...trendInsight(s.query, s.counts, aligned.years, currentYear, format),
    }));
    const categories: LineCategory[] = aligned.years.map((year) => ({
      key: String(year),
      label: String(year),
      description: year === aligned.partialYear ? `${year} so far` : String(year),
    }));
    const relative = this.relative();
    const lines: LineSeries[] = done.map((s, i) => {
      const { values } = aligned.series[i];
      const peak = Math.max(0, ...values);
      const share = (value: number) => (peak ? Math.round((value / peak) * 1_000) / 10 : 0);
      const papers = (value: number) => `${format(value)} ${value === 1 ? 'paper' : 'papers'}`;
      return {
        key: s.query,
        label: s.query,
        values: relative ? values.map(share) : values,
        labels: values.map((value) =>
          relative ? `${papers(value)} (${share(value)}% of peak)` : papers(value),
        ),
        slot: s.slot,
      };
    });
    const first = aligned.years[0];
    return {
      status: 'results' as const,
      loading: series.some((s) => s.state.status === 'loading'),
      series,
      insights,
      comparison: compareGrowth(
        done.map((s, i) => ({ label: s.query, values: aligned.series[i].values })),
        aligned.years,
        currentYear,
      ),
      chart: categories.length && lines.length ? { categories, lines } : null,
      rows: categories.map((category, i) => ({
        label: category.description,
        counts: aligned.series.map((s) => format(s.values[i])),
      })),
      partialYear: aligned.partialYear,
      earlier: done.flatMap((s, i) => {
        const { earlier, truncated } = aligned.series[i];
        return earlier
          ? [
              {
                slot: s.slot,
                text: `${s.query}: ${truncated ? 'at least ' : ''}${format(earlier)} ${earlier === 1 ? 'paper' : 'papers'} from before ${first} not drawn.`,
              },
            ]
          : [];
      }),
      empty: done.length > 0 && !aligned.years.length,
    };
  });

  constructor() {
    // Arriving with one query (from "Compare with…" on the search page): go to the second box.
    afterNextRender(() => {
      if (this.queries().length === 1) {
        this.fields()[1]?.nativeElement.focus();
      }
    });
  }

  protected edit(index: number, value: string): void {
    this.drafts.update((drafts) => drafts.map((draft, i) => (i === index ? value : draft)));
    this.problems.update((problems) => problems.map((list, i) => (i === index ? [] : list)));
  }

  protected add(): void {
    if (this.drafts().length >= MAX_COMPARED) {
      return;
    }
    this.drafts.update((drafts) => [...drafts, '']);
    this.focusField(this.drafts().length - 1);
  }

  protected remove(index: number): void {
    this.drafts.update((drafts) => drafts.filter((_, i) => i !== index));
    this.problems.update((problems) => problems.filter((_, i) => i !== index));
    this.focusField(Math.min(index, this.drafts().length - 1));
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const drafts = this.drafts().map(normaliseQuery);
    const problems = drafts.map((draft) =>
      draft ? analyseQuery(draft).diagnostics.filter((d) => d.code !== 'empty-query') : [],
    );
    this.problems.set(problems);
    this.formError.set(null);

    const invalid = problems.findIndex((list) => list.some((d) => d.severity === 'error'));
    if (invalid !== -1) {
      this.focusField(invalid);
      return;
    }
    const queries = tidyQueries(drafts);
    if (queries.length < MIN_COMPARED) {
      const filled = drafts.filter(Boolean);
      this.formError.set(
        filled.length < MIN_COMPARED
          ? 'Enter at least two queries to compare.'
          : 'Enter two different queries to compare.',
      );
      this.focusField(
        Math.max(
          0,
          drafts.findIndex((draft, i) => !draft || drafts.indexOf(draft) !== i),
        ),
      );
      return;
    }
    void this.router.navigate([], { relativeTo: this.route, queryParams: { q: queries } });
  }

  protected retry(load: number): void {
    this.retries.next(load);
  }

  private focusField(index: number): void {
    afterNextRender(() => this.fields()[index]?.nativeElement.focus(), {
      injector: this.injector,
    });
  }
}
