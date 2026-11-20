/** A page number, or null for a gap shown as an ellipsis. */
export type PageItem = number | null;

/**
 * The page links to show: the first and last page, `siblings` pages either side of the current
 * one, and ellipses for the gaps. A gap never stands in for a single page, so once there are enough
 * pages the list always has `2 * siblings + 5` items and the controls keep their width while paging.
 */
export function pageItems(current: number, last: number, siblings = 1): PageItem[] {
  if (last <= 2 * siblings + 5) {
    return range(1, last);
  }
  const start = Math.min(Math.max(current - siblings, 3), last - 2 - 2 * siblings);
  const end = start + 2 * siblings;
  return [1, start > 3 ? null : 2, ...range(start, end), end < last - 2 ? null : last - 1, last];
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}
