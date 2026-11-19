import { Paper } from '../app/core/models/paper';

/** A paper with every optional field empty, for tests to fill in as needed. */
export function makePaper(overrides: Partial<Paper> = {}): Paper {
  const id = overrides.id ?? '1';
  return {
    id,
    title: 'Untitled',
    authors: [],
    abstract: null,
    year: null,
    publishedDate: null,
    doi: null,
    doiUrl: null,
    downloadUrl: null,
    publisher: null,
    journal: null,
    documentType: null,
    citationCount: null,
    language: null,
    sourceUrl: `https://core.ac.uk/works/${id}`,
    coreUrl: `https://core.ac.uk/works/${id}`,
    ...overrides,
  };
}
