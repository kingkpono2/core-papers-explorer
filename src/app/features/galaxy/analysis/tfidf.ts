/** A unit-length vector stored as its non-zero entries, sorted by index. */
export interface SparseVector {
  indices: Int32Array;
  values: Float64Array;
}

export interface TermVectors {
  /** Kept terms, sorted, so the same papers always give the same indices. */
  vocabulary: string[];
  /** One TF-IDF vector per paper; empty when none of its terms was kept. */
  vectors: SparseVector[];
  /** Per paper: index of a kept term → its weighted count, for describing topics. */
  counts: Map<number, number>[];
}

/** A word has to appear in this many papers to help group them. */
export const MIN_TERM_PAPERS = 2;
/** A pair of words has to recur more often to count as a phrase rather than a coincidence. */
export const MIN_PHRASE_PAPERS = 3;

/**
 * TF-IDF vectors: sublinear term frequency (1 + ln tf), smoothed inverse document frequency
 * (ln((1 + n) / (1 + df)) + 1, as in scikit-learn), each vector scaled to unit length so that the
 * cosine similarity of two papers is the dot product of their vectors.
 */
export function tfidfVectors(documents: readonly Map<string, number>[]): TermVectors {
  const n = documents.length;
  const df = new Map<string, number>();
  for (const terms of documents) {
    for (const term of terms.keys()) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }
  const phraseMin = n < 30 ? MIN_TERM_PAPERS : MIN_PHRASE_PAPERS;
  const vocabulary = [...df.keys()]
    .filter((term) => df.get(term)! >= (term.includes(' ') ? phraseMin : MIN_TERM_PAPERS))
    .sort();
  const index = new Map(vocabulary.map((term, i) => [term, i]));
  const idf = vocabulary.map((term) => Math.log((1 + n) / (1 + df.get(term)!)) + 1);

  const counts: Map<number, number>[] = [];
  const vectors = documents.map((terms) => {
    const kept = new Map<number, number>();
    for (const [term, count] of terms) {
      const i = index.get(term);
      if (i !== undefined && count > 0) {
        kept.set(i, count);
      }
    }
    counts.push(kept);
    const indices = Int32Array.from([...kept.keys()].sort((a, b) => a - b));
    const values = Float64Array.from(indices, (i) => (1 + Math.log(kept.get(i)!)) * idf[i]);
    let norm = 0;
    for (const value of values) {
      norm += value * value;
    }
    norm = Math.sqrt(norm);
    return { indices, values: norm ? values.map((v) => v / norm) : values };
  });
  return { vocabulary, vectors, counts };
}

/** Cosine similarity of two unit vectors. */
export function cosine(a: SparseVector, b: SparseVector): number {
  let sum = 0;
  let i = 0;
  let j = 0;
  while (i < a.indices.length && j < b.indices.length) {
    const ai = a.indices[i];
    const bj = b.indices[j];
    if (ai === bj) {
      sum += a.values[i++] * b.values[j++];
    } else if (ai < bj) {
      i++;
    } else {
      j++;
    }
  }
  return sum;
}

/** Every pair's cosine similarity, row by row: entry `i * n + j`. */
export function similarityMatrix(vectors: readonly SparseVector[]): Float64Array {
  const n = vectors.length;
  const matrix = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    matrix[i * n + i] = vectors[i].indices.length ? 1 : 0;
    for (let j = i + 1; j < n; j++) {
      const s = cosine(vectors[i], vectors[j]);
      matrix[i * n + j] = s;
      matrix[j * n + i] = s;
    }
  }
  return matrix;
}

/** The dot product of a sparse vector with a dense one. */
export function dot(a: SparseVector, dense: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < a.indices.length; i++) {
    sum += a.values[i] * dense[a.indices[i]];
  }
  return sum;
}
