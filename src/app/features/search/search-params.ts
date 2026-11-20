import { ParamMap, Params } from '@angular/router';
import { CORE_MAX_LIMIT } from '../../core/api/core-api.config';
import { MAX_RESULTS, lastPage } from './paging';

export const PAGE_SIZES = [10, 25, 50, CORE_MAX_LIMIT] as const;
export const DEFAULT_PAGE_SIZE = PAGE_SIZES[0];

/** What the URL describes: `?q=drone&size=25&page=3`. */
export interface SearchParams {
  query: string;
  page: number;
  size: number;
}

/**
 * Reads search params from the URL, repairing anything a hand-edited or stale link might hold. The
 * page size falls back to `defaultSize` (the saved preference), and the page is kept between 1 and
 * the last page CORE will serve.
 */
export function parseSearchParams(
  params: ParamMap,
  defaultSize: number | null = null,
): SearchParams {
  const size = toPageSize(params.get('size')) ?? defaultSize ?? DEFAULT_PAGE_SIZE;
  const page = Math.max(1, toInteger(params.get('page')) ?? 1);
  return {
    query: params.get('q')?.trim() ?? '',
    page: Math.min(page, lastPage(MAX_RESULTS, size)),
    size,
  };
}

/** The canonical query params: page 1 is left out, and an empty query clears everything. */
export function toQueryParams({ query, page, size }: SearchParams): Params {
  return query ? { q: query, size, ...(page > 1 && { page }) } : {};
}

/** The smallest preset that fits the value, so 30 becomes 50 and 999 becomes 100. */
export function toPageSize(value: string | null): number | null {
  const size = toInteger(value);
  return size === null ? null : (PAGE_SIZES.find((preset) => preset >= size) ?? CORE_MAX_LIMIT);
}

export function sameSearch(a: SearchParams, b: SearchParams): boolean {
  return a.query === b.query && a.page === b.page && a.size === b.size;
}

function toInteger(value: string | null): number | null {
  return value !== null && /^\s*-?\d+\s*$/.test(value) ? Number(value) : null;
}
