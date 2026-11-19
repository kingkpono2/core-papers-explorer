/**
 * Raw shapes returned by CORE API v3 `/search/works/`. Only the fields the app reads are typed,
 * and all of them are treated as optional because CORE records are inconsistently populated.
 */
export interface CoreAuthor {
  name?: string | null;
}

export interface CoreLink {
  type?: string | null;
  url?: string | null;
}

export interface CoreJournal {
  title?: string | null;
  identifiers?: string[] | null;
}

export interface CoreLanguage {
  code?: string | null;
  name?: string | null;
}

export interface CoreWork {
  id: number | string;
  title?: string | null;
  authors?: CoreAuthor[] | null;
  abstract?: string | null;
  yearPublished?: number | null;
  publishedDate?: string | null;
  doi?: string | null;
  downloadUrl?: string | null;
  links?: CoreLink[] | null;
  publisher?: string | null;
  journals?: CoreJournal[] | null;
  documentType?: string | null;
  citationCount?: number | null;
  language?: CoreLanguage | null;
}

export interface CoreSearchResponse {
  totalHits: number;
  limit: number;
  offset: number;
  results: CoreWork[];
  searchId?: string;
}
