import { analyseQuery, normaliseQuery, unwrap } from './query-analyser';

/**
 * The query as sent to CORE, working around two CORE bugs without changing what it means:
 *
 * - An OR group inside other brackets is ignored: `(drone AND (package OR delivery))` returns
 *   every drone paper, while `drone AND (package OR delivery)` narrows correctly. Brackets that
 *   enclose the whole query change nothing, so they are removed. Deeper cases get a warning from
 *   the analyser instead.
 * - A query that is only a quoted phrase fails with a 500, while the same phrase in brackets works.
 *
 * The URL and the search box keep the query as the user wrote it.
 */
export function toCoreQuery(query: string): string {
  const text = normaliseQuery(query);
  const ast = unwrap(analyseQuery(text).ast, text);
  if (!ast) {
    return text;
  }
  const inner = text.slice(ast.start, ast.end);
  return ast.kind === 'phrase' && ast.field === null ? `(${inner})` : inner;
}
