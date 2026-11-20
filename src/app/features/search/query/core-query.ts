import { QueryNode, analyseQuery, normaliseQuery, unwrap } from './query-analyser';

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

/**
 * The query narrowed by `clause`, such as `yearPublished:2020`, in a form CORE reads correctly, or
 * null when it cannot be done without changing what the query means.
 *
 * It starts from the CORE form, so `(drone AND (package OR delivery))` becomes
 * `drone AND (package OR delivery) AND yearPublished:2020`; wrapping the original in brackets would
 * nest its OR group, which CORE then ignores. A query that is an OR at the top is bracketed, which
 * is safe unless that pushes another OR group into nested brackets. Queries that already filter
 * by year are left alone.
 */
export function narrowQuery(query: string, clause: string): string | null {
  const core = toCoreQuery(query);
  const { ast } = analyseQuery(core);
  if (!ast || mentionsField(ast, 'yearPublished')) {
    return null;
  }
  const narrowed = ast.kind === 'or' ? `(${core}) AND ${clause}` : `${core} AND ${clause}`;
  return nestedOrGroups(narrowed) > nestedOrGroups(core) ? null : narrowed;
}

function nestedOrGroups(query: string): number {
  return analyseQuery(query).diagnostics.filter((d) => d.code === 'nested-or-group').length;
}

function mentionsField(node: QueryNode, field: string): boolean {
  switch (node.kind) {
    case 'and':
    case 'or':
      return node.children.some((child) => mentionsField(child, field));
    case 'not':
    case 'group':
      return mentionsField(node.child, field);
    default:
      return node.field === field;
  }
}
