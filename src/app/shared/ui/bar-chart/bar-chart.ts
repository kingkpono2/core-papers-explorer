import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  LOCALE_ID,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChildren,
} from '@angular/core';
import { barPath, labelStep, niceTicks } from './chart-scale';

export interface BarDatum {
  key: string;
  /** Shown under the bar when there is room. */
  label: string;
  value: number;
  /** Read out on focus and shown in the tooltip, such as "2020: 5,626 papers". */
  description: string;
}

const HEIGHT = 220;
const MARGIN = { top: 24, right: 8, bottom: 26 };
const MAX_BAR_WIDTH = 24;
const BAR_GAP = 2;
/** Room for a four-digit year at the axis font size. */
const LABEL_WIDTH = 40;
const DIGIT_WIDTH = 7.5;
const TOOLTIP_HALF_WIDTH = 90;

/**
 * A responsive column chart drawn as SVG at the width it is given. One series, so it needs no
 * legend: the surrounding title says what is counted. Bars form a single tab stop; the arrow keys,
 * Home and End move between them, and Enter or Space selects one when `selectable` is set.
 */
@Component({
  selector: 'app-bar-chart',
  templateUrl: './bar-chart.html',
  styleUrl: './bar-chart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BarChart {
  readonly bars = input.required<readonly BarDatum[]>();
  /** Accessible name of the chart. */
  readonly label = input.required<string>();
  readonly selectable = input(false);
  readonly selected = output<BarDatum>();

  protected readonly height = HEIGHT;
  protected readonly width = signal(0);
  /** The hovered or focused bar, which gets the tooltip. */
  protected readonly active = signal<number | null>(null);
  private readonly tabStop = signal(0);
  private readonly hits = viewChildren<ElementRef<SVGRectElement>>('hit');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly locale = inject(LOCALE_ID);
  private readonly full = new Intl.NumberFormat(this.locale);
  private readonly compact = new Intl.NumberFormat(this.locale, { notation: 'compact' });

  protected readonly focusable = computed(() => Math.min(this.tabStop(), this.bars().length - 1));

  protected readonly layout = computed(() => {
    const bars = this.bars();
    const width = Math.max(this.width(), 200);
    const max = Math.max(0, ...bars.map((bar) => bar.value));
    const ticks = niceTicks(max);
    const top = ticks[ticks.length - 1];
    const format = top >= 10_000 ? this.compact : this.full;
    const tickLabels = ticks.map((tick) => format.format(tick));
    const left = Math.ceil(Math.max(...tickLabels.map((text) => text.length)) * DIGIT_WIDTH) + 10;
    const plotWidth = width - left - MARGIN.right;
    const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
    const baseline = MARGIN.top + plotHeight;
    const band = plotWidth / Math.max(bars.length, 1);
    const barWidth = Math.max(1, Math.min(MAX_BAR_WIDTH, band - BAR_GAP));
    const step = labelStep(bars.length, plotWidth, LABEL_WIDTH);
    const y = (value: number) => baseline - (value / top) * plotHeight;
    const peak = bars.findIndex((bar) => bar.value === max && max > 0);

    return {
      width,
      left,
      right: width - MARGIN.right,
      top: MARGIN.top,
      baseline,
      plotHeight,
      band,
      ticks: ticks.map((value, i) => ({ value, y: y(value), label: tickLabels[i] })),
      bars: bars.map((datum, i) => {
        const x = left + i * band;
        const center = x + band / 2;
        return {
          datum,
          id: `${datum.key}:${datum.value}`,
          x,
          center,
          top: y(datum.value),
          path: barPath(center - barWidth / 2, y(datum.value), barWidth, baseline - y(datum.value)),
          // Counted from the last bar, so the most recent year always has its label.
          showLabel: (bars.length - 1 - i) % step === 0,
        };
      }),
      peak:
        peak === -1
          ? null
          : {
              index: peak,
              x: clamp(left + (peak + 0.5) * band, left + 20, width - 24),
              y: y(max) - 6,
              text: this.full.format(max),
            },
    };
  });

  protected readonly tooltip = computed(() => {
    const index = this.active();
    const layout = this.layout();
    const bar = index === null ? undefined : layout.bars[index];
    if (!bar) {
      return null;
    }
    const halfWidth = Math.min(TOOLTIP_HALF_WIDTH, layout.width / 2);
    return {
      text: bar.datum.description,
      x: clamp(bar.center, halfWidth, layout.width - halfWidth),
      y: Math.min(bar.top, layout.baseline) - 8,
    };
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const element = this.host.nativeElement;
      this.width.set(element.clientWidth);
      const observer = new ResizeObserver(([entry]) =>
        this.width.set(Math.round(entry.contentRect.width)),
      );
      observer.observe(element);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected focus(index: number): void {
    this.tabStop.set(index);
    this.active.set(index);
  }

  protected select(index: number): void {
    const bar = this.bars()[index];
    if (bar && this.selectable()) {
      this.selected.emit(bar);
    }
  }

  protected onKeydown(event: KeyboardEvent, index: number): void {
    const last = this.bars().length - 1;
    const target = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      Home: 0,
      End: last,
    }[event.key];
    if (target !== undefined) {
      event.preventDefault();
      const next = clamp(target, 0, last);
      this.tabStop.set(next);
      this.hits()[next]?.nativeElement.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.select(index);
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
