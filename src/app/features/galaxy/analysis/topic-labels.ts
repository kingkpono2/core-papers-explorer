/** Terms kept per topic, most distinctive first. */
export const TERMS_PER_TOPIC = 5;
/** A term has to appear in this share of a topic's papers (and in two of them) to describe it. */
const MIN_TOPIC_SHARE = 0.15;
/**
 * A term has to be this much more common in the topic than overall to name it, so that words
 * spread evenly over every topic never do.
 */
export const MIN_LIFT = 1.5;
/** Pairs of words are rarer than single words but name a topic better ("vehicle routing"). */
export const PHRASE_BOOST = 1.3;

/**
 * The terms that set each topic apart, by class-based TF-IDF (c-TF-IDF, as in BERTopic): a
 * term's share of all term occurrences in the topic, times log(1 + A / f), where f is how often it
 * occurs across all papers and A the average number of term occurrences per topic. A term common
 * everywhere scores low; one concentrated in the topic scores high.
 *
 * Returns term indices per topic. A pair of words replaces its own words ("last mile" rather than
 * "last" and "mile"). Only terms found in enough of the topic's papers, and concentrated in it
 * (at least `MIN_LIFT` times their overall rate), are kept, unless that leaves fewer than two.
 */
export function distinctiveTerms(
  counts: readonly Map<number, number>[],
  assignments: ArrayLike<number>,
  k: number,
  vocabulary: readonly string[],
  perTopic = TERMS_PER_TOPIC,
): number[][] {
  const frequency = Array.from({ length: k }, () => new Map<number, number>());
  const papersWith = Array.from({ length: k }, () => new Map<number, number>());
  const totals = new Float64Array(k);
  const sizes = new Int32Array(k);
  const overall = new Map<number, number>();

  counts.forEach((terms, paper) => {
    const topic = assignments[paper];
    if (topic < 0) {
      return;
    }
    sizes[topic]++;
    for (const [term, count] of terms) {
      frequency[topic].set(term, (frequency[topic].get(term) ?? 0) + count);
      papersWith[topic].set(term, (papersWith[topic].get(term) ?? 0) + 1);
      overall.set(term, (overall.get(term) ?? 0) + count);
      totals[topic] += count;
    }
  });
  const grandTotal = totals.reduce((sum, total) => sum + total, 0);
  const average = grandTotal / Math.max(1, k);

  return frequency.map((terms, topic) => {
    const minPapers = Math.max(2, Math.ceil(MIN_TOPIC_SHARE * sizes[topic]));
    const scored = [...terms]
      .filter(([term]) => (papersWith[topic].get(term) ?? 0) >= Math.min(minPapers, sizes[topic]))
      .map(([term, count]) => ({
        term,
        score:
          (count / totals[topic]) *
          Math.log(1 + average / overall.get(term)!) *
          (vocabulary[term].includes(' ') ? PHRASE_BOOST : 1),
        lift: count / totals[topic] / (overall.get(term)! / grandTotal),
      }))
      .sort((a, b) => b.score - a.score || vocabulary[a.term].localeCompare(vocabulary[b.term]));
    const concentrated = scored.filter((s) => k === 1 || s.lift >= MIN_LIFT);
    return withoutOverlaps(
      (concentrated.length >= 2 ? concentrated : scored).map((s) => s.term),
      vocabulary,
      perTopic,
    );
  });
}

/**
 * The first `limit` terms, where a pair of words takes the place of a single word it contains
 * that was picked before it, and a single word is skipped when a pair already holds it.
 */
function withoutOverlaps(ranked: number[], vocabulary: readonly string[], limit: number): number[] {
  const picked: number[] = [];
  const words = (term: number) => vocabulary[term].split(' ');
  for (const term of ranked) {
    const own = words(term);
    if (own.length > 1) {
      const overlapping = picked.findIndex(
        (other) => words(other).length === 1 && own.includes(vocabulary[other]),
      );
      if (overlapping >= 0) {
        picked[overlapping] = term;
        // A pair can contain two picked words; the second one goes.
        const second = picked.findIndex(
          (other, i) =>
            i !== overlapping && words(other).length === 1 && own.includes(vocabulary[other]),
        );
        if (second >= 0) {
          picked.splice(second, 1);
        }
        continue;
      }
      if (
        picked.some((other) => words(other).length > 1 && words(other).some((w) => own.includes(w)))
      ) {
        continue;
      }
    } else if (
      picked.some((other) => words(other).includes(own[0]) || sameRoot(vocabulary[other], own[0]))
    ) {
      continue;
    }
    picked.push(term);
    if (picked.length === limit) {
      break;
    }
  }
  return picked;
}

/** "rout" and "route", or "optimiz" and "optimization": one word, stemmed two ways. */
function sameRoot(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && !short.includes(' ') && long.startsWith(short);
}

/**
 * The terms that name each topic: its two most distinctive, such as "parcel" and "last mile". A
 * topic never leads with a term another (larger) topic already leads with.
 */
export function labelTerms(terms: readonly string[][]): string[][] {
  const leads = new Set<string>();
  return terms.map((list) => {
    const lead = list.find((term) => !leads.has(term)) ?? list[0];
    if (lead === undefined) {
      return [];
    }
    leads.add(lead);
    const second = list.find((term) => term !== lead);
    return second ? [lead, second] : [lead];
  });
}

/** "parcel · last mile", or "Other papers" for a topic without distinctive terms. */
export function topicLabel(terms: readonly string[]): string {
  return terms.length ? terms.join(' · ') : 'Other papers';
}
