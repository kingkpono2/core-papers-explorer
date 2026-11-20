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
  signal,
  viewChildren,
} from '@angular/core';
import { labelStep, niceTicks } from '../bar-chart/chart-scale';

export interface LineCategory {
  key: string;
  /** Shown on the axis when there is room, such as "2020". */
  label: string;
  /** Used in the tooltip and read out, such as "2026 so far". */
  description: string;
}

export interface LineSeries {
  key: string;
  label: string;
  /** One value per category; null leaves a gap. */
  values: readonly (number | null)[];
  /** How to show each value in the tooltip and read it out, if not as the number and `unit`. */
  labels?: readonly string[];
  /**
   * The colour and marker, from 1 to 3. It belongs to the series, not its position, so a series
   * keeps its colour when another one drops out.
   */
  slot: number;
}

export const MAX_SERIES = 3;

const HEIGHT = 240;
const MARGIN = { top: 16, right: 12, bottom: 26 };
/** Room for a four-digit year at the axis font size. */
const LABEL_WIDTH = 40;
const DIGIT_WIDTH = 7.5;
/** Space between the crosshair and the tooltip beside it. */
const TOOLTIP_OFFSET = 12;
/** Narrower charts have no room beside the crosshair, so the tooltip goes under the axis. */
const TOOLTIP_BESIDE_MIN_WIDTH = 480;

/**
 * A responsive line chart for up to three series over shared categories, drawn as SVG at the width
 * it is given. Each series has its own colour and marker shape, so none relies on colour alone, and
 * a legend names them. Hovering or focusing a category shows every series for it; the categories
 * form a single tab stop moved with the arrow keys, Home and End.
 */
@Component({
  selector: 'app-line-chart',
  templateUrl: './line-chart.html',
  styleUrl: './line-chart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LineChart {
  readonly categories = input.required<readonly LineCategory[]>();
  readonly series = input.required<readonly LineSeries[]>();
  /** Accessible name of the chart. */
  readonly label = input.required<string>();
  /** Added to each value where it is read out or shown in the tooltip, such as "papers". */
  readonly unit = input('');
  /** Added to the axis labels, such as "%". */
  readonly axisSuffix = input('');

  protected readonly height = HEIGHT;
  protected readonly width = signal(0);
  /** The hovered or focused category, which gets the crosshair and the tooltip. */
  protected readonly active = signal<number | null>(null);
  private readonly tabStop = signal(0);
  private readonly hits = viewChildren<ElementRef<SVGRectElement>>('hit');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly locale = inject(LOCALE_ID);
  private readonly full = new Intl.NumberFormat(this.locale);
  private readonly compact = new Intl.NumberFormat(this.locale, { notation: 'compact' });

  protected readonly focusable = computed(() =>
    Math.min(this.tabStop(), this.categories().length - 1),
  );

  protected readonly legend = computed(() =>
    this.series().map((series) => ({ key: series.key, label: series.label, slot: slotOf(series) })),
  );

  protected readonly layout = computed(() => {
    const categories = this.categories();
    const series = this.series();
    const width = Math.max(this.width(), 200);
    const max = Math.max(0, ...series.flatMap((s) => s.values.map((value) => value ?? 0)));
    const ticks = niceTicks(max);
    const top = ticks[ticks.length - 1];
    const format = top >= 10_000 ? this.compact : this.full;
    const tickLabels = ticks.map((tick) => format.format(tick) + this.axisSuffix());
    const left = Math.ceil(Math.max(...tickLabels.map((text) => text.length)) * DIGIT_WIDTH) + 10;
    const plotWidth = width - left - MARGIN.right;
    const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
    const baseline = MARGIN.top + plotHeight;
    const band = plotWidth / Math.max(categories.length, 1);
    const step = labelStep(categories.length, plotWidth, LABEL_WIDTH);
    const x = (i: number) => left + (i + 0.5) * band;
    const y = (value: number) => baseline - (value / top) * plotHeight;

    return {
      width,
      left,
      right: width - MARGIN.right,
      top: MARGIN.top,
      baseline,
      plotHeight,
      band,
      ticks: ticks.map((value, i) => ({ value, y: y(value), label: tickLabels[i] })),
      columns: categories.map((category, i) => ({
        category,
        x: left + i * band,
        center: x(i),
        // Counted from the last category, so the most recent one always has its label.
        showLabel: (categories.length - 1 - i) % step === 0,
        description: this.describe(i),
      })),
      lines: series.map((s) => ({
        key: s.key,
        slot: slotOf(s),
        path: linePath(s.values, x, y),
        points: s.values.flatMap((value, i) =>
          value === null ? [] : [{ index: i, x: x(i), y: y(value) }],
        ),
      })),
    };
  });

  protected readonly tooltip = computed(() => {
    const index = this.active();
    const layout = this.layout();
    const column = index === null ? undefined : layout.columns[index];
    if (!column || index === null) {
      return null;
    }
    const flip = column.center > layout.width / 2;
    const below = layout.width < TOOLTIP_BESIDE_MIN_WIDTH;
    return {
      heading: column.category.description,
      rows: this.series().map((series) => ({
        key: series.key,
        slot: slotOf(series),
        label: series.label,
        value: this.valueText(series, index),
      })),
      x: below ? 0 : column.center + (flip ? -TOOLTIP_OFFSET : TOOLTIP_OFFSET),
      y: below ? HEIGHT : layout.top,
      flip: flip && !below,
      below,
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

  protected onKeydown(event: KeyboardEvent, index: number): void {
    const last = this.categories().length - 1;
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
    }
  }

  /** "2020: drone 354 papers, robots 1,234 papers". */
  private describe(index: number): string {
    const category = this.categories()[index];
    const values = this.series().map(
      (series) => `${series.label} ${this.valueText(series, index)}`,
    );
    return `${category.description}: ${values.join(', ')}`;
  }

  private valueText(series: LineSeries, index: number): string {
    return series.labels?.[index] ?? this.format(series.values[index] ?? null);
  }

  private format(value: number | null): string {
    if (value === null) {
      return 'no data';
    }
    const unit = this.unit();
    return unit ? `${this.full.format(value)} ${unit}` : this.full.format(value);
  }
}

function slotOf(series: LineSeries): number {
  return clamp(Math.round(series.slot), 1, MAX_SERIES);
}

/** A polyline through the values, broken where a value is missing. */
export function linePath(
  values: readonly (number | null)[],
  x: (index: number) => number,
  y: (value: number) => number,
): string {
  let path = '';
  let drawing = false;
  values.forEach((value, i) => {
    if (value === null) {
      drawing = false;
      return;
    }
    path += `${drawing ? 'L' : 'M'}${round(x(i))},${round(y(value))}`;
    drawing = true;
  });
  return path;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
