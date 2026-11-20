import { ParamMap } from '@angular/router';
import { normaliseQuery } from '../search/query/query-analyser';

export const MAX_COMPARED = 3;
export const MIN_COMPARED = 2;
/** Far longer than any real query; anything longer is not worth sending. */
const MAX_QUERY_LENGTH = 1_000;

/**
 * The queries to compare, from `?q=...&q=...`: whitespace tidied, blanks, over-long queries and
 * repeats dropped, and at most three kept, in the order given.
 */
export function parseCompareQueries(params: ParamMap): string[] {
  return tidyQueries(params.getAll('q'));
}

export function tidyQueries(queries: readonly string[]): string[] {
  const seen = new Set<string>();
  const tidy: string[] = [];
  for (const query of queries.map(normaliseQuery)) {
    // CORE matches words regardless of case, but operators are case sensitive, so only an exact
    // repeat counts as the same query.
    if (!query || query.length > MAX_QUERY_LENGTH || seen.has(query)) {
      continue;
    }
    seen.add(query);
    tidy.push(query);
    if (tidy.length === MAX_COMPARED) {
      break;
    }
  }
  return tidy;
}

export function sameQueries(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((query, i) => query === b[i]);
}
