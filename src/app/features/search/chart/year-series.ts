import { YearCount } from '../../../core/models/paper';

export interface YearBucket {
  /** `earlier` holds every year before `year`. */
  kind: 'year' | 'earlier';
  year: number;
  count: number;
  /** The current year, still being filled in. */
  partial: boolean;
}

export interface YearSeries {
  buckets: YearBucket[];
  /** Papers with a plausible publication year, all of which are in the buckets. */
  dated: number;
}

export interface YearSeriesOptions {
  minYears: number;
  maxYears: number;
  /** Share of dated papers the individual years should cover; the rest go into `earlier`. */
  coverage: number;
}

/** Years outside this range are data errors in CORE, such as 1000, 2096 or 9999. */
const FIRST_PLAUSIBLE_YEAR = 1500;

const DEFAULTS: YearSeriesOptions = { minYears: 10, maxYears: 30, coverage: 0.98 };

/**
 * Picks the years worth a bar of their own: back from the latest year until nearly all dated papers
 * are covered, within `minYears` and `maxYears`. Older papers are summed into one `earlier` bucket,
 * so every dated paper is counted somewhere and a long, thin tail does not squash the chart.
 */
export function buildYearSeries(
  counts: readonly YearCount[],
  currentYear: number,
  options: Partial<YearSeriesOptions> = {},
): YearSeries {
  const { minYears, maxYears, coverage } = { ...DEFAULTS, ...options };
  const plausible = counts
    .filter(({ year }) => year >= FIRST_PLAUSIBLE_YEAR && year <= currentYear)
    .sort((a, b) => a.year - b.year);
  const dated = plausible.reduce((sum, { count }) => sum + count, 0);
  if (!dated) {
    return { buckets: [], dated: 0 };
  }

  const last = plausible[plausible.length - 1].year;
  let first = last;
  let covered = 0;
  for (let i = plausible.length - 1; i >= 0 && covered < dated * coverage; i--) {
    first = plausible[i].year;
    covered += plausible[i].count;
  }
  first = Math.min(Math.max(first, last - maxYears + 1), last - minYears + 1);

  const byYear = new Map(plausible.map(({ year, count }) => [year, count]));
  const earlier = plausible
    .filter(({ year }) => year < first)
    .reduce((sum, { count }) => sum + count, 0);
  const buckets: YearBucket[] = earlier
    ? [{ kind: 'earlier', year: first, count: earlier, partial: false }]
    : [];
  for (let year = first; year <= last; year++) {
    buckets.push({
      kind: 'year',
      year,
      count: byYear.get(year) ?? 0,
      partial: year === currentYear,
    });
  }
  return { buckets, dated };
}
