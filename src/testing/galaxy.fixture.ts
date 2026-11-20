import { seededRandom } from '../app/features/galaxy/analysis/kmeans';

export interface SyntheticPaper {
  title: string;
  abstract: string | null;
  year: number | null;
}

/** Four topics with words of their own; every paper also mentions the query, drone delivery. */
export const SYNTHETIC_TOPICS = [
  ['battery', 'charging', 'station', 'energy', 'solar', 'power', 'swap'],
  ['consumer', 'acceptance', 'survey', 'attitude', 'trust', 'willingness', 'perception'],
  ['truck', 'routing', 'heuristic', 'depot', 'scheduling', 'tabu', 'makespan'],
  ['hospital', 'blood', 'medical', 'emergency', 'vaccine', 'clinic', 'ambulance'],
] as const;

/**
 * `perTopic` papers for each synthetic topic, built from its own words and the query's, with
 * years spread from 2014 to 2026 (later topics newer). The same seed gives the same papers.
 */
export function syntheticPapers(perTopic = 10, seed = 7): SyntheticPaper[] {
  const random = seededRandom(seed);
  const pick = (words: readonly string[], count: number) =>
    Array.from({ length: count }, () => words[Math.floor(random() * words.length)]);
  const papers: SyntheticPaper[] = [];
  SYNTHETIC_TOPICS.forEach((words, topic) => {
    for (let i = 0; i < perTopic; i++) {
      papers.push({
        // "case" is a stop word and numbers are dropped, so this only keeps titles unique.
        title: `Drone delivery ${pick(words, 3).join(' ')}, case ${topic * perTopic + i + 1}`,
        abstract: `This study of drone deliveries examines ${pick(words, 8).join(', ')} for delivery drones.`,
        year: 2014 + topic * 3 + (i % 4),
      });
    }
  });
  return papers;
}
