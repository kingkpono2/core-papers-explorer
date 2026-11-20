import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, merge, of, scan, startWith, switchMap } from 'rxjs';
import { Paper } from '../../../core/models/paper';
import { percent } from '../analysis/topic-stats';
import { AnalysedGalaxy, GalaxyAnalyser } from '../galaxy-analyser';
import { GalaxyLegend } from '../galaxy-legend/galaxy-legend';
import { GalaxySky } from '../galaxy-sky/galaxy-sky';
import { GalaxyTopicList } from '../galaxy-topic-list/galaxy-topic-list';
import { ReducedMotion } from '../reduced-motion';

type Analysis =
  | { status: 'waiting' }
  | { status: 'analysing'; papers: readonly Paper[]; query: string }
  | { status: 'ready'; papers: readonly Paper[]; query: string; galaxy: AnalysedGalaxy }
  | { status: 'failed'; papers: readonly Paper[]; query: string };

interface Size {
  width: number;
  height: number;
}

/** The time-lapse takes about this long, however many years it covers. */
export const PLAY_DURATION_MS = 7_000;
const MIN_STEP_MS = 320;
const MAX_STEP_MS = 900;
/** A resize has to settle before the stars are laid out again. */
const RESIZE_DELAY_MS = 200;
const PLACEHOLDER_STARS = 70;

/**
 * The night-sky panel: asks the worker for topics and a layout sized to the sky, then shows the
 * sky, a time-lapse in which the papers appear year by year, the topics with their growth, and a
 * list view of the same content. Stays dark in both themes.
 */
@Component({
  selector: 'app-galaxy-map',
  imports: [DecimalPipe, GalaxyLegend, GalaxySky, GalaxyTopicList],
  templateUrl: './galaxy-map.html',
  styleUrl: './galaxy-map.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Escape clears a highlighted topic wherever focus is in the panel.
  host: { '(keydown.escape)': 'selected.set(null)' },
})
export class GalaxyMap {
  /** Null while the papers are being fetched. */
  readonly papers = input.required<readonly Paper[] | null>();
  readonly query = input.required<string>();
  /** How many papers match in all of CORE. */
  readonly total = input<number | null>(null);
  /** Duplicate records merged before the papers arrived here. */
  readonly merged = input(0);
  /** For tests; the real year otherwise. */
  readonly currentYear = input(new Date().getFullYear());

  private readonly analyser = inject(GalaxyAnalyser);
  private readonly frame = viewChild.required<ElementRef<HTMLElement>>('frame');
  private readonly retries = new Subject<void>();
  private timer?: ReturnType<typeof setTimeout>;

  protected readonly reducedMotion = inject(ReducedMotion).reduced;
  protected readonly size = signal<Size | null>(null);
  protected readonly showList = signal(false);
  protected readonly placeholder = Array.from({ length: PLACEHOLDER_STARS }, (_, i) => ({
    x: ((i * 73) % 100) + ((i * 7) % 10) / 10,
    y: ((i * 37) % 100) + ((i * 3) % 10) / 10,
    big: i % 9 === 0,
  }));

  private readonly request = computed(
    () => {
      const papers = this.papers();
      const size = this.size();
      return papers && size ? { papers, query: this.query(), ...size } : null;
    },
    {
      equal: (a, b) =>
        a === b ||
        (!!a &&
          !!b &&
          a.papers === b.papers &&
          a.query === b.query &&
          a.width === b.width &&
          a.height === b.height),
    },
  );

  // A new layout for the same papers (after a resize) keeps the old one on screen until it is
  // ready; new papers start again.
  protected readonly analysis = toSignal<Analysis, Analysis>(
    merge(toObservable(this.request), this.retries.pipe(map(() => this.request()))).pipe(
      switchMap((request) => {
        if (!request) {
          return of<Analysis>({ status: 'waiting' });
        }
        const { papers, query, width, height } = request;
        const input = {
          query,
          papers: papers.map(({ title, abstract, year }) => ({ title, abstract, year })),
          currentYear: this.currentYear(),
          width,
          height,
        };
        return this.analyser.analyse(input).pipe(
          map((galaxy): Analysis => ({ status: 'ready', papers, query, galaxy })),
          catchError(() => of<Analysis>({ status: 'failed', papers, query })),
          startWith<Analysis>({ status: 'analysing', papers, query }),
        );
      }),
      scan(
        (previous: Analysis, next: Analysis) =>
          next.status === 'analysing' &&
          previous.status === 'ready' &&
          previous.papers === next.papers &&
          previous.query === next.query
            ? previous
            : next,
        { status: 'waiting' } as Analysis,
      ),
    ),
    { initialValue: { status: 'waiting' } },
  );

  protected readonly galaxy = computed(() => {
    const analysis = this.analysis();
    return analysis.status === 'ready' && analysis.papers === this.papers()
      ? analysis.galaxy
      : null;
  });

  protected readonly span = computed(() => {
    const years = (this.papers() ?? []).flatMap((paper) =>
      paper.year === null ? [] : [paper.year],
    );
    return years.length ? { first: Math.min(...years), last: Math.max(...years) } : null;
  });

  /** The year the time-lapse has reached; the last year shows every paper, undated ones too. */
  protected readonly year = linkedSignal(() => this.span()?.last ?? 0);
  protected readonly playing = linkedSignal({ source: this.papers, computation: () => false });
  protected readonly selected = linkedSignal<AnalysedGalaxy | null, number | null>({
    source: this.galaxy,
    computation: () => null,
  });

  protected readonly complete = computed(() => {
    const span = this.span();
    return !span || this.year() >= span.last;
  });

  protected readonly visible = computed(() => {
    const span = this.span();
    const year = this.year();
    return (this.papers() ?? []).map(
      (paper) => !span || (paper.year === null ? year >= span.last : paper.year <= year),
    );
  });

  protected readonly shown = computed(() => this.visible().filter(Boolean).length);

  protected readonly counts = computed(() => {
    const galaxy = this.galaxy();
    const visible = this.visible();
    const counts = new Array<number>(galaxy?.topics.length ?? 0).fill(0);
    galaxy?.topicOf.forEach((topic, i) => {
      if (visible[i]) {
        counts[topic]++;
      }
    });
    return counts;
  });

  protected readonly valueText = computed(() => {
    const count = this.papers()?.length ?? 0;
    return this.complete()
      ? `${this.year()}: all ${count} papers`
      : `${this.year()}: ${this.shown()} of ${count} papers`;
  });

  private readonly stepMs = computed(() => {
    const span = this.span();
    const years = span ? span.last - span.first + 1 : 1;
    return Math.min(MAX_STEP_MS, Math.max(MIN_STEP_MS, PLAY_DURATION_MS / years));
  });

  protected readonly insight = computed(() => {
    const galaxy = this.galaxy();
    if (!galaxy) {
      return null;
    }
    const { topics, highlights } = galaxy;
    const growing = highlights.fastestGrowing === null ? null : topics[highlights.fastestGrowing];
    const established =
      highlights.mostEstablished === null ? null : topics[highlights.mostEstablished];
    return {
      topics: topics.length,
      since: highlights.since,
      growing: growing && { label: growing.label, share: percent(growing.recentShare ?? 0) },
      established: established && { label: established.label, year: established.medianYear },
    };
  });

  /** Read out once the map is complete, not at every step of the time-lapse. */
  protected readonly announcement = computed(() => {
    const galaxy = this.galaxy();
    if (!galaxy || this.playing() || !this.complete()) {
      return '';
    }
    const count = this.papers()?.length ?? 0;
    return `${count} papers in ${galaxy.insight}.`;
  });

  /** How long each step took, for anyone curious enough to hover over the timing. */
  protected readonly timingDetail = computed(() => {
    const timings = this.galaxy()?.timings;
    if (!timings) {
      return null;
    }
    const ms = (value: number) => `${Math.round(value)} ms`;
    return [
      `words ${ms(timings.terms)}`,
      `vectors ${ms(timings.vectors)}`,
      `topics ${ms(timings.topics)}`,
      `names ${ms(timings.labels)}`,
      `layout ${ms(timings.layout)}`,
    ].join(' · ');
  });

  protected readonly abstractNote = computed(() => {
    const galaxy = this.galaxy();
    const count = this.papers()?.length ?? 0;
    if (!galaxy || galaxy.withAbstract * 2 >= count) {
      return null;
    }
    return galaxy.withAbstract
      ? 'Most of these papers have no abstract in CORE, so their topics come mostly from titles.'
      : 'None of these papers has an abstract in CORE, so their topics come from titles alone.';
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => clearTimeout(this.timer));
    afterNextRender(() => {
      const element = this.frame().nativeElement;
      let pending: ReturnType<typeof setTimeout> | undefined;
      const measure = () => {
        const width = Math.round(element.clientWidth);
        const height = Math.round(element.clientHeight);
        const current = this.size();
        if (width > 0 && height > 0 && (current?.width !== width || current.height !== height)) {
          this.size.set({ width, height });
        }
      };
      measure();
      const observer = new ResizeObserver(() => {
        clearTimeout(pending);
        pending = setTimeout(measure, RESIZE_DELAY_MS);
      });
      observer.observe(element);
      destroyRef.onDestroy(() => {
        clearTimeout(pending);
        observer.disconnect();
      });
    });
  }

  protected togglePlay(): void {
    if (this.playing()) {
      this.pause();
    } else {
      this.play();
    }
  }

  protected scrub(value: string): void {
    const span = this.span();
    if (!span) {
      return;
    }
    this.pause();
    this.year.set(Math.min(span.last, Math.max(span.first, Math.round(Number(value)))));
  }

  protected select(topic: number | null): void {
    this.selected.set(topic === this.selected() ? null : topic);
  }

  protected retry(): void {
    this.retries.next();
  }

  /** From the first year, or from the start again once it has ended; at once with reduced motion. */
  private play(): void {
    const span = this.span();
    if (!span) {
      return;
    }
    if (this.reducedMotion()) {
      this.year.set(span.last);
      return;
    }
    if (this.complete()) {
      this.year.set(span.first);
    }
    this.playing.set(true);
    this.schedule();
  }

  private pause(): void {
    this.playing.set(false);
    clearTimeout(this.timer);
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.advance(), this.stepMs());
  }

  private advance(): void {
    const span = this.span();
    if (!span || !this.playing()) {
      return;
    }
    const next = Math.min(this.year() + 1, span.last);
    this.year.set(next);
    if (next >= span.last) {
      this.playing.set(false);
    } else {
      this.schedule();
    }
  }
}
