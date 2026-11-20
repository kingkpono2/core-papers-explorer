import { Injectable, signal } from '@angular/core';

export const RECENT_SEARCHES_STORAGE_KEY = 'core-papers-explorer.recent-searches';
export const MAX_RECENT_SEARCHES = 8;

/** The last few queries that CORE answered, most recent first, kept across visits. */
@Injectable({ providedIn: 'root' })
export class RecentSearches {
  private readonly list = signal<readonly string[]>(read());
  readonly queries = this.list.asReadonly();

  add(query: string): void {
    const current = this.list();
    if (current[0] === query) {
      return;
    }
    this.save([query, ...current.filter((saved) => saved !== query)].slice(0, MAX_RECENT_SEARCHES));
  }

  clear(): void {
    this.save([]);
  }

  private save(queries: readonly string[]): void {
    this.list.set(queries);
    try {
      if (queries.length) {
        localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(queries));
      } else {
        localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
      }
    } catch {
      // Storage can be blocked or full; the history then lasts for the visit.
    }
  }
}

function read(): readonly string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY) ?? '[]');
    return Array.isArray(saved)
      ? saved
          .filter((query): query is string => typeof query === 'string' && query.trim() !== '')
          .slice(0, MAX_RECENT_SEARCHES)
      : [];
  } catch {
    return [];
  }
}
