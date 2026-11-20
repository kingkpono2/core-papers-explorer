import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

export type Theme = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'core-papers-explorer.theme';

/** The theme the user picked, or `system` to follow the operating system. */
export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

/**
 * The stylesheet follows `prefers-color-scheme` unless the root element says otherwise. main.ts
 * calls this before the app starts, so a saved theme is in place before the first render.
 */
export function applyTheme(root: HTMLElement, theme: Theme): void {
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

@Injectable({ providedIn: 'root' })
export class ThemePreference {
  private readonly root = inject(DOCUMENT).documentElement;
  private readonly current = signal(storedTheme());
  readonly theme = this.current.asReadonly();

  set(theme: Theme): void {
    this.current.set(theme);
    applyTheme(this.root, theme);
    try {
      if (theme === 'system') {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      }
    } catch {
      // Storage can be blocked; the choice then lasts for the visit.
    }
  }
}
