import { Injectable, signal } from '@angular/core';

export const REVIEWER_TOUR_STORAGE_KEY = 'core-papers-explorer.reviewer-tour-dismissed';

/** Whether the reviewer quick tour on the start screen was dismissed, kept across visits. */
@Injectable({ providedIn: 'root' })
export class ReviewerTourPreference {
  private readonly hidden = signal(read());
  readonly dismissed = this.hidden.asReadonly();

  dismiss(): void {
    this.hidden.set(true);
    try {
      localStorage.setItem(REVIEWER_TOUR_STORAGE_KEY, 'true');
    } catch {
      // Storage can be blocked; the tour then stays hidden for the visit.
    }
  }
}

function read(): boolean {
  try {
    return localStorage.getItem(REVIEWER_TOUR_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}
