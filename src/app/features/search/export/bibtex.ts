import { Paper } from '../../../core/models/paper';

const SPECIAL_CHARACTERS: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  '&': '\\&',
  '%': '\\%',
  $: '\\$',
  '#': '\\#',
  _: '\\_',
  '^': '\\textasciicircum{}',
  '~': '\\textasciitilde{}',
};

/** BibTeX entries for the papers, with keys such as `smith2020` made unique with a, b, c. */
export function toBibtex(papers: readonly Paper[]): string {
  const used = new Map<string, number>();
  return papers
    .map((paper) => {
      const base = citationKey(paper);
      const seen = used.get(base) ?? 0;
      used.set(base, seen + 1);
      const key = seen ? base + suffix(seen) : base;
      return bibtexEntry(paper, key);
    })
    .join('\n');
}

function bibtexEntry(paper: Paper, key: string): string {
  const fields: [string, string | null][] = [
    ['title', text(paper.title)],
    ['author', paper.authors.length ? paper.authors.map(text).join(' and ') : null],
    ['year', paper.year === null ? null : String(paper.year)],
    ['journal', paper.journal && text(paper.journal)],
    ['publisher', paper.publisher && text(paper.publisher)],
    ['doi', paper.doi && verbatim(paper.doi)],
    ['url', verbatim(paper.downloadUrl ?? paper.coreUrl)],
    ['abstract', paper.abstract && text(paper.abstract)],
  ];
  const body = fields
    .filter((field): field is [string, string] => !!field[1])
    .map(([name, value]) => `  ${name} = {${value}}`)
    .join(',\n');
  return `@${paper.journal ? 'article' : 'misc'}{${key},\n${body}\n}\n`;
}

/** The first author's family name and the year, in plain lowercase letters: `muller2020`. */
export function citationKey({ authors, year }: Paper): string {
  const name = authors[0]?.trim() ?? '';
  // CORE gives names as "Family, Given" or "Given Family".
  const family = name.includes(',') ? name.split(',')[0] : (name.split(/\s+/).at(-1) ?? '');
  const ascii = family
    .normalize('NFD')
    .replace(/[^A-Za-z]/g, '')
    .toLowerCase();
  return (ascii || 'anon') + (year ?? 'nd');
}

/** Escapes BibTeX's special characters and puts text on one line. */
export function text(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\\{}&%$#_^~]/g, (c) => SPECIAL_CHARACTERS[c]);
}

/** DOIs and URLs are kept as they are, minus the characters that would end the field. */
function verbatim(value: string): string {
  return value.replace(/[{}\s\\]/g, '');
}

/** a, b, …, z, aa, ab, … for the second, third and later papers with the same key. */
function suffix(index: number): string {
  let n = index;
  let result = '';
  do {
    n -= 1;
    result = String.fromCharCode(97 + (n % 26)) + result;
    n = Math.floor(n / 26);
  } while (n > 0);
  return result;
}
