import { analyseQuery, positiveTerms } from '../../search/query/query-analyser';
import { STOP_WORDS } from './stop-words';

/** Title words count this many times, because a title says what a paper is about. */
export const TITLE_WEIGHT = 2;

export interface Token {
  /** The word as written, in lower case. */
  word: string;
  stem: string;
}

/** The words of a query, which every paper matches, so they never group papers or name a topic. */
export interface QueryTerms {
  stems: ReadonlySet<string>;
  /** Words starting with these are dropped too: `dron*`, or `deliver` for "delivery". */
  prefixes: readonly string[];
}

export interface ExtractedTerms {
  /** Per paper: term → weighted count. A term is a stem, or two stems joined by a space. */
  counts: Map<string, number>[];
  /** Term → how it is most often written, such as "routing" for `rout`. */
  forms: Map<string, string>;
}

const NO_QUERY: QueryTerms = { stems: new Set(), prefixes: [] };
const TAG = /<[^>]*>/g;
// A dash or a space between two words keeps them together; any other entity ("&amp;") parts them.
const JOINING_ENTITY = /&(?:ndash|nbsp|#8211|#x2013|#160|#xa0);?/gi;
const ENTITY = /&(?:#x[\da-f]+|#\d+|[a-z]+);?/gi;
const COMBINING_MARK = /[̀-ͯ]/g;
// Hyphens and en dashes join words ("last-mile", "truck–drone"); other punctuation ends a phrase,
// and two words only form a pair within a phrase.
const JOINER = /[-‐‑–]/g;
const PHRASE_BREAK = /[^a-z0-9\s]+/;
const SHORT_WORDS = new Set(['ai', 'ml', 'ev', 'vr', 'uk', 'eu']);
const MAX_WORD_LENGTH = 30;
// A root this long is specific enough to drop every word that starts with it.
const MIN_PREFIX_ROOT = 5;

/**
 * A light English stemmer: plurals, -ing and -ed, so "deliveries" and "delivery", or "routes" and
 * "route", count as one word. Unlike a full stemmer it never touches short words.
 */
export function stem(word: string): string {
  let w = word;
  if (w.length <= 3) {
    return w;
  }
  if (w.endsWith('sses')) {
    w = w.slice(0, -2);
  } else if (w.endsWith('ies') && w.length > 4) {
    w = `${w.slice(0, -3)}y`;
  } else if (w.endsWith('s') && !/(ss|us|is|ys)$/.test(w)) {
    w = w.slice(0, -1);
  }
  const suffix = w.endsWith('ing') ? 'ing' : w.endsWith('ed') ? 'ed' : null;
  if (suffix) {
    const base = w.slice(0, -suffix.length);
    const minLength = suffix === 'ing' ? 3 : 4;
    if (base.length >= minLength && /[aeiouy]/.test(base)) {
      w = undouble(base);
    }
  }
  return w;
}

/** "plann" → "plan", as Porter's stemmer does, except for l, s and z ("install", "pass"). */
function undouble(base: string): string {
  const last = base.at(-1)!;
  return base.length > 3 && last === base.at(-2) && !'aeiouylsz'.includes(last)
    ? base.slice(0, -1)
    : base;
}

export function queryTerms(query: string): QueryTerms {
  const stems = new Set<string>();
  const prefixes: string[] = [];
  for (const term of positiveTerms(analyseQuery(query).ast)) {
    for (const word of fold(term).split(/[^a-z0-9*?]+/)) {
      const wildcard = word.search(/[*?]/);
      if (wildcard >= 0) {
        if (wildcard >= 3) {
          prefixes.push(word.slice(0, wildcard));
        }
        continue;
      }
      if (!word) {
        continue;
      }
      const root = stem(word);
      stems.add(root);
      const trimmed = root.replace(/[ey]$/, '');
      if (trimmed.length >= MIN_PREFIX_ROOT) {
        prefixes.push(trimmed);
      }
    }
  }
  return { stems, prefixes };
}

/**
 * The words of a text that can say what it is about, in order, with `null` wherever a phrase
 * ends or a word was dropped, so that only words that were next to each other form pairs.
 */
export function tokenise(text: string, query: QueryTerms = NO_QUERY): (Token | null)[] {
  const tokens: (Token | null)[] = [];
  const clean = fold(
    text.replace(TAG, ' . ').replace(JOINING_ENTITY, ' ').replace(ENTITY, ' . '),
  ).replace(JOINER, ' ');
  for (const phrase of clean.split(PHRASE_BREAK)) {
    tokens.push(null);
    for (const word of phrase.split(/\s+/)) {
      if (word) {
        tokens.push(keep(word, query));
      }
    }
  }
  return tokens;
}

function keep(word: string, query: QueryTerms): Token | null {
  const hasDigit = /\d/.test(word);
  const valid =
    /[a-z]/.test(word) &&
    word.length <= MAX_WORD_LENGTH &&
    (word.length >= 3 || (hasDigit && word.length === 2) || SHORT_WORDS.has(word));
  if (!valid || STOP_WORDS.has(word)) {
    return null;
  }
  const root = stem(word);
  if (
    STOP_WORDS.has(root) ||
    query.stems.has(root) ||
    query.prefixes.some((prefix) => word.startsWith(prefix))
  ) {
    return null;
  }
  return { word, stem: root };
}

/**
 * Terms per paper: the stems of its title (counted `TITLE_WEIGHT` times) and abstract, and the
 * pairs of stems that stand next to each other, such as `last mile`.
 */
export function extractTerms(
  papers: readonly { title: string; abstract: string | null }[],
  query: QueryTerms = NO_QUERY,
): ExtractedTerms {
  const written = new Map<string, Map<string, number>>();
  const note = (term: string, form: string) => {
    const forms = written.get(term) ?? new Map<string, number>();
    forms.set(form, (forms.get(form) ?? 0) + 1);
    written.set(term, forms);
  };
  const counts = papers.map(({ title, abstract }) => {
    const terms = new Map<string, number>();
    const add = (text: string, weight: number) => {
      const tokens = tokenise(text, query);
      tokens.forEach((token, i) => {
        if (!token) {
          return;
        }
        terms.set(token.stem, (terms.get(token.stem) ?? 0) + weight);
        note(token.stem, token.word);
        const previous = tokens[i - 1];
        if (previous && previous.stem !== token.stem) {
          const pair = `${previous.stem} ${token.stem}`;
          terms.set(pair, (terms.get(pair) ?? 0) + weight);
          note(pair, `${previous.word} ${token.word}`);
        }
      });
    };
    add(title, TITLE_WEIGHT);
    add(abstract ?? '', 1);
    return terms;
  });
  const forms = new Map<string, string>();
  for (const [term, options] of written) {
    forms.set(term, mostCommon(options));
  }
  return { counts, forms };
}

/** Ties go to the shorter form, then the alphabetically first, so the choice never varies. */
function mostCommon(options: Map<string, number>): string {
  let best = '';
  let bestCount = -1;
  for (const [form, count] of options) {
    if (
      count > bestCount ||
      (count === bestCount &&
        (form.length < best.length || (form.length === best.length && form < best)))
    ) {
      best = form;
      bestCount = count;
    }
  }
  return best;
}

/** Lower case without accents, so "Naïve" and "naive" are one word. */
function fold(text: string): string {
  const lower = text.toLowerCase();
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7f]*$/.test(lower) ? lower : lower.normalize('NFKD').replace(COMBINING_MARK, '');
}
