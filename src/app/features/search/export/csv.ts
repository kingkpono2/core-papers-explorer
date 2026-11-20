import { Paper } from '../../../core/models/paper';

const COLUMNS: [heading: string, value: (paper: Paper) => string | number | null][] = [
  ['Title', (p) => p.title],
  ['Authors', (p) => p.authors.join('; ')],
  ['Year', (p) => p.year],
  ['Published', (p) => p.publishedDate],
  ['Journal', (p) => p.journal],
  ['Publisher', (p) => p.publisher],
  ['Document type', (p) => p.documentType],
  ['Language', (p) => p.language],
  ['Citations', (p) => p.citationCount],
  ['DOI', (p) => p.doi],
  ['Full text', (p) => p.downloadUrl],
  ['CORE page', (p) => p.coreUrl],
  ['Abstract', (p) => p.abstract],
];

/** RFC 4180 CSV, one row per paper, with CRLF line endings. */
export function toCsv(papers: readonly Paper[]): string {
  const rows = [
    COLUMNS.map(([heading]) => heading),
    ...papers.map((paper) => COLUMNS.map(([, value]) => value(paper))),
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/**
 * Quotes a cell when needed. Text starting with `=`, `+`, `-`, `@`, a tab or a carriage return gets
 * a leading apostrophe, so a spreadsheet shows it instead of running it as a formula (titles come
 * from thousands of repositories and are not trusted).
 */
export function csvCell(value: string | number | null): string {
  if (value === null) {
    return '';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
