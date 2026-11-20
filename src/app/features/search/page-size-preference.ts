import { Injectable, signal } from '@angular/core';
import { toPageSize } from './search-params';

export const PAGE_SIZE_STORAGE_KEY = 'core-papers-explorer.page-size';

/** The page size the user last picked, used when a URL does not say. */
@Injectable({ providedIn: 'root' })
export class PageSizePreference {
  private readonly saved = signal(read());
  readonly size = this.saved.asReadonly();

  set(size: number): void {
    this.saved.set(size);
    try {
      localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(size));
    } catch {
      // Storage can be blocked (private mode, site settings); the choice then lasts for the visit.
    }
  }
}

function read(): number | null {
  try {
    return toPageSize(localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
  } catch {
    return null;
  }
}
