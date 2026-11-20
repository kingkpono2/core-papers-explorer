import { YearCounts } from '../../core/models/paper';
import { alignTrends, change, compareGrowth, trendInsight } from './trend-insights';

const counts = (entries: Record<number, number>, truncated = false): YearCounts => ({
  counts: Object.entries(entries).map(([year, count]) => ({ year: Number(year), count })),
  truncated,
});
const format = (value: number) => value.toLocaleString('en-US');
const YEARS_2012_2026 = Array.from({ length: 15 }, (_, i) => 2012 + i);

describe('alignTrends', () => {
  it('puts every series on the last 15 years up to the latest one, with zeros for gaps', () => {
    const aligned = alignTrends(
      [counts({ 2000: 5, 2011: 7, 2012: 1, 2026: 9 }), counts({ 2020: 3 })],
      2026,
    );

    expect(aligned.years).toEqual(YEARS_2012_2026);
    expect(aligned.partialYear).toBe(2026);
    expect(aligned.series[0].values).toEqual([1, ...Array(13).fill(0), 9]);
    expect(aligned.series[0].earlier).toBe(12);
    expect(aligned.series[0].dated).toBe(22);
    expect(aligned.series[1].values[8]).toBe(3);
    expect(aligned.series[1].earlier).toBe(0);
  });

  it('ends with the latest year of any series, which may be a full one', () => {
    const aligned = alignTrends([counts({ 2019: 1 }), counts({ 2021: 2 })], 2026, 5);

    expect(aligned.years).toEqual([2017, 2018, 2019, 2020, 2021]);
    expect(aligned.partialYear).toBeNull();
  });

  it('leaves out impossible years', () => {
    const aligned = alignTrends([counts({ 1000: 50, 2020: 1, 2096: 9, 9999: 4 })], 2026, 3);

    expect(aligned.years).toEqual([2018, 2019, 2020]);
    expect(aligned.series[0].dated).toBe(1);
    expect(aligned.series[0].earlier).toBe(0);
  });

  it('has no years when no series has a dated paper', () => {
    const aligned = alignTrends([counts({}, true), counts({ 9999: 1 })], 2026);

    expect(aligned.years).toEqual([]);
    expect(aligned.series.map((s) => s.values)).toEqual([[], []]);
    expect(aligned.series[0].truncated).toBeTrue();
  });

  it('keeps the truncation flag per series', () => {
    const aligned = alignTrends([counts({ 2020: 1 }, true), counts({ 2020: 1 })], 2026);

    expect(aligned.series.map((s) => s.truncated)).toEqual([true, false]);
  });
});

describe('trendInsight', () => {
  const insight = (label: string, entries: Record<number, number>, truncated = false) =>
    trendInsight(label, counts(entries, truncated), YEARS_2012_2026, 2026, format);

  it('gives the size, the peak and the growth to the last full year', () => {
    const result = insight('drone delivery', {
      2010: 29,
      2012: 50,
      2020: 300,
      2025: 410,
      2026: 900,
    });

    expect(result.sentence).toBe(
      'drone delivery: 1,689 dated papers, peaking in 2025; output grew 8.2× from 2012 to 2025.',
    );
    expect(result.peakYear).toBe(2025);
    expect(result.growth).toEqual({
      from: { year: 2012, count: 50 },
      to: { year: 2025, count: 410 },
      ratio: 8.2,
    });
  });

  it('never counts the current, partial year as the peak', () => {
    expect(insight('a', { 2012: 10, 2024: 20, 2026: 99 }).peakYear).toBe(2024);
  });

  it('finds the peak before the years shown', () => {
    const result = insight('b', { 1995: 500, 2012: 100, 2025: 60 });

    expect(result.sentence).toBe(
      'b: 660 dated papers, peaking in 1995; output fell 40% from 2012 to 2025.',
    );
  });

  it('rounds large multipliers and says when output held steady', () => {
    expect(insight('c', { 2012: 10, 2025: 2_345 }).sentence).toContain('output grew 235× from');
    expect(insight('d', { 2012: 100, 2025: 103 }).sentence).toContain(
      'output held steady from 2012 to 2025',
    );
  });

  it('gives counts rather than a multiplier when it starts from zero or a few papers', () => {
    const fromZero = insight('e', { 2018: 4, 2025: 40 });
    expect(fromZero.sentence).toBe(
      'e: 44 dated papers, peaking in 2025; output went from 0 in 2012 to 40 in 2025.',
    );
    expect(fromZero.growth?.ratio).toBeNull();
    expect(fromZero.sentence).not.toContain('∞');

    expect(insight('f', { 2012: 3, 2025: 12 }).sentence).toContain(
      'output went from 3 in 2012 to 12 in 2025',
    );
    expect(insight('g', { 2018: 2 }).sentence).toContain('no papers in 2012 or 2025');
  });

  it('says "at least" when CORE left out sparse years, and handles one paper', () => {
    expect(insight('h', { 2020: 1 }, true).sentence).toMatch(/^h: at least 1 dated paper,/);
  });

  it('leaves out the peak and growth when there is nothing to base them on', () => {
    const result = trendInsight('i', counts({ 2026: 5 }), [2026], 2026, format);

    expect(result.sentence).toBe('i: 5 dated papers.');
    expect(result.peakYear).toBeNull();
    expect(result.growth).toBeNull();
  });

  it('ends growth at the last year shown when it is already full', () => {
    const result = trendInsight(
      'j',
      counts({ 2015: 20, 2019: 40 }),
      [2015, 2016, 2017, 2018, 2019],
      2026,
      format,
    );

    expect(result.sentence).toContain('output grew 2.0× from 2015 to 2019');
  });
});

describe('compareGrowth', () => {
  const YEARS = [2024, 2025, 2026];
  /** Grows by `ratio` from 2024 to 2025, the last full year; 2026 is the year so far. */
  const growing = (label: string, ratio: number) => ({
    label,
    values: [100, Math.round(100 * ratio * 1000) / 1000, 1],
  });
  const compare = (...series: ReturnType<typeof growing>[]) => compareGrowth(series, YEARS, 2026);

  it('says which of two grew faster, ignoring the year so far', () => {
    expect(compare(growing('autonomous vehicles', 3.14), growing('drone delivery', 8.2))).toBe(
      'drone delivery grew faster than autonomous vehicles (8.2× vs 3.1×).',
    );
  });

  it('contrasts growth with decline, and two declines', () => {
    expect(compare(growing('a', 2), growing('b', 0.6))).toBe(
      'a grew (2.0×) while b shrank (down 40%).',
    );
    expect(compare(growing('a', 0.8), growing('b', 0.5))).toBe(
      'b shrank faster than a (down 50% vs down 20%).',
    );
  });

  it('calls close rates about the same', () => {
    expect(compare(growing('a', 3.0), growing('b', 3.1))).toBe(
      'b and a changed at about the same rate (3.1× and 3.0×).',
    );
  });

  it('ranks three', () => {
    expect(compare(growing('a', 1.2), growing('b', 8.2), growing('c', 3.1))).toBe(
      'b grew fastest (8.2×), ahead of c (3.1×) and a (1.2×).',
    );
    expect(compare(growing('a', 0.5), growing('b', 0.9), growing('c', 0.7))).toBe(
      'b held up best (down 10%), ahead of c (down 30%) and a (down 50%).',
    );
  });

  it('starts from the first year in which every series has enough papers', () => {
    const years = [2012, 2013, 2014, 2015];
    const series = [
      { label: 'a', values: [1, 5, 10, 120] },
      { label: 'b', values: [50, 60, 20, 40] },
    ];

    expect(compareGrowth(series, years, 2026)).toBe(
      'Measured from 2014, when each had at least 10 papers, a grew faster than b (12× vs 2.0×).',
    );
  });

  it('gives no comparison without a common base, a full year after it, or a second series', () => {
    expect(
      compareGrowth(
        [
          { label: 'a', values: [0, 3, 9] },
          { label: 'b', values: [50, 60, 70] },
        ],
        [2023, 2024, 2025],
        2026,
      ),
    ).toBeNull();
    expect(compareGrowth([growing('a', 2), growing('b', 3)], [2025, 2026, 2027], 2026)).toBeNull();
    expect(compare(growing('a', 2))).toBeNull();
  });
});

describe('change', () => {
  it('formats multipliers, declines and no change', () => {
    expect(change(8.24)).toBe('8.2×');
    expect(change(12.6)).toBe('13×');
    expect(change(1_234.4)).toBe('1,234×');
    expect(change(0.25)).toBe('down 75%');
    expect(change(1.02)).toBe('no change');
  });
});
