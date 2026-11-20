import { SYNTHETIC_TOPICS, syntheticPapers } from '../../../../testing/galaxy.fixture';
import { GalaxyInput, GalaxyRequest, analyseGalaxy, handleGalaxyRequest } from './galaxy-analysis';

const input = (overrides: Partial<GalaxyInput> = {}): GalaxyInput => ({
  query: 'drone AND delivery',
  papers: syntheticPapers(),
  currentYear: 2026,
  width: 800,
  height: 450,
  ...overrides,
});

describe('analyseGalaxy', () => {
  it('finds the topics, largest first, and places a star for every paper', () => {
    const result = analyseGalaxy(input());

    expect(result.topics.length).toBe(SYNTHETIC_TOPICS.length);
    expect(result.topics.map((t) => t.size)).toEqual([10, 10, 10, 10]);
    expect(result.topicOf.length).toBe(40);
    expect(result.x.length).toBe(40);
    expect(result.radius.length).toBe(40);
    expect(result.topics.flatMap((t) => t.papers).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 40 }, (_, i) => i),
    );
  });

  it('names each topic after its own words, never the words of the query', () => {
    const result = analyseGalaxy(input());

    for (const topic of result.topics) {
      const own = SYNTHETIC_TOPICS.find((words: readonly string[]) =>
        topic.labelTerms.every((term) => words.includes(term)),
      );
      expect(own).withContext(topic.label).toBeDefined();
      expect(topic.label).not.toMatch(/drone|deliver/);
      expect(topic.terms.join(' ')).not.toMatch(/drone|deliver/);
    }
  });

  it('draws the same map for the same query, and another for another query', () => {
    const first = analyseGalaxy(input(), () => 0);
    const again = analyseGalaxy(input(), () => 0);
    const other = analyseGalaxy(input({ query: 'drone AND (delivery OR parcel)' }), () => 0);

    expect(again).toEqual(first);
    expect(other.x).not.toEqual(first.x);
  });

  it('works out each topic’s growth and the highlights', () => {
    const result = analyseGalaxy(input());
    // The synthetic topics are three years apart, so the last one, about hospitals, is the newest.
    const hospital: readonly string[] = SYNTHETIC_TOPICS[3];
    const newest = result.topics.findIndex((t) => hospital.includes(t.labelTerms[0]));

    expect(result.highlights.since).toBe(2023);
    expect(result.highlights.fastestGrowing).toBe(newest);
    expect(result.topics[newest].recentShare).toBe(1);
    expect(result.insight).toMatch(
      /^4 topics · fastest-growing: .+ \(100% of its papers since 2023\)/,
    );
  });

  it('measures how long each step takes', () => {
    let now = 0;
    const result = analyseGalaxy(input(), () => (now += 5));

    expect(result.timings).toEqual({
      terms: 5,
      vectors: 5,
      topics: 5,
      labels: 5,
      layout: 5,
      total: 25,
    });
  });

  it('copes with papers that have no abstract or no usable words', () => {
    const papers = syntheticPapers().map((paper, i) => ({
      ...paper,
      abstract: null,
      title: i === 0 ? 'Drone delivery' : paper.title,
    }));
    const result = analyseGalaxy(input({ papers }));

    expect(result.withAbstract).toBe(0);
    expect(result.withoutTerms).toBe(1);
    expect(result.topicOf[0]).toBe(0);
    expect(result.topics.length).toBeGreaterThanOrEqual(3);
  });

  it('runs well inside its time budget for 100 papers', () => {
    const papers = syntheticPapers(25);
    analyseGalaxy(input({ papers }));
    const started = performance.now();
    analyseGalaxy(input({ papers, query: 'drone AND delivery AND uav' }));

    expect(performance.now() - started).toBeLessThan(300);
  });
});

describe('handleGalaxyRequest', () => {
  it('answers a request with its id and the result', () => {
    const request: GalaxyRequest = { id: 7, ...input() };
    const response = handleGalaxyRequest(request);

    expect(response.id).toBe(7);
    expect(response.ok).toBeTrue();
    expect(response.ok && response.result.topics.length).toBe(4);
  });

  it('answers a request it cannot handle with the error, instead of failing the worker', () => {
    const request = { id: 8, ...input(), papers: null } as unknown as GalaxyRequest;
    const response = handleGalaxyRequest(request);

    expect(response).toEqual({ id: 8, ok: false, error: jasmine.any(String) });
  });
});
