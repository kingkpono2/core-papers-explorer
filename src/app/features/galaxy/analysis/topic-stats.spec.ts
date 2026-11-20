import { TopicStats, insightText, percent, topicHighlights, topicStats } from './topic-stats';

const YEAR = 2026;

const stats = (overrides: Partial<TopicStats>[]): TopicStats[] =>
  overrides.map((o) => ({
    size: 10,
    dated: 10,
    medianYear: 2020,
    recent: 3,
    recentShare: 0.3,
    ...o,
  }));

describe('topicStats', () => {
  it('counts papers, dated papers, the median year and the share since three years ago', () => {
    const years = [2016, 2018, 2023, 2025, null, 2020, 2024];
    const topics = [0, 0, 0, 0, 0, 1, 1];

    expect(topicStats(years, topics, 2, YEAR)).toEqual([
      { size: 5, dated: 4, medianYear: 2018, recent: 2, recentShare: 0.5 },
      { size: 2, dated: 2, medianYear: 2020, recent: 1, recentShare: 0.5 },
    ]);
  });

  it('takes the lower middle year as the median, so it is always a real year', () => {
    const [topic] = topicStats([2019, 2020, 2021, 2022], [0, 0, 0, 0], 1, YEAR);

    expect(topic.medianYear).toBe(2020);
  });

  it('has no median or share for a topic without dates', () => {
    const [topic] = topicStats([null, null], [0, 0], 1, YEAR);

    expect(topic).toEqual({ size: 2, dated: 0, medianYear: null, recent: 0, recentShare: null });
  });
});

describe('topicHighlights', () => {
  it('finds the fastest-growing and the most established topic', () => {
    const highlights = topicHighlights(
      stats([
        { recentShare: 0.4, medianYear: 2021 },
        { recentShare: 0.62, medianYear: 2023 },
        { recentShare: 0.1, medianYear: 2016 },
      ]),
      YEAR,
    );

    expect(highlights).toEqual({ since: 2023, fastestGrowing: 1, mostEstablished: 2 });
  });

  it('breaks ties by more recent papers, then by the bigger topic', () => {
    const highlights = topicHighlights(
      stats([
        { recentShare: 0.5, recent: 2, dated: 4, size: 4 },
        { recentShare: 0.5, recent: 5, dated: 10, size: 12 },
      ]),
      YEAR,
    );

    expect(highlights.fastestGrowing).toBe(1);
  });

  it('ignores topics with fewer than three dated papers', () => {
    const highlights = topicHighlights(
      stats([
        { recentShare: 1, dated: 2, recent: 2, medianYear: 2025 },
        { recentShare: 0.3, medianYear: 2019 },
        { recentShare: 0, recent: 0, medianYear: 2012, dated: 1 },
        { recentShare: 0.2, medianYear: 2017 },
      ]),
      YEAR,
    );

    expect(highlights.fastestGrowing).toBe(1);
    expect(highlights.mostEstablished).toBe(3);
  });

  it('never names one topic both, and calls nothing growing without recent papers', () => {
    expect(topicHighlights(stats([{}]), YEAR)).toEqual({
      since: 2023,
      fastestGrowing: 0,
      mostEstablished: null,
    });
    expect(
      topicHighlights(
        stats([
          { recent: 0, recentShare: 0 },
          { recent: 0, recentShare: 0 },
        ]),
        YEAR,
      ).fastestGrowing,
    ).toBeNull();
  });
});

describe('insightText', () => {
  it('sums up the map in one line', () => {
    const topicStatsList = stats([
      { recentShare: 0.618, medianYear: 2022 },
      { recentShare: 0.2, medianYear: 2016 },
      {},
      {},
    ]);

    expect(
      insightText(
        ['parcel · last mile', 'regulation · airspace', 'battery', 'trust'],
        topicStatsList,
        topicHighlights(topicStatsList, YEAR),
      ),
    ).toBe(
      '4 topics · fastest-growing: parcel · last mile (62% of its papers since 2023) · most established: regulation · airspace (median year 2016)',
    );
  });

  it('says only what it knows', () => {
    const single = stats([{ recent: 0, recentShare: 0 }]);

    expect(insightText(['trust'], single, topicHighlights(single, YEAR))).toBe('1 topic');
  });

  it('rounds shares to whole percentages', () => {
    expect(percent(0.618)).toBe(62);
    expect(percent(1 / 3)).toBe(33);
  });
});
