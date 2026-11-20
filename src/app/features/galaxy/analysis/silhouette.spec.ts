import { SYNTHETIC_TOPICS, syntheticPapers } from '../../../../testing/galaxy.fixture';
import { seededRandom } from './kmeans';
import { chooseTopics, meanSilhouette } from './silhouette';
import { extractTerms, queryTerms } from './text';
import { similarityMatrix, tfidfVectors } from './tfidf';

describe('meanSilhouette', () => {
  // Two tight pairs far apart: similarity 0.9 within a pair, 0.1 across.
  const n = 4;
  const similarity = new Float64Array(n * n).map((_, cell) => {
    const [i, j] = [Math.floor(cell / n), cell % n];
    return i === j ? 1 : Math.floor(i / 2) === Math.floor(j / 2) ? 0.9 : 0.1;
  });

  it('is high when papers sit with their own kind, and negative when they do not', () => {
    const good = meanSilhouette(similarity, [0, 0, 1, 1], 2);
    const bad = meanSilhouette(similarity, [0, 1, 0, 1], 2);

    // a = 0.1 and b = 0.9 for every paper: (0.9 − 0.1) / 0.9.
    expect(good).toBeCloseTo(0.8 / 0.9, 10);
    expect(bad).toBeLessThan(0);
  });

  it('scores a paper alone in its cluster as 0 and leaves unclustered papers out', () => {
    expect(meanSilhouette(similarity, [0, 0, 1, -1], 2)).toBeCloseTo((2 * (0.8 / 0.9)) / 3, 10);
  });
});

describe('chooseTopics', () => {
  function choose(perTopic: number) {
    const { counts } = extractTerms(syntheticPapers(perTopic), queryTerms('drone AND delivery'));
    const { vectors, vocabulary } = tfidfVectors(counts);
    return chooseTopics(vectors, vocabulary.length, similarityMatrix(vectors), seededRandom(5));
  }

  it('picks the number of topics the papers really have by silhouette', () => {
    const { clustering, scores } = choose(10);

    expect(clustering.k).toBe(SYNTHETIC_TOPICS.length);
    expect(scores.map((s) => s.k)).toEqual([3, 4, 5, 6, 7, 8]);
    const best = Math.max(...scores.map((s) => s.score));
    expect(scores.find((s) => s.k === 4)?.score).toBe(best);
  });

  it('tries at most one topic for every four papers', () => {
    const { scores } = choose(3);

    expect(scores.map((s) => s.k)).toEqual([3]);
  });
});
