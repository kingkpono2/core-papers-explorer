import { SparseVector, cosine, similarityMatrix, tfidfVectors } from './tfidf';

const terms = (entries: Record<string, number>) => new Map(Object.entries(entries));
const norm = ({ values }: SparseVector) => Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
const weightOf = (result: ReturnType<typeof tfidfVectors>, paper: number, term: string) => {
  const index = result.vocabulary.indexOf(term);
  const position = result.vectors[paper].indices.indexOf(index);
  return position < 0 ? 0 : result.vectors[paper].values[position];
};

describe('tfidfVectors', () => {
  const documents = [
    terms({ drone: 1, battery: 3, swap: 1 }),
    terms({ drone: 1, battery: 1 }),
    terms({ drone: 2, survey: 1 }),
    terms({ survey: 1, trust: 1, swap: 1 }),
  ];

  it('keeps terms found in at least two papers, in a stable order', () => {
    expect(tfidfVectors(documents).vocabulary).toEqual(['battery', 'drone', 'survey', 'swap']);
  });

  it('keeps a pair of words only when it recurs in three papers', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      terms(
        i < 3
          ? { 'last mile': 1, parcel: 1 }
          : i < 5
            ? { 'drone swarm': 1, parcel: 1 }
            : { parcel: 1 },
      ),
    );
    const { vocabulary } = tfidfVectors(many);

    expect(vocabulary).toContain('last mile');
    expect(vocabulary).not.toContain('drone swarm');
  });

  it('uses sublinear term frequency and smoothed inverse document frequency', () => {
    const result = tfidfVectors(documents);
    const idf = (df: number) => Math.log((1 + 4) / (1 + df)) + 1;
    const raw = [(1 + Math.log(3)) * idf(2), 1 * idf(3), 1 * idf(2)]; // battery, drone, swap
    const length = Math.hypot(...raw);

    expect(weightOf(result, 0, 'battery')).toBeCloseTo(raw[0] / length, 10);
    expect(weightOf(result, 0, 'drone')).toBeCloseTo(raw[1] / length, 10);
    expect(weightOf(result, 0, 'swap')).toBeCloseTo(raw[2] / length, 10);
  });

  it('scales every vector to unit length, and leaves a paper without kept terms empty', () => {
    const result = tfidfVectors([...documents, terms({ unique: 4 })]);

    for (const vector of result.vectors.slice(0, 4)) {
      expect(norm(vector)).toBeCloseTo(1, 10);
    }
    expect(result.vectors[4].indices.length).toBe(0);
  });

  it('keeps the weighted counts of kept terms for naming topics', () => {
    const result = tfidfVectors(documents);

    expect(result.counts[0].get(result.vocabulary.indexOf('battery'))).toBe(3);
    expect(result.counts[3].has(result.vocabulary.indexOf('swap'))).toBeTrue();
  });
});

describe('cosine', () => {
  const vector = (pairs: [number, number][]): SparseVector => ({
    indices: Int32Array.from(pairs.map(([i]) => i)),
    values: Float64Array.from(pairs.map(([, v]) => v)),
  });

  it('is 1 for the same direction, 0 with nothing in common, and in between otherwise', () => {
    const a = vector([
      [0, 0.6],
      [2, 0.8],
    ]);
    const b = vector([
      [1, 0.6],
      [3, 0.8],
    ]);
    const c = vector([[2, 1]]);

    expect(cosine(a, a)).toBeCloseTo(1, 12);
    expect(cosine(a, b)).toBe(0);
    expect(cosine(a, c)).toBeCloseTo(0.8, 12);
  });

  it('fills a symmetric similarity matrix with ones on the diagonal', () => {
    const { vectors } = tfidfVectors([
      terms({ drone: 1, battery: 1 }),
      terms({ drone: 1, battery: 2 }),
      terms({ drone: 1, survey: 1 }),
      terms({ survey: 2 }),
    ]);
    const matrix = similarityMatrix(vectors);

    expect(matrix[0]).toBeCloseTo(1, 12);
    expect(matrix[1 * 4 + 0]).toBe(matrix[0 * 4 + 1]);
    expect(matrix[0 * 4 + 1]).toBeGreaterThan(matrix[0 * 4 + 2]);
    expect(matrix[0 * 4 + 3]).toBe(0);
  });
});
