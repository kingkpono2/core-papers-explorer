import { CoreAggregateResponse, CoreLink, CoreSearchResponse, CoreWork } from './core-api.models';
import { Paper, SearchResult, YearCounts } from './paper';

/** CORE's cap on the values returned per aggregated field (checked November 2026). */
export const CORE_MAX_AGGREGATION_BUCKETS = 100;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
};

// Some providers send abstracts as escaped HTML, sometimes without the final semicolon.
const ENTITY =
  /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|ndash|mdash|[lr]squo|[lr]dquo|hellip);?/gi;
const TAG = /<\/?[a-z][^<>]*>/gi;
// Truncated abstracts can end in half a tag, such as `</p` or `<jats:p`, with no closing `>`.
const TRAILING_TAG_FRAGMENT = /<\/?[a-z][\w:.-]*\s*$/i;
const LANDING_LINK_TYPES = ['display', 'reader'];

export function toSearchResult(response: CoreSearchResponse): SearchResult {
  return {
    total: response.totalHits ?? 0,
    papers: (response.results ?? []).map(toPaper),
    limit: response.limit,
    offset: response.offset,
  };
}

export function toYearCounts(response: CoreAggregateResponse): YearCounts {
  const buckets = Object.entries(response.aggregations?.['yearPublished'] ?? {});
  const counts = buckets
    .map(([year, count]) => ({ year: Number(year), count }))
    .filter(({ year, count }) => Number.isInteger(year) && Number.isInteger(count) && count > 0)
    .sort((a, b) => a.year - b.year);
  return { counts, truncated: buckets.length >= CORE_MAX_AGGREGATION_BUCKETS };
}

export function toPaper(work: CoreWork): Paper {
  const id = String(work.id);
  const doi = normalizeDoi(work.doi);
  const doiUrl = doi ? `https://doi.org/${encodeURIComponent(doi).replace(/%2F/gi, '/')}` : null;
  const coreUrl = `https://core.ac.uk/works/${encodeURIComponent(id)}`;

  return {
    id,
    title: cleanText(work.title) ?? 'Untitled',
    authors: uniqueAuthors(work.authors?.map((author) => author?.name)),
    abstract: cleanText(work.abstract),
    year: integerAtLeast(work.yearPublished, 1),
    publishedDate: isoDate(work.publishedDate),
    doi,
    doiUrl,
    downloadUrl: httpUrl(work.downloadUrl),
    publisher: stripWrappingQuotes(cleanText(work.publisher)),
    journal: cleanText(work.journals?.[0]?.title),
    documentType: cleanText(work.documentType),
    citationCount: integerAtLeast(work.citationCount, 0),
    language: cleanText(work.language?.name),
    sourceUrl: landingUrl(work.links) ?? doiUrl ?? coreUrl,
    coreUrl,
  };
}

/** Decodes common HTML entities, strips tags and collapses whitespace. Empty results become null. */
export function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value
    .replace(ENTITY, (_, entity: string) => decodeEntity(entity))
    .replace(TAG, ' ')
    .replace(TRAILING_TAG_FRAGMENT, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

function decodeEntity(entity: string): string {
  const name = entity.toLowerCase();
  if (!name.startsWith('#')) {
    return NAMED_ENTITIES[name];
  }
  const codePoint = name.startsWith('#x')
    ? parseInt(name.slice(2), 16)
    : parseInt(name.slice(1), 10);
  return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '';
}

function uniqueAuthors(names: (string | null | undefined)[] | undefined): string[] {
  const authors = new Map<string, string>();
  for (const name of names ?? []) {
    const clean = cleanText(name);
    if (clean && !authors.has(clean.toLowerCase())) {
      authors.set(clean.toLowerCase(), clean);
    }
  }
  return [...authors.values()];
}

function normalizeDoi(value: string | null | undefined): string | null {
  const doi = value
    ?.trim()
    .replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, '')
    .trim();
  return doi && doi.startsWith('10.') ? doi : null;
}

function landingUrl(links: CoreLink[] | null | undefined): string | null {
  for (const type of LANDING_LINK_TYPES) {
    const url = httpUrl(links?.find((link) => link?.type === type)?.url);
    if (url) {
      return url;
    }
  }
  return null;
}

function httpUrl(value: string | null | undefined): string | null {
  const url = value?.trim();
  return url && /^https?:\/\//i.test(url) ? url : null;
}

function isoDate(value: string | null | undefined): string | null {
  return value?.trim().match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}

function integerAtLeast(value: number | null | undefined, min: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min ? value : null;
}

function stripWrappingQuotes(value: string | null): string | null {
  return value?.replace(/^'(.*)'$/, '$1').trim() || null;
}
