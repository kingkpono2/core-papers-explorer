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
 * Why the query sent to CORE differs from the one written, so the user can be told:
 *
 * - `nested-or`: brackets around the whole query were removed, and with them an OR group inside
 *   would have been ignored by CORE.
 * - `outer-brackets`: brackets around the whole query were removed, which changes nothing.
 * - `phrase`: a lone quoted phrase was put in brackets, because CORE fails on it otherwise.
 */
export type CoreQueryChange = 'nested-or' | 'outer-brackets' | 'phrase';

/** What is sent to CORE and why, or null when it is the query as written (bar whitespace). */
export function coreQueryAdjustment(
  query: string,
): { sent: string; change: CoreQueryChange } | null {
  const text = normaliseQuery(query);
  const sent = toCoreQuery(text);
  if (sent === text) {
    return null;
  }
  const { ast } = analyseQuery(sent);
  const change =
    ast?.kind === 'group' && ast.child.kind === 'phrase'
      ? 'phrase'
      : ast && hasOrGroup(ast)
        ? 'nested-or'
        : 'outer-brackets';
  return { sent, change };
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

function hasOrGroup(node: QueryNode): boolean {
  switch (node.kind) {
    case 'and':
    case 'or':
      return node.children.some(hasOrGroup);
    case 'group':
      return node.child.kind === 'or' || hasOrGroup(node.child);
    case 'not':
      return hasOrGroup(node.child);
    default:
      return false;
  }
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
