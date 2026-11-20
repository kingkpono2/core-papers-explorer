import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { REVIEWER_TOUR_STORAGE_KEY, ReviewerTourPreference } from './reviewer-tour-preference';

describe('ReviewerTourPreference', () => {
  const create = () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    return TestBed.inject(ReviewerTourPreference);
  };

  beforeEach(() => localStorage.removeItem(REVIEWER_TOUR_STORAGE_KEY));
  afterEach(() => localStorage.removeItem(REVIEWER_TOUR_STORAGE_KEY));

  it('is not dismissed at first', () => {
    expect(create().dismissed()).toBeFalse();
  });

  it('remembers a dismissal', () => {
    create().dismiss();
    expect(localStorage.getItem(REVIEWER_TOUR_STORAGE_KEY)).toBe('true');
  });

  it('reads an earlier dismissal', () => {
    localStorage.setItem(REVIEWER_TOUR_STORAGE_KEY, 'true');
    expect(create().dismissed()).toBeTrue();
  });

  it('still hides the tour for the visit when storage is blocked', () => {
    spyOn(localStorage, 'setItem').and.throwError('blocked');
    const preference = create();
    preference.dismiss();
    expect(preference.dismissed()).toBeTrue();
  });
});
