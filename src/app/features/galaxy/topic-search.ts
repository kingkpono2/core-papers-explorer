import { anyOfClause, refineQuery } from '../search/query/core-query';

/**
 * The search for one topic within a query: the query, as CORE reads it, narrowed to papers that
 * mention any of the topic's name terms, such as `drone AND delivery AND (truck OR "last mile")`.
 * Null when there is nothing to narrow by, or narrowing would make CORE ignore part of the query.
 */
export function topicSearch(
  query: string,
  topic: { labelTerms: readonly string[] },
): string | null {
  const clause = anyOfClause(topic.labelTerms);
  return clause ? refineQuery(query, clause) : null;
}
