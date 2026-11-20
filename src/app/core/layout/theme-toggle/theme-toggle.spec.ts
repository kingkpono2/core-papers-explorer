import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { THEME_STORAGE_KEY, ThemePreference } from '../../theme/theme-preference';
import { ThemeToggle } from './theme-toggle';

describe('ThemeToggle', () => {
  afterEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.removeAttribute('data-theme');
  });

  it('offers labelled system, light and dark options and applies the one chosen', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(ThemeToggle);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const radios = [...el.querySelectorAll<HTMLInputElement>('input[type="radio"]')];

    expect(el.querySelector('legend')?.textContent).toBe('Colour theme');
    expect(radios.map((r) => r.labels?.[0]?.textContent?.trim())).toEqual([
      'Match system',
      'Light',
      'Dark',
    ]);
    expect(radios.map((r) => r.checked)).toEqual([false, true, false]);

    radios[2].click();
    await fixture.whenStable();

    expect(TestBed.inject(ThemePreference).theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
