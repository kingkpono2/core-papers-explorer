/**
 * A parser for the subset of CORE's query language the app understands: terms, "phrases",
 * AND/OR/NOT, -term and +term, brackets, field:value, field:"phrase", field:(group), comparisons
 * such as yearPublished>=2019, and * or ? wildcards. Ranges in square brackets are recognised only
 * to be rejected, because CORE fails on them.
 *
 * CORE answers many malformed queries with results rather than an error, so this is where mistakes
 * are caught. Positions are character offsets into the analysed text.
 */

export const KNOWN_FIELDS = [
  'title',
  'abstract',
  'fullText',
  'authors',
  'contributors',
  'yearPublished',
  'publishedDate',
  'acceptedDate',
  'depositedDate',
  'createdDate',
  'updatedDate',
  'documentType',
  'fieldOfStudy',
  'language',
  'publisher',
  'journals',
  'citationCount',
  'doi',
  'arxivId',
  'magId',
  'pubmedId',
  'oaiIds',
  'identifiers',
  'id',
  'dataProviders',
  'downloadUrl',
  'sourceFulltextUrls',
  'references',
  '_exists_',
] as const;

export type Severity = 'error' | 'warning';

export type DiagnosticCode =
  | 'empty-query'
  | 'unclosed-paren'
  | 'unmatched-paren'
  | 'empty-group'
  | 'dangling-operator'
  | 'unterminated-quote'
  | 'empty-phrase'
  | 'missing-value'
  | 'unsupported-range'
  | 'lowercase-operator'
  | 'mixed-operators'
  | 'nested-or-group'
  | 'unknown-field';

export interface Diagnostic {
  code: DiagnosticCode;
  severity: Severity;
  message: string;
  start: number;
  end: number;
}

interface Span {
  start: number;
  end: number;
}

export type QueryNode =
  | ({ kind: 'term' | 'phrase'; text: string; field: string | null } & Span)
  | ({ kind: 'comparison'; field: string; text: string } & Span)
  | ({ kind: 'and' | 'or'; children: QueryNode[] } & Span)
  | ({ kind: 'not' | 'group'; child: QueryNode } & Span);

export interface QueryAnalysis {
  ast: QueryNode | null;
  /** Sorted by position. Errors block a search, warnings do not. */
  diagnostics: Diagnostic[];
  hasErrors: boolean;
}

/** Trims and collapses whitespace. Nothing else is rewritten. */
export function normaliseQuery(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export function analyseQuery(text: string): QueryAnalysis {
  if (!text.trim()) {
    const empty = error('empty-query', 'Enter something to search for.', { start: 0, end: 0 });
    return { ast: null, diagnostics: [empty], hasErrors: true };
  }
  const parser = new Parser(tokenize(text));
  const ast = parser.parse();
  const diagnostics = [...parser.diagnostics, ...nestedOrGroups(unwrap(ast, text))].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );
  return { ast, diagnostics, hasErrors: diagnostics.some((d) => d.severity === 'error') };
}

/**
 * Words and phrases the query asks for, for highlighting: everything that is not negated, not a
 * comparison and not limited to a field other than the title or abstract.
 */
export function positiveTerms(node: QueryNode | null): string[] {
  if (!node) {
    return [];
  }
  switch (node.kind) {
    case 'term':
    case 'phrase': {
      const text = node.text.replace(/\\(.)/g, '$1');
      const searchable = node.field === null || TEXT_FIELDS.has(node.field);
      return searchable && !LOWERCASE_OPERATORS.has(text.toLowerCase()) ? [text] : [];
    }
    case 'and':
    case 'or':
      return [...new Set(node.children.flatMap(positiveTerms))];
    case 'group':
      return positiveTerms(node.child);
    default:
      return [];
  }
}

/** The query inside any brackets that enclose all of it, which change nothing. */
export function unwrap(node: QueryNode | null, text: string): QueryNode | null {
  const spansAll =
    node?.start === text.length - text.trimStart().length && node.end === text.trimEnd().length;
  // Once the outer brackets are gone, a group that is all that is left is redundant too.
  while (spansAll && node?.kind === 'group' && text[node.start] === '(') {
    node = node.child;
  }
  return node;
}

/**
 * CORE drops an OR group that sits inside other brackets next to more terms: both
 * `(drone AND (package OR delivery)) AND yearPublished>2019` and the same without the OR group
 * return 49,071 papers. Brackets around the whole query are removed before sending, so they are
 * not counted.
 */
function nestedOrGroups(node: QueryNode | null, insideGroup = false): Diagnostic[] {
  switch (node?.kind) {
    case 'group':
      return nestedOrGroups(node.child, true);
    case 'not':
      return nestedOrGroups(node.child, insideGroup);
    case 'and':
    case 'or':
      return node.children.flatMap((child) =>
        insideGroup && child.kind === 'group' && child.child.kind === 'or'
          ? [
              {
                code: 'nested-or-group' as const,
                severity: 'warning' as const,
                message:
                  'CORE ignores an OR group inside other brackets, so it will not narrow the results. Move it out of the outer brackets if you can.',
                start: child.start,
                end: child.end,
              },
              ...nestedOrGroups(child.child, true),
            ]
          : nestedOrGroups(child, insideGroup),
      );
    default:
      return [];
  }
}

const TEXT_FIELDS = new Set(['title', 'abstract', 'fullText']);

type TokenKind =
  'term' | 'phrase' | 'range' | 'field' | 'lparen' | 'rparen' | 'and' | 'or' | 'not' | 'prefix';

interface Token extends Span {
  kind: TokenKind;
  /** The source text; for fields, the name, and for phrases and ranges, what is inside. */
  text: string;
  /** `:` or a comparison for fields. */
  op?: string;
  closed?: boolean;
}

const FIELD = /([A-Za-z_][\w.]*)(:|>=|<=|>|<)/y;
const TERM_END = /[\s()"]/;
const OPERATORS = new Map<string, TokenKind>([
  ['AND', 'and'],
  ['&&', 'and'],
  ['OR', 'or'],
  ['||', 'or'],
  ['NOT', 'not'],
]);

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const start = i;
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (ch === '(' || ch === ')') {
      tokens.push({ kind: ch === '(' ? 'lparen' : 'rparen', text: ch, start, end: ++i });
    } else if (ch === '"') {
      const close = findUnescaped(text, '"', i + 1);
      i = close < 0 ? text.length : close + 1;
      const inner = text.slice(start + 1, close < 0 ? i : close);
      tokens.push({ kind: 'phrase', text: inner, start, end: i, closed: close >= 0 });
    } else if (ch === '[' || ch === '{') {
      const close = text.slice(i).search(/[\]}]/);
      i = close < 0 ? text.length : i + close + 1;
      const inner = text.slice(start + 1, close < 0 ? i : i - 1);
      tokens.push({ kind: 'range', text: inner, start, end: i });
    } else if ('-+!'.includes(ch)) {
      tokens.push({ kind: 'prefix', text: ch, start, end: ++i });
    } else {
      FIELD.lastIndex = i;
      const field = FIELD.exec(text);
      if (field) {
        i = FIELD.lastIndex;
        tokens.push({ kind: 'field', text: field[1], op: field[2], start, end: i });
        continue;
      }
      while (i < text.length && !TERM_END.test(text[i])) {
        i += text[i] === '\\' ? 2 : 1;
      }
      i = Math.min(i, text.length);
      const word = text.slice(start, i);
      tokens.push({ kind: OPERATORS.get(word) ?? 'term', text: word, start, end: i });
    }
  }
  return tokens;
}

function findUnescaped(text: string, char: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\\') {
      i++;
    } else if (text[i] === char) {
      return i;
    }
  }
  return -1;
}

const LOWERCASE_OPERATORS = new Map<string, 'and' | 'or' | 'not'>([
  ['and', 'and'],
  ['or', 'or'],
  ['not', 'not'],
]);
const OPERAND_START: readonly TokenKind[] = [
  'term',
  'phrase',
  'range',
  'field',
  'lparen',
  'prefix',
  'not',
];

/**
 * One level of a query: operands, with the binary operators between them. An operand that failed
 * to parse is kept as `null`, so its error is not followed by a second one about the operator.
 */
type Item = { node: QueryNode | null } | { operator: 'and' | 'or'; token: Token };

class Parser {
  readonly diagnostics: Diagnostic[] = [];
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): QueryNode | null {
    const parts: QueryNode[] = [];
    while (this.pos < this.tokens.length) {
      const node = this.parseSequence(null);
      if (node) {
        parts.push(node);
      }
      const stray = this.peek();
      if (stray?.kind === 'rparen') {
        this.report(error('unmatched-paren', 'This closing bracket has no opening one.', stray));
        this.pos++;
      }
    }
    return combine('or', parts);
  }

  /** Parses up to a closing bracket or the end. Adjacent operands are joined with OR, as in CORE. */
  private parseSequence(field: string | null): QueryNode | null {
    const items: Item[] = [];
    for (let token = this.peek(); token && token.kind !== 'rparen'; token = this.peek()) {
      const operator = this.binaryOperator(token, items.at(-1));
      if (operator) {
        items.push({ operator, token });
        this.pos++;
      } else {
        items.push({ node: this.parseUnary(field) });
      }
    }
    return this.build(items);
  }

  /**
   * AND and OR. CORE also obeys lowercase "and", "or" and "not", so between two operands they are
   * read as operators too, with a warning.
   */
  private binaryOperator(token: Token, previous: Item | undefined): 'and' | 'or' | null {
    if (token.kind === 'and' || token.kind === 'or') {
      return token.kind;
    }
    const lowercase = this.lowercaseOperator(token, previous);
    if (lowercase === 'not') {
      this.tokens[this.pos] = { ...token, kind: 'not' };
      return null;
    }
    return lowercase;
  }

  /** "not" can follow AND or OR; "and" and "or" need an operand on both sides. */
  private lowercaseOperator(token: Token, previous: Item | undefined): 'and' | 'or' | 'not' | null {
    const operator =
      token.kind === 'term' ? LOWERCASE_OPERATORS.get(token.text.toLowerCase()) : undefined;
    const next = this.tokens[this.pos + 1];
    const placed = operator === 'not' ? previous : previous && 'node' in previous;
    if (!operator || !placed || !next || !OPERAND_START.includes(next.kind)) {
      return null;
    }
    const upper = operator.toUpperCase();
    this.report({
      code: 'lowercase-operator',
      severity: 'warning',
      message: `CORE treats “${token.text}” as ${upper}, the same as in capitals. Write ${upper} to make that clear.`,
      start: token.start,
      end: token.end,
    });
    return operator;
  }

  private parseUnary(field: string | null): QueryNode | null {
    const token = this.peek();
    if (token?.kind !== 'not' && token?.kind !== 'prefix') {
      return this.parsePrimary(field);
    }
    this.pos++;
    const operand = this.parseUnary(field);
    if (!operand) {
      this.report(danglingAfter(token));
      return null;
    }
    const node = token.text === '+' ? operand : { kind: 'not' as const, child: operand };
    return { ...node, start: token.start, end: operand.end };
  }

  private parsePrimary(field: string | null): QueryNode | null {
    const token = this.peek();
    if (!token || token.kind === 'rparen' || token.kind === 'and' || token.kind === 'or') {
      return null;
    }
    this.pos++;
    switch (token.kind) {
      case 'lparen':
        return this.parseGroup(token, field);
      case 'phrase':
        return this.phrase(token, field);
      case 'range':
        return this.range(token, field);
      case 'field':
        return this.parseField(token);
      default:
        return { kind: 'term', text: token.text, field, start: token.start, end: token.end };
    }
  }

  private parseGroup(open: Token, field: string | null): QueryNode | null {
    const child = this.parseSequence(field);
    const close = this.peek();
    if (close?.kind === 'rparen') {
      this.pos++;
    } else {
      this.report(error('unclosed-paren', 'This bracket is never closed. Add a ).', open));
    }
    if (!child) {
      if (close?.kind === 'rparen') {
        this.report(error('empty-group', 'These brackets are empty.', spanOf(open, close)));
      }
      return null;
    }
    return { kind: 'group', child, start: open.start, end: close?.end ?? child.end };
  }

  private parseField(token: Token): QueryNode | null {
    const name = token.text;
    this.checkField(token);
    const value = this.peek();
    const comparison = token.op !== ':';

    if (comparison && (value?.kind === 'term' || value?.kind === 'phrase')) {
      this.pos++;
      return {
        kind: 'comparison',
        field: name,
        text: `${token.op}${value.text}`,
        ...spanOf(token, value),
      };
    }
    if (!comparison && value && ['term', 'phrase', 'range', 'lparen'].includes(value.kind)) {
      const node = this.parsePrimary(name);
      return node && { ...node, start: token.start };
    }
    const example = comparison ? `${name}${token.op}2019` : `${name}:drone`;
    const message = `Add a value after ${name}${token.op}, for example ${example}.`;
    this.report(error('missing-value', message, token));
    return null;
  }

  private phrase(token: Token, field: string | null): QueryNode | null {
    if (!token.closed) {
      this.report(error('unterminated-quote', 'This quote is never closed. Add a ".', token));
    }
    const text = token.text.trim();
    if (!text) {
      if (token.closed) {
        this.report(error('empty-phrase', 'These quotes are empty.', token));
      }
      return null;
    }
    return { kind: 'phrase', text, field, start: token.start, end: token.end };
  }

  /** CORE fails with a 500 on Lucene ranges such as [2019 TO 2021], so suggest comparisons. */
  private range(token: Token, field: string | null): null {
    const bounds = /^\s*(\S+)\s+TO\s+(\S+)\s*$/i.exec(token.text);
    const name = field ?? 'yearPublished';
    const [from, to] = bounds ? [bounds[1], bounds[2]] : ['2019', '2021'];
    const message = `CORE cannot search ranges written in square brackets. Use ${name}>=${from} AND ${name}<=${to} instead.`;
    this.report(error('unsupported-range', message, token));
    return null;
  }

  /** Joins AND before OR, reporting operators that are missing an operand on either side. */
  private build(items: Item[]): QueryNode | null {
    const alternatives: QueryNode[][] = [[]];
    let firstAnd: Token | null = null;
    let firstOr: Token | null = null;

    for (const [index, item] of items.entries()) {
      const before = items[index - 1];
      if ('node' in item) {
        if (before && 'node' in before) {
          alternatives.push([]);
        }
        if (item.node) {
          alternatives[alternatives.length - 1].push(item.node);
        }
        continue;
      }
      const { token } = item;
      const after = items[index + 1];
      if (after && 'token' in after) {
        const message = `${token.text} is followed by ${after.token.text}. Remove one of them.`;
        this.report(error('dangling-operator', message, spanOf(token, after.token)));
      } else if (!before) {
        this.report(error('dangling-operator', `Add a search term before ${token.text}.`, token));
      } else if (!after) {
        this.report(danglingAfter(token));
      }
      if (item.operator === 'or') {
        firstOr ??= token;
        alternatives.push([]);
      } else {
        firstAnd ??= token;
      }
    }

    if (firstAnd && firstOr) {
      this.report({
        code: 'mixed-operators',
        severity: 'warning',
        message: 'Add brackets to show how AND and OR combine, for example (a OR b) AND c.',
        start: firstOr.start,
        end: firstOr.end,
      });
    }
    const terms = alternatives.map((group) => combine('and', group));
    return combine(
      'or',
      terms.filter((node): node is QueryNode => node !== null),
    );
  }

  private checkField(token: Token): void {
    const name = token.text;
    if ((KNOWN_FIELDS as readonly string[]).includes(name)) {
      return;
    }
    const suggestions = suggestFields(name);
    const hint = suggestions.length
      ? ` Did you mean ${suggestions.join(' or ')}?`
      : ' Check the list of fields under How to search.';
    // CORE answers an unknown field with a 500 ("foo is not a searchable field").
    this.report(
      error('unknown-field', `CORE has no field called ${name}.${hint}`, {
        start: token.start,
        end: token.start + name.length,
      }),
    );
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private report(diagnostic: Diagnostic): void {
    this.diagnostics.push(diagnostic);
  }
}

function combine(kind: 'and' | 'or', nodes: QueryNode[]): QueryNode | null {
  if (nodes.length <= 1) {
    return nodes[0] ?? null;
  }
  return { kind, children: nodes, start: nodes[0].start, end: nodes.at(-1)!.end };
}

function spanOf(first: Span, last: Span): Span {
  return { start: first.start, end: last.end };
}

function error(code: DiagnosticCode, message: string, span: Span): Diagnostic {
  return { code, severity: 'error', message, start: span.start, end: span.end };
}

function danglingAfter(token: Token): Diagnostic {
  const name = token.text === '-' || token.text === '!' ? 'NOT' : token.text;
  return error('dangling-operator', `Add a search term after ${name}.`, token);
}

/** Known fields that differ only in case, start with the name, or are one or two edits away. */
export function suggestFields(name: string): string[] {
  const lower = name.toLowerCase();
  return KNOWN_FIELDS.filter((field) => {
    const candidate = field.toLowerCase();
    return (
      candidate === lower ||
      (lower.length >= 3 && candidate.startsWith(lower)) ||
      editDistance(candidate, lower) <= Math.min(2, Math.floor(lower.length / 3))
    );
  }).slice(0, 3);
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}
