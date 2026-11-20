import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, Subscription } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import { CoreApiService } from '../../core/api/core-api.service';
import { YearCounts } from '../../core/models/paper';
import { CompareTrends, TrendState } from './compare-trends';

const counts = (count: number): YearCounts => ({
  counts: [{ year: 2020, count }],
  truncated: false,
});

describe('CompareTrends', () => {
  let service: CompareTrends;
  let countByYear: jasmine.Spy;
  let pending: Map<string, Subject<YearCounts>>;
  let retries: Subject<number>;
  let states: TrendState[][];
  let subscription: Subscription;

  const latest = () => states.at(-1)!.map((state) => state.status);
  const respond = (query: string, value: YearCounts) => {
    const response = pending.get(query)!;
    response.next(value);
    response.complete();
  };
  const start = (queries: string[]) => {
    subscription = service.load(queries, retries).subscribe((value) => states.push(value));
  };

  beforeEach(() => {
    pending = new Map();
    countByYear = jasmine.createSpy('countByYear').and.callFake((query: string) => {
      const response = new Subject<YearCounts>();
      pending.set(query, response);
      return response;
    });
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: CoreApiService, useValue: { countByYear } },
      ],
    });
    service = TestBed.inject(CompareTrends);
    retries = new Subject();
    states = [];
  });

  afterEach(() => subscription?.unsubscribe());

  it('starts with every series loading and asks CORE once per query, two at a time', () => {
    start(['a', 'b', 'c']);

    expect(latest()).toEqual(['loading', 'loading', 'loading']);
    expect(countByYear.calls.allArgs()).toEqual([['a'], ['b']]);

    respond('a', counts(1));
    expect(countByYear.calls.allArgs()).toEqual([['a'], ['b'], ['c']]);
    expect(latest()).toEqual(['success', 'loading', 'loading']);

    respond('c', counts(3));
    respond('b', counts(2));
    expect(states.at(-1)).toEqual([
      { status: 'success', counts: counts(1) },
      { status: 'success', counts: counts(2) },
      { status: 'success', counts: counts(3) },
    ]);
  });

  it('keeps the other series when one fails, and retries only that one', () => {
    start(['a', 'b']);
    respond('a', counts(1));
    pending.get('b')!.error(new ApiError('rate-limit', 429));
    expect(latest()).toEqual(['success', 'error']);

    retries.next(1);
    expect(countByYear).toHaveBeenCalledTimes(3);
    expect(countByYear.calls.mostRecent().args).toEqual(['b']);
    expect(latest()).toEqual(['success', 'loading']);

    respond('b', counts(2));
    expect(latest()).toEqual(['success', 'success']);
  });

  it('ignores retries for series that do not exist', () => {
    start(['a', 'b']);
    retries.next(5);
    retries.next(-1);

    expect(countByYear).toHaveBeenCalledTimes(2);
  });

  it('answers from the session cache shared with the search page chart', () => {
    start(['a', 'b']);
    respond('a', counts(1));
    respond('b', counts(2));
    subscription.unsubscribe();
    states = [];

    start(['b', 'a']);
    expect(countByYear).toHaveBeenCalledTimes(2);
    expect(latest()).toEqual(['success', 'success']);
  });

  it('cancels requests in flight when unsubscribed', () => {
    start(['a', 'b', 'c']);
    subscription.unsubscribe();

    expect(pending.get('a')!.observed).toBeFalse();
    expect(pending.get('b')!.observed).toBeFalse();
    expect(pending.has('c')).toBeFalse();
  });
});
