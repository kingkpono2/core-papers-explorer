import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { THEME_STORAGE_KEY, ThemePreference, applyTheme, storedTheme } from './theme-preference';

describe('theme preference', () => {
  const root = document.documentElement;

  beforeEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    root.removeAttribute('data-theme');
  });

  it('reads the saved theme, falling back to the system setting', () => {
    expect(storedTheme()).toBe('system');

    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(storedTheme()).toBe('dark');

    localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(storedTheme()).toBe('system');
  });

  it('marks the root element only for an explicit choice', () => {
    applyTheme(root, 'light');
    expect(root.getAttribute('data-theme')).toBe('light');

    applyTheme(root, 'system');
    expect(root.hasAttribute('data-theme')).toBeFalse();
  });

  it('applies and saves the choice, and forgets it for the system setting', () => {
    const preference = TestBed.inject(ThemePreference);
    expect(preference.theme()).toBe('system');

    preference.set('dark');
    expect(preference.theme()).toBe('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    preference.set('system');
    expect(root.hasAttribute('data-theme')).toBeFalse();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('switches the colour tokens', () => {
    const background = () => getComputedStyle(root).getPropertyValue('--color-bg').trim();

    applyTheme(root, 'dark');
    expect(background()).toBe('#0f1419');

    applyTheme(root, 'light');
    expect(background()).toBe('#f5f7fa');
  });
});
