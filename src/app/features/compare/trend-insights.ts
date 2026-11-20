import { YearCount, YearCounts } from '../../core/models/paper';
import { FIRST_PLAUSIBLE_YEAR } from '../search/chart/year-series';

/** How many years the comparison shows, ending with the latest year any series has. */
export const COMPARE_SPAN = 15;
/** Below this many papers in the first year, a multiplier says more about noise than growth. */
export const MIN_GROWTH_BASE = 10;
/** Changes within 5% either way count as flat. */
const FLAT = 0.05;

export interface AlignedSeries {
  /** One count per year in `years`. */
  values: number[];
  /** Papers from before the first year shown. */
  earlier: number;
  /** Papers with a plausible year. */
  dated: number;
  /** CORE left out its sparsest years, so `dated` and `earlier` are lower bounds. */
  truncated: boolean;
}

export interface AlignedTrends {
  years: number[];
  /** The current year, if shown: it is still being filled in. */
  partialYear: number | null;
  series: AlignedSeries[];
}

export interface Growth {
  from: YearCount;
  to: YearCount;
  /** `to / from`, or null when `from` is too small for a ratio to mean much. */
  ratio: number | null;
}

export interface TrendInsight {
  label: string;
  dated: number;
  truncated: boolean;
  /** The busiest full year, at any time. */
  peakYear: number | null;
  growth: Growth | null;
  /** Such as "drone delivery: 4,729 dated papers, peaking in 2025; output grew 8.2× from…". */
  sentence: string;
}

/**
 * Puts the series on the same years: the last `span` years up to the latest one any series has,
 * with zeros where a series has none, and everything older summed per series. Impossible years,
 * such as 1000 or anything after `currentYear`, are left out, as in the search page chart.
 */
export function alignTrends(
  inputs: readonly YearCounts[],
  currentYear: number,
  span = COMPARE_SPAN,
): AlignedTrends {
  const plausible = inputs.map(({ counts }) => plausibleCounts(counts, currentYear));
  const latest = Math.max(...plausible.flat().map(({ year }) => year));
  if (!Number.isFinite(latest)) {
    return {
      years: [],
      partialYear: null,
      series: inputs.map(({ truncated }) => ({ values: [], earlier: 0, dated: 0, truncated })),
    };
  }
  const first = latest - span + 1;
  const years = Array.from({ length: span }, (_, i) => first + i);
  return {
    years,
    partialYear: latest === currentYear ? currentYear : null,
    series: plausible.map((counts, i) => {
      const byYear = new Map(counts.map(({ year, count }) => [year, count]));
      return {
        values: years.map((year) => byYear.get(year) ?? 0),
        earlier: sum(counts.filter(({ year }) => year < first)),
        dated: sum(counts),
        truncated: inputs[i].truncated,
      };
    }),
  };
}

/**
 * The plain-language summary of one series: its size, its busiest year and how its output changed
 * from the first year shown to the last full year (the current year is still being filled in).
 */
export function trendInsight(
  label: string,
  counts: YearCounts,
  years: readonly number[],
  currentYear: number,
  format: (value: number) => string,
): TrendInsight {
  const plausible = plausibleCounts(counts.counts, currentYear);
  const full = plausible.filter(({ year }) => year < currentYear);
  const dated = sum(plausible);
  const peak = full.reduce<YearCount | null>(
    (best, entry) => (!best || entry.count > best.count ? entry : best),
    null,
  );
  const growth = growthOver(plausible, years, currentYear);

  const size = `${counts.truncated ? 'at least ' : ''}${format(dated)} dated ${dated === 1 ? 'paper' : 'papers'}`;
  const parts = [`${label}: ${size}${peak ? `, peaking in ${peak.year}` : ''}`];
  if (growth) {
    parts.push(describeGrowth(growth, format));
  }
  return {
    label,
    dated,
    truncated: counts.truncated,
    peakYear: peak?.year ?? null,
    growth,
    sentence: `${parts.join('; ')}.`,
  };
}

export interface ComparedSeries {
  label: string;
  /** One count per year in `years`. */
  values: readonly number[];
}

/**
 * One sentence comparing how fast the series grew to the last full year, or null when fewer than two
 * have data. Growth is measured from the first year shown, or, when a series has too few papers
 * then for a multiplier to mean much, from the first year in which every series has enough.
 */
export function compareGrowth(
  series: readonly ComparedSeries[],
  years: readonly number[],
  currentYear: number,
): string | null {
  if (series.length < 2) {
    return null;
  }
  const end = years.reduce((last, year, i) => (year < currentYear ? i : last), -1);
  const base = years.findIndex(
    (_, i) => i < end && series.every(({ values }) => values[i] >= MIN_GROWTH_BASE),
  );
  if (end === -1 || base === -1) {
    return null;
  }
  const ranked = series
    .map(({ label, values }) => ({ label, ratio: values[end] / values[base] }))
    .sort((a, b) => b.ratio - a.ratio);
  const sentence = rank(ranked);
  return base === 0
    ? sentence
    : `Measured from ${years[base]}, when each had at least ${MIN_GROWTH_BASE} papers, ${sentence}`;
}

function rank(ranked: readonly { label: string; ratio: number }[]): string {
  const [top, ...rest] = ranked;
  if (ranked.length === 2) {
    const [, second] = ranked;
    if (top.ratio / second.ratio < 1 + FLAT) {
      return `${top.label} and ${second.label} changed at about the same rate (${change(top.ratio)} and ${change(second.ratio)}).`;
    }
    if (second.ratio >= 1) {
      return `${top.label} grew faster than ${second.label} (${change(top.ratio)} vs ${change(second.ratio)}).`;
    }
    if (top.ratio >= 1) {
      return `${top.label} grew (${change(top.ratio)}) while ${second.label} shrank (${change(second.ratio)}).`;
    }
    return `${second.label} shrank faster than ${top.label} (${change(second.ratio)} vs ${change(top.ratio)}).`;
  }
  const others = rest.map(({ label, ratio }) => `${label} (${change(ratio)})`).join(' and ');
  return top.ratio >= 1
    ? `${top.label} grew fastest (${change(top.ratio)}), ahead of ${others}.`
    : `${top.label} held up best (${change(top.ratio)}), ahead of ${others}.`;
}

/** "8.2×", "23×", "down 40%" or "no change". */
export function change(ratio: number): string {
  if (Math.abs(ratio - 1) < FLAT) {
    return 'no change';
  }
  if (ratio < 1) {
    return `down ${Math.round((1 - ratio) * 100)}%`;
  }
  return ratio < 10 ? `${ratio.toFixed(1)}×` : `${Math.round(ratio).toLocaleString('en-US')}×`;
}

function growthOver(
  counts: readonly YearCount[],
  years: readonly number[],
  currentYear: number,
): Growth | null {
  const first = years[0];
  const last = years.at(-1);
  if (first === undefined || last === undefined) {
    return null;
  }
  const lastFull = last >= currentYear ? currentYear - 1 : last;
  if (lastFull <= first) {
    return null;
  }
  const byYear = new Map(counts.map(({ year, count }) => [year, count]));
  const from = { year: first, count: byYear.get(first) ?? 0 };
  const to = { year: lastFull, count: byYear.get(lastFull) ?? 0 };
  return { from, to, ratio: from.count >= MIN_GROWTH_BASE ? to.count / from.count : null };
}

function describeGrowth({ from, to, ratio }: Growth, format: (value: number) => string): string {
  const span = `from ${from.year} to ${to.year}`;
  if (ratio === null) {
    if (!from.count && !to.count) {
      return `no papers in ${from.year} or ${to.year}`;
    }
    return `output went from ${format(from.count)} in ${from.year} to ${format(to.count)} in ${to.year}`;
  }
  if (Math.abs(ratio - 1) < FLAT) {
    return `output held steady ${span}`;
  }
  return ratio > 1
    ? `output grew ${change(ratio)} ${span}`
    : `output fell ${Math.round((1 - ratio) * 100)}% ${span}`;
}

function plausibleCounts(counts: readonly YearCount[], currentYear: number): YearCount[] {
  return counts.filter(({ year }) => year >= FIRST_PLAUSIBLE_YEAR && year <= currentYear);
}

function sum(counts: readonly YearCount[]): number {
  return counts.reduce((total, { count }) => total + count, 0);
}
