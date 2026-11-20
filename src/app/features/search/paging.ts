import { CORE_MAX_OFFSET } from '../../core/api/core-api.config';

/**
 * CORE serves results up to offset 10,000. Stopping at the 10,000th result keeps the last page
 * full for every page size and stays inside the limit even if CORE starts counting offset + limit.
 */
export const MAX_RESULTS = CORE_MAX_OFFSET;

export interface ResultRange {
  first: number;
  last: number;
}

/** The last page that can be requested, never less than 1. */
export function lastPage(total: number, size: number): number {
  return Math.max(1, Math.ceil(Math.min(total, MAX_RESULTS) / size));
}

export function pageOffset(page: number, size: number): number {
  return (page - 1) * size;
}

/** 1-based positions of the first and last result on a page, or null if the page is past the end. */
export function resultRange(page: number, size: number, total: number): ResultRange | null {
  const first = pageOffset(page, size) + 1;
  return first > total ? null : { first, last: Math.min(page * size, total) };
}
