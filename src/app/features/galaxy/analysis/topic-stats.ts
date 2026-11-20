/** "Recent" means published in the last three years or this year: since 2023 in 2026. */
export const RECENT_YEARS = 3;
/** Fewer dated papers than this make a topic's growth too noisy to single out. */
export const MIN_DATED_FOR_HIGHLIGHT = 3;

export interface TopicStats {
  size: number;
  /** Papers with a publication year. */
  dated: number;
  /** The lower median publication year, so it is always a real year; null with no dates. */
  medianYear: number | null;
  /** Papers published since `currentYear − RECENT_YEARS`. */
  recent: number;
  /** `recent` as a share of the dated papers, from 0 to 1; null with no dates. */
  recentShare: number | null;
}

export interface TopicHighlights {
  /** First year counted as recent. */
  since: number;
  /** The topic with the largest share of recent papers. */
  fastestGrowing: number | null;
  /** The topic with the earliest median year. */
  mostEstablished: number | null;
}

export function topicStats(
  years: readonly (number | null)[],
  assignments: ArrayLike<number>,
  k: number,
  currentYear: number,
): TopicStats[] {
  const since = currentYear - RECENT_YEARS;
  const byTopic = Array.from({ length: k }, () => ({ size: 0, years: [] as number[] }));
  years.forEach((year, paper) => {
    const topic = byTopic[assignments[paper]];
    if (!topic) {
      return;
    }
    topic.size++;
    if (year !== null) {
      topic.years.push(year);
    }
  });
  return byTopic.map(({ size, years: dated }) => {
    dated.sort((a, b) => a - b);
    const recent = dated.filter((year) => year >= since).length;
    return {
      size,
      dated: dated.length,
      medianYear: dated.length ? dated[Math.floor((dated.length - 1) / 2)] : null,
      recent,
      recentShare: dated.length ? recent / dated.length : null,
    };
  });
}

/**
 * The fastest-growing topic has the largest share of recent papers (ties: more recent papers,
 * then the larger topic); the most established has the earliest median year (ties: the smaller
 * recent share). Only topics with at least three dated papers qualify, a topic is never both, and
 * a topic with no recent papers is not growing.
 */
export function topicHighlights(
  stats: readonly TopicStats[],
  currentYear: number,
): TopicHighlights {
  const qualified = stats.flatMap((s, topic) =>
    s.dated >= MIN_DATED_FOR_HIGHLIGHT ? [{ ...s, topic }] : [],
  );
  const growing = [...qualified]
    .filter((s) => s.recent > 0)
    .sort(
      (a, b) =>
        b.recentShare! - a.recentShare! ||
        b.recent - a.recent ||
        b.size - a.size ||
        a.topic - b.topic,
    )[0];
  const established = qualified
    .filter((s) => s.topic !== growing?.topic)
    .sort(
      (a, b) =>
        a.medianYear! - b.medianYear! ||
        a.recentShare! - b.recentShare! ||
        b.size - a.size ||
        a.topic - b.topic,
    )[0];
  return {
    since: currentYear - RECENT_YEARS,
    fastestGrowing: growing?.topic ?? null,
    mostEstablished: qualified.length > 1 ? (established?.topic ?? null) : null,
  };
}

/** A whole percentage, such as 62 for 0.618. */
export function percent(share: number): number {
  return Math.round(share * 100);
}

/**
 * The one-line summary shown once the map is complete, such as
 * "4 topics · fastest-growing: parcel · last mile (62% of its papers since 2023)".
 */
export function insightText(
  labels: readonly string[],
  stats: readonly TopicStats[],
  highlights: TopicHighlights,
): string {
  const parts = [`${labels.length} ${labels.length === 1 ? 'topic' : 'topics'}`];
  const growing = highlights.fastestGrowing;
  if (growing !== null && stats[growing].recentShare !== null) {
    parts.push(
      `fastest-growing: ${labels[growing]} (${percent(stats[growing].recentShare!)}% of its papers since ${highlights.since})`,
    );
  }
  const established = highlights.mostEstablished;
  if (established !== null && stats[established].medianYear !== null) {
    parts.push(
      `most established: ${labels[established]} (median year ${stats[established].medianYear})`,
    );
  }
  return parts.join(' · ');
}
