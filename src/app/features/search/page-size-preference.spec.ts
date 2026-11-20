import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PAGE_SIZE_STORAGE_KEY, PageSizePreference } from './page-size-preference';

describe('PageSizePreference', () => {
  /** A fresh instance, as on a new visit. */
  const create = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    return TestBed.inject(PageSizePreference);
  };

  afterEach(() => localStorage.removeItem(PAGE_SIZE_STORAGE_KEY));

  it('is empty until the user picks a size', () => {
    expect(create().size()).toBeNull();
  });

  it('saves the size for the next visit', () => {
    create().set(50);

    expect(localStorage.getItem(PAGE_SIZE_STORAGE_KEY)).toBe('50');
    expect(create().size()).toBe(50);
  });

  it('repairs a saved value that is no longer valid', () => {
    localStorage.setItem(PAGE_SIZE_STORAGE_KEY, '999');
    expect(create().size()).toBe(100);
  });

  it('keeps working when storage is blocked', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('SecurityError');
    spyOn(Storage.prototype, 'setItem').and.throwError('SecurityError');
    const preference = create();

    expect(preference.size()).toBeNull();
    preference.set(25);
    expect(preference.size()).toBe(25);
  });
});
