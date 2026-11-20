import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  MAX_RECENT_SEARCHES,
  RECENT_SEARCHES_STORAGE_KEY,
  RecentSearches,
} from './recent-searches';

describe('RecentSearches', () => {
  /** A fresh instance, as on a new visit. */
  const create = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    return TestBed.inject(RecentSearches);
  };
  const saved = () => JSON.parse(localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY) ?? 'null');

  beforeEach(() => localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY));
  afterEach(() => localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY));

  it('keeps the most recent search first and remembers it for the next visit', () => {
    const recent = create();
    recent.add('drone');
    recent.add('robots');

    expect(recent.queries()).toEqual(['robots', 'drone']);
    expect(saved()).toEqual(['robots', 'drone']);
    expect(create().queries()).toEqual(['robots', 'drone']);
  });

  it('moves a repeated search to the front instead of listing it twice', () => {
    const recent = create();
    for (const query of ['a', 'b', 'c', 'a']) {
      recent.add(query);
    }

    expect(recent.queries()).toEqual(['a', 'c', 'b']);
  });

  it(`keeps only the last ${MAX_RECENT_SEARCHES}`, () => {
    const recent = create();
    for (let i = 1; i <= 10; i++) {
      recent.add(`query ${i}`);
    }

    expect(recent.queries().length).toBe(MAX_RECENT_SEARCHES);
    expect(recent.queries()[0]).toBe('query 10');
    expect(recent.queries().at(-1)).toBe('query 3');
  });

  it('clears the history', () => {
    const recent = create();
    recent.add('drone');
    recent.clear();

    expect(recent.queries()).toEqual([]);
    expect(localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY)).toBeNull();
  });

  it('ignores saved data it does not understand', () => {
    localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, '{"not": "a list"}');
    expect(create().queries()).toEqual([]);

    localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, '["drone", 42, "", null, "robots"]');
    expect(create().queries()).toEqual(['drone', 'robots']);

    localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, 'not json');
    expect(create().queries()).toEqual([]);
  });

  it('keeps working for the visit when storage is blocked', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('SecurityError');
    spyOn(Storage.prototype, 'setItem').and.throwError('QuotaExceededError');
    const removeItem = spyOn(Storage.prototype, 'removeItem').and.throwError('SecurityError');
    const recent = create();

    expect(recent.queries()).toEqual([]);
    recent.add('drone');
    expect(recent.queries()).toEqual(['drone']);
    recent.clear();
    expect(recent.queries()).toEqual([]);
    removeItem.and.callThrough();
  });
});
