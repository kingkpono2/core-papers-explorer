import { Clustering, sphericalKMeans } from './kmeans';
import { SparseVector } from './tfidf';

export const MIN_TOPICS = 3;
export const MAX_TOPICS = 8;
/** A topic needs a few papers to be worth naming. */
export const MIN_TOPIC_SIZE = 3;
/** Papers per topic, at least, when there are few papers. */
const PAPERS_PER_TOPIC = 4;
/**
 * Silhouettes of short texts are small (0.01 to 0.05), and differences below this are noise, so
 * they count as ties, which go to fewer topics: fewer topics are easier to read.
 */
export const SILHOUETTE_TOLERANCE = 0.003;

export interface TopicChoice {
  clustering: Clustering;
  /** Mean silhouette for each k tried. */
  scores: { k: number; score: number }[];
}

/**
 * The mean silhouette of a clustering, with cosine distance (1 − similarity): for each paper, how
 * much closer it is to its own cluster than to the next nearest one, from −1 to 1. Papers alone in
 * their cluster score 0, and papers without a cluster are left out.
 */
export function meanSilhouette(
  similarity: Float64Array,
  assignments: ArrayLike<number>,
  k: number,
): number {
  const n = assignments.length;
  const sizes = new Int32Array(k);
  for (let i = 0; i < n; i++) {
    if (assignments[i] >= 0) {
      sizes[assignments[i]]++;
    }
  }
  let total = 0;
  let counted = 0;
  const sums = new Float64Array(k);
  for (let i = 0; i < n; i++) {
    const own = assignments[i];
    if (own < 0) {
      continue;
    }
    counted++;
    if (sizes[own] < 2) {
      continue;
    }
    sums.fill(0);
    for (let j = 0; j < n; j++) {
      if (j !== i && assignments[j] >= 0) {
        sums[assignments[j]] += 1 - similarity[i * n + j];
      }
    }
    const a = sums[own] / (sizes[own] - 1);
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c !== own && sizes[c] > 0) {
        b = Math.min(b, sums[c] / sizes[c]);
      }
    }
    const scale = Math.max(a, b);
    total += Number.isFinite(b) && scale > 0 ? (b - a) / scale : 0;
  }
  return counted ? total / counted : 0;
}

/**
 * Clusters the papers into 3 to 8 topics, keeping the number with the best mean silhouette, where
 * scores within `SILHOUETTE_TOLERANCE` of the best count as ties and go to fewer topics. A
 * clustering with a topic of fewer than three papers is only kept if every other one has one too.
 */
export function chooseTopics(
  vectors: readonly SparseVector[],
  dimensions: number,
  similarity: Float64Array,
  random: () => number,
): TopicChoice {
  const usable = vectors.filter((v) => v.indices.length).length;
  const largest = Math.min(MAX_TOPICS, Math.floor(usable / PAPERS_PER_TOPIC));
  const smallest = Math.min(MIN_TOPICS, Math.max(1, largest));
  const candidates: { clustering: Clustering; score: number; viable: boolean }[] = [];
  for (let k = smallest; k <= Math.max(smallest, largest); k++) {
    const clustering = sphericalKMeans(vectors, dimensions, k, random);
    const score = k > 1 ? meanSilhouette(similarity, clustering.assignments, k) : 0;
    candidates.push({ clustering, score, viable: smallestCluster(clustering) >= MIN_TOPIC_SIZE });
  }
  const pool = candidates.some((c) => c.viable) ? candidates.filter((c) => c.viable) : candidates;
  const top = Math.max(...pool.map((c) => c.score));
  const chosen = pool.find((c) => c.score >= top - SILHOUETTE_TOLERANCE)!;
  return {
    clustering: chosen.clustering,
    scores: candidates.map(({ clustering, score }) => ({ k: clustering.k, score })),
  };
}

function smallestCluster({ assignments, k }: Clustering): number {
  const sizes = new Int32Array(k);
  for (const c of assignments) {
    if (c >= 0) {
      sizes[c]++;
    }
  }
  return Math.min(...sizes);
}
