import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { CoreApiService } from '../../../core/api/core-api.service';
import { YearCounts } from '../../../core/models/paper';
import { PublicationYears } from './publication-years';

describe('PublicationYears', () => {
  const answer: YearCounts = { counts: [{ year: 2020, count: 354 }], truncated: false };
  let countByYear: jasmine.Spy<(query: string) => Observable<YearCounts>>;
  let years: PublicationYears;

  beforeEach(() => {
    countByYear = jasmine.createSpy('countByYear').and.returnValue(of(answer));
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: CoreApiService, useValue: { countByYear } },
      ],
    });
    years = TestBed.inject(PublicationYears);
  });

  const read = (query: string) => {
    let result: YearCounts | undefined;
    years.countByYear(query).subscribe((value) => (result = value));
    return result;
  };

  it('asks CORE once per query', () => {
    expect(read('drone')).toEqual(answer);
    expect(read('drone')).toEqual(answer);
    expect(read('uav')).toEqual(answer);

    expect(countByYear.calls.allArgs()).toEqual([['drone'], ['uav']]);
  });

  it('does not keep failures', () => {
    countByYear.and.returnValue(throwError(() => new ApiError('server')));
    years.countByYear('drone').subscribe({ error: () => undefined });
    countByYear.and.returnValue(of(answer));

    expect(read('drone')).toEqual(answer);
    expect(countByYear).toHaveBeenCalledTimes(2);
  });

  it('does not keep a request that was cancelled', () => {
    const pending = new Subject<YearCounts>();
    countByYear.and.returnValue(pending);
    years.countByYear('drone').subscribe().unsubscribe();
    countByYear.and.returnValue(of(answer));

    read('drone');
    expect(countByYear).toHaveBeenCalledTimes(2);
  });

  it('forgets the least recently used query beyond 20', () => {
    read('q0');
    for (let i = 1; i <= 20; i++) {
      read(`q${i}`);
      read('q0');
    }
    countByYear.calls.reset();

    read('q0');
    read('q1');

    expect(countByYear.calls.allArgs()).toEqual([['q1']]);
  });
});
