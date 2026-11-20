import { syntheticPapers } from '../../../../testing/galaxy.fixture';
import { hashString, seededRandom, sphericalKMeans } from './kmeans';
import { extractTerms, queryTerms } from './text';
import { tfidfVectors } from './tfidf';

/** TF-IDF vectors of the synthetic papers: four topics of ten papers each. */
function syntheticVectors() {
  const { counts } = extractTerms(syntheticPapers(), queryTerms('drone AND delivery'));
  return tfidfVectors(counts);
}

/** Whether two clusterings put the same papers together, whatever the cluster numbers. */
function samePartition(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  const mapping = new Map<number, number>();
  for (let i = 0; i < a.length; i++) {
    if (mapping.has(a[i]) && mapping.get(a[i]) !== b[i]) {
      return false;
    }
    mapping.set(a[i], b[i]);
  }
  return new Set(mapping.values()).size === mapping.size;
}

describe('seededRandom', () => {
  it('repeats the same sequence for the same seed, in [0, 1)', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const first = Array.from({ length: 5 }, a);

    expect(Array.from({ length: 5 }, b)).toEqual(first);
    expect(first.every((value) => value >= 0 && value < 1)).toBeTrue();
    expect(Array.from({ length: 5 }, seededRandom(43))).not.toEqual(first);
  });

  it('turns a query into a stable seed', () => {
    expect(hashString('drone AND delivery')).toBe(hashString('drone AND delivery'));
    expect(hashString('drone AND delivery')).not.toBe(hashString('drone AND deliveries'));
  });
});

describe('sphericalKMeans', () => {
  it('gives the same clusters for the same seed', () => {
    const { vectors, vocabulary } = syntheticVectors();
    const run = (seed: number) =>
      sphericalKMeans(vectors, vocabulary.length, 4, seededRandom(seed)).assignments;

    expect(Array.from(run(1))).toEqual(Array.from(run(1)));
    expect(Array.from(run(2))).toEqual(Array.from(run(2)));
  });

  it('finds the four synthetic topics', () => {
    const { vectors, vocabulary } = syntheticVectors();
    const truth = Array.from({ length: 40 }, (_, i) => Math.floor(i / 10));
    const { assignments, centroids, k } = sphericalKMeans(
      vectors,
      vocabulary.length,
      4,
      seededRandom(9),
    );

    expect(k).toBe(4);
    expect(samePartition(assignments, truth)).toBeTrue();
    for (const centroid of centroids) {
      expect(Math.hypot(...centroid)).toBeCloseTo(1, 10);
    }
  });

  it('keeps every cluster in use and leaves papers without terms out', () => {
    const { vectors, vocabulary } = syntheticVectors();
    const empty = { indices: new Int32Array(0), values: new Float64Array(0) };
    const { assignments } = sphericalKMeans(
      [...vectors, empty],
      vocabulary.length,
      8,
      seededRandom(3),
    );

    expect(new Set(Array.from(assignments).filter((c) => c >= 0)).size).toBe(8);
    expect(assignments[40]).toBe(-1);
  });
});
