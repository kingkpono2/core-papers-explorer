import { normaliseQuery } from '../../search/query/query-analyser';
import { layoutGalaxy, starRadius } from './galaxy-layout';
import { hashString, seededRandom } from './kmeans';
import { chooseTopics } from './silhouette';
import { extractTerms, queryTerms } from './text';
import { dot, similarityMatrix, tfidfVectors } from './tfidf';
import { distinctiveTerms, labelTerms, topicLabel } from './topic-labels';
import { TopicHighlights, insightText, topicHighlights, topicStats } from './topic-stats';

export interface GalaxyPaperInput {
  title: string;
  abstract: string | null;
  year: number | null;
}

export interface GalaxyInput {
  /** The query as written; its words never name a topic, and it seeds the map. */
  query: string;
  papers: GalaxyPaperInput[];
  currentYear: number;
  /** The box to lay the stars out in, in CSS pixels. */
  width: number;
  height: number;
}

export interface GalaxyTopic {
  /** Its two most distinctive terms, such as "parcel · last mile". */
  label: string;
  /** The terms in the label, to search for the topic. */
  labelTerms: string[];
  /** Up to five distinctive terms, most distinctive first. */
  terms: string[];
  /** Its papers (indices into the input), the most typical first. */
  papers: number[];
  size: number;
  dated: number;
  medianYear: number | null;
  recent: number;
  recentShare: number | null;
}

export interface GalaxyTimings {
  /** Milliseconds for each step and in total. */
  terms: number;
  vectors: number;
  topics: number;
  labels: number;
  layout: number;
  total: number;
}

export interface GalaxyResult {
  /** Largest first; a topic's index is also its colour and shape. */
  topics: GalaxyTopic[];
  /** Topic of each paper. */
  topicOf: number[];
  /** Position of each paper's star within `width` × `height`. */
  x: number[];
  y: number[];
  radius: number[];
  /** Constellation lines between papers of the same topic. */
  edges: [number, number][];
  /** Topics in their order around the galaxy. */
  ring: number[];
  highlights: TopicHighlights;
  /** "4 topics · fastest-growing: …". */
  insight: string;
  /** Mean silhouette for each number of topics tried. */
  silhouettes: { k: number; score: number }[];
  vocabularySize: number;
  withAbstract: number;
  /** Papers with no usable words; they join the largest topic. */
  withoutTerms: number;
  width: number;
  height: number;
  timings: GalaxyTimings;
}

/**
 * Finds the topics in a set of papers and lays them out as a galaxy: terms from titles (counted
 * twice) and abstracts, TF-IDF vectors, spherical k-means with 3 to 8 topics chosen by silhouette,
 * c-TF-IDF labels, and a seeded force layout. Pure and deterministic: the same input always gives
 * the same result. Runs in a web worker; `clock` is only there for timing.
 */
export function analyseGalaxy(
  input: GalaxyInput,
  clock: () => number = () => performance.now(),
): GalaxyResult {
  const { papers, currentYear, width, height } = input;
  const n = papers.length;
  const started = clock();

  const extracted = extractTerms(papers, queryTerms(input.query));
  const afterTerms = clock();

  const { vocabulary, vectors, counts } = tfidfVectors(extracted.counts);
  const similarity = similarityMatrix(vectors);
  const afterVectors = clock();

  const random = seededRandom(hashString(normaliseQuery(input.query)));
  const usable = vectors.filter((v) => v.indices.length).length;
  const choice = usable ? chooseTopics(vectors, vocabulary.length, similarity, random) : null;
  const k = choice?.clustering.k ?? 1;
  const centroids = choice?.clustering.centroids ?? [new Float64Array(vocabulary.length)];
  const clusterOf = choice
    ? Array.from(choice.clustering.assignments)
    : new Array<number>(n).fill(0);

  // Largest topic first, so the biggest topic always gets the first colour. Papers without usable
  // words join the largest topic, so every star has one.
  const sizes = new Array<number>(k).fill(0);
  for (const c of clusterOf) {
    if (c >= 0) {
      sizes[c]++;
    }
  }
  const order = sizes.map((_, c) => c).sort((a, b) => sizes[b] - sizes[a] || a - b);
  const rank = new Array<number>(k);
  order.forEach((c, position) => (rank[c] = position));
  const topicOf = clusterOf.map((c) => (c >= 0 ? rank[c] : 0));
  const sortedCentroids = order.map((c) => centroids[c]);
  const typicality = vectors.map((v, i) =>
    v.indices.length ? dot(v, sortedCentroids[topicOf[i]]) : -1,
  );
  const afterTopics = clock();

  const termLists = distinctiveTerms(counts, topicOf, k, vocabulary).map((list) =>
    list.map((term) => extracted.forms.get(vocabulary[term]) ?? vocabulary[term]),
  );
  const named = labelTerms(termLists);
  const labels = named.map(topicLabel);
  const years = papers.map((paper) => paper.year);
  const stats = topicStats(years, topicOf, k, currentYear);
  const highlights = topicHighlights(stats, currentYear);
  const topics: GalaxyTopic[] = stats.map((s, topic) => ({
    label: labels[topic],
    labelTerms: named[topic],
    terms: termLists[topic],
    papers: topicOf
      .flatMap((t, i) => (t === topic ? [i] : []))
      .sort((a, b) => typicality[b] - typicality[a] || a - b),
    ...s,
  }));
  const afterLabels = clock();

  const dated = years.filter((year): year is number => year !== null);
  const first = Math.min(...dated);
  const last = Math.max(...dated);
  const radius = years.map((year) => starRadius(year, first, last));
  const topicSimilarity = new Float64Array(k * k);
  for (let a = 0; a < k; a++) {
    for (let b = 0; b < k; b++) {
      let s = 0;
      sortedCentroids[a].forEach((value, i) => (s += value * sortedCentroids[b][i]));
      topicSimilarity[a * k + b] = s;
    }
  }
  const layout = layoutGalaxy({
    similarity,
    topicOf,
    k,
    topicSimilarity,
    radii: radius,
    width,
    height,
    random,
  });
  const finished = clock();

  return {
    topics,
    topicOf,
    x: layout.x,
    y: layout.y,
    radius: radius.map((r) => Math.round(r * 100) / 100),
    edges: layout.edges,
    ring: layout.ring,
    highlights,
    insight: insightText(labels, stats, highlights),
    silhouettes: (choice?.scores ?? []).map(({ k: topicsTried, score }) => ({
      k: topicsTried,
      score: Math.round(score * 1000) / 1000,
    })),
    vocabularySize: vocabulary.length,
    withAbstract: papers.filter((paper) => !!paper.abstract?.trim()).length,
    withoutTerms: n - usable,
    width,
    height,
    timings: {
      terms: afterTerms - started,
      vectors: afterVectors - afterTerms,
      topics: afterTopics - afterVectors,
      labels: afterLabels - afterTopics,
      layout: finished - afterLabels,
      total: finished - started,
    },
  };
}

/** A message to the galaxy worker. */
export interface GalaxyRequest extends GalaxyInput {
  id: number;
}

/** The worker's answer, matched to its request by `id`. */
export type GalaxyResponse =
  { id: number; ok: true; result: GalaxyResult } | { id: number; ok: false; error: string };

/** What the worker does with each message; kept here so it can be tested without a worker. */
export function handleGalaxyRequest({ id, ...input }: GalaxyRequest): GalaxyResponse {
  try {
    return { id, ok: true, result: analyseGalaxy(input) };
  } catch (error) {
    return { id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
