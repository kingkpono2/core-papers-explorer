import { YearCount } from '../../../core/models/paper';
import { buildYearSeries } from './year-series';

const counts = (entries: Record<number, number>): YearCount[] =>
  Object.entries(entries).map(([year, count]) => ({ year: Number(year), count }));

describe('buildYearSeries', () => {
  it('gives each year from the oldest to the latest a bucket when they fit', () => {
    const series = buildYearSeries(counts({ 2018: 5, 2020: 7, 2026: 2 }), 2026, { minYears: 5 });

    expect(series.buckets.map((b) => [b.year, b.count])).toEqual([
      [2018, 5],
      [2019, 0],
      [2020, 7],
      [2021, 0],
      [2022, 0],
      [2023, 0],
      [2024, 0],
      [2025, 0],
      [2026, 2],
    ]);
    expect(series.dated).toBe(14);
  });

  it('marks only the current year as partial', () => {
    const { buckets } = buildYearSeries(counts({ 2025: 4, 2026: 1 }), 2026);

    expect(buckets.filter((b) => b.partial).map((b) => b.year)).toEqual([2026]);
  });

  it('pads a short history to the minimum number of years', () => {
    const { buckets } = buildYearSeries(counts({ 2024: 3 }), 2026, { minYears: 10 });

    expect(buckets.length).toBe(10);
    expect(buckets[0].year).toBe(2015);
    expect(buckets[9].year).toBe(2024);
  });

  it('sums a thin tail of old papers into one earlier bucket', () => {
    const years = counts({ 1950: 1, 1990: 1, 2010: 40, 2015: 30, 2020: 28 });

    const { buckets, dated } = buildYearSeries(years, 2026, { minYears: 5, coverage: 0.98 });

    expect(buckets[0]).toEqual({ kind: 'earlier', year: 2010, count: 2, partial: false });
    expect(buckets[1].year).toBe(2010);
    expect(buckets.at(-1)?.year).toBe(2020);
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(dated);
  });

  it('caps the number of individual years', () => {
    const years = counts(Object.fromEntries(Array.from({ length: 60 }, (_, i) => [1967 + i, 10])));

    const { buckets } = buildYearSeries(years, 2026, { maxYears: 30 });

    expect(buckets.length).toBe(31);
    expect(buckets[0]).toEqual({ kind: 'earlier', year: 1997, count: 300, partial: false });
    expect(buckets[1].year).toBe(1997);
  });

  it('leaves out years that cannot be right', () => {
    const series = buildYearSeries(counts({ 1000: 2, 2020: 5, 2027: 17, 9999: 1 }), 2026);

    expect(series.dated).toBe(5);
    expect(series.buckets.some((b) => b.year > 2026 || b.kind === 'earlier')).toBeFalse();
  });

  it('is empty when nothing is dated', () => {
    expect(buildYearSeries([], 2026)).toEqual({ buckets: [], dated: 0 });
    expect(buildYearSeries(counts({ 9999: 4 }), 2026)).toEqual({ buckets: [], dated: 0 });
  });
});
