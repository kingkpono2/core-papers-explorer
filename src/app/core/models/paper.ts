export interface Paper {
  id: string;
  title: string;
  authors: string[];
  abstract: string | null;
  year: number | null;
  /** ISO date (YYYY-MM-DD). */
  publishedDate: string | null;
  doi: string | null;
  doiUrl: string | null;
  downloadUrl: string | null;
  publisher: string | null;
  journal: string | null;
  documentType: string | null;
  citationCount: number | null;
  language: string | null;
  /** Best page to open for the paper: CORE's landing page, its reader, or the DOI. */
  sourceUrl: string;
}

export interface SearchRequest {
  query: string;
  limit: number;
  offset?: number;
}

export interface SearchResult {
  total: number;
  papers: Paper[];
  limit: number;
  offset: number;
}
