import { SparseVector, dot } from './tfidf';

export interface Clustering {
  k: number;
  /** Cluster of each vector; -1 for an empty vector, which belongs nowhere. */
  assignments: Int32Array;
  /** Unit-length centroids, one per cluster. */
  centroids: Float64Array[];
  /** Sum of each vector's similarity to its centroid: higher is tighter. */
  cohesion: number;
}

/** A fast seeded random number generator (Mulberry32), so the same seed gives the same map. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a: a stable 32-bit number for a string, used as the seed for a query. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const MAX_ITERATIONS = 50;

/**
 * Spherical k-means: k-means on unit vectors with cosine similarity, which suits TF-IDF. Seeded
 * with k-means++ (each new seed picked with probability proportional to its squared cosine
 * distance from the seeds so far) using `random`, so the result depends only on the input and the
 * seed. Runs `restarts` times and keeps the tightest clustering.
 */
export function sphericalKMeans(
  vectors: readonly SparseVector[],
  dimensions: number,
  k: number,
  random: () => number,
  restarts = 4,
): Clustering {
  let best: Clustering | null = null;
  for (let run = 0; run < restarts; run++) {
    const clustering = cluster(vectors, dimensions, k, random);
    if (!best || clustering.cohesion > best.cohesion + 1e-12) {
      best = clustering;
    }
  }
  return best!;
}

function cluster(
  vectors: readonly SparseVector[],
  dimensions: number,
  k: number,
  random: () => number,
): Clustering {
  const usable = vectors.flatMap((v, i) => (v.indices.length ? [i] : []));
  const assignments = new Int32Array(vectors.length).fill(-1);
  let centroids = plusPlusSeeds(vectors, usable, dimensions, k, random);

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let changed = false;
    for (const i of usable) {
      const nearest = nearestCentroid(vectors[i], centroids);
      if (nearest !== assignments[i]) {
        assignments[i] = nearest;
        changed = true;
      }
    }
    refillEmptyClusters(vectors, usable, assignments, centroids);
    centroids = centroidsOf(vectors, usable, assignments, dimensions, k);
    if (!changed) {
      break;
    }
  }
  let cohesion = 0;
  for (const i of usable) {
    cohesion += dot(vectors[i], centroids[assignments[i]]);
  }
  return { k, assignments, centroids, cohesion };
}

function plusPlusSeeds(
  vectors: readonly SparseVector[],
  usable: readonly number[],
  dimensions: number,
  k: number,
  random: () => number,
): Float64Array[] {
  const seeds = [usable[Math.floor(random() * usable.length)]];
  const closest = new Float64Array(vectors.length).fill(-Infinity);
  while (seeds.length < Math.min(k, usable.length)) {
    const latest = toDense(vectors[seeds.at(-1)!], dimensions);
    let total = 0;
    const weights = usable.map((i) => {
      closest[i] = Math.max(closest[i], dot(vectors[i], latest));
      const distance = Math.max(0, 1 - closest[i]);
      total += distance * distance;
      return distance * distance;
    });
    let pick = usable.find((i) => !seeds.includes(i))!;
    if (total > 0) {
      let target = random() * total;
      for (const [position, weight] of weights.entries()) {
        target -= weight;
        if (target <= 0 && weight > 0) {
          pick = usable[position];
          break;
        }
      }
    }
    seeds.push(pick);
  }
  return seeds.map((i) => toDense(vectors[i], dimensions));
}

function nearestCentroid(vector: SparseVector, centroids: readonly Float64Array[]): number {
  let best = 0;
  let bestSimilarity = -Infinity;
  centroids.forEach((centroid, c) => {
    const similarity = dot(vector, centroid);
    if (similarity > bestSimilarity) {
      best = c;
      bestSimilarity = similarity;
    }
  });
  return best;
}

/**
 * A cluster that lost all its members takes the vector least like its own centroid, from a cluster
 * that can spare it, so there are always k clusters.
 */
function refillEmptyClusters(
  vectors: readonly SparseVector[],
  usable: readonly number[],
  assignments: Int32Array,
  centroids: readonly Float64Array[],
): void {
  const sizes = new Int32Array(centroids.length);
  for (const i of usable) {
    sizes[assignments[i]]++;
  }
  for (let c = 0; c < centroids.length; c++) {
    if (sizes[c] > 0) {
      continue;
    }
    let worst = -1;
    let worstSimilarity = Infinity;
    for (const i of usable) {
      const similarity = dot(vectors[i], centroids[assignments[i]]);
      if (sizes[assignments[i]] > 1 && similarity < worstSimilarity) {
        worst = i;
        worstSimilarity = similarity;
      }
    }
    if (worst >= 0) {
      sizes[assignments[worst]]--;
      assignments[worst] = c;
      sizes[c] = 1;
    }
  }
}

function centroidsOf(
  vectors: readonly SparseVector[],
  usable: readonly number[],
  assignments: Int32Array,
  dimensions: number,
  k: number,
): Float64Array[] {
  const centroids = Array.from({ length: k }, () => new Float64Array(dimensions));
  for (const i of usable) {
    const centroid = centroids[assignments[i]];
    const { indices, values } = vectors[i];
    for (let j = 0; j < indices.length; j++) {
      centroid[indices[j]] += values[j];
    }
  }
  for (const centroid of centroids) {
    normalise(centroid);
  }
  return centroids;
}

export function toDense(vector: SparseVector, dimensions: number): Float64Array {
  const dense = new Float64Array(dimensions);
  vector.indices.forEach((index, j) => (dense[index] = vector.values[j]));
  return dense;
}

function normalise(vector: Float64Array): void {
  let norm = 0;
  for (const value of vector) {
    norm += value * value;
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= norm;
    }
  }
}
