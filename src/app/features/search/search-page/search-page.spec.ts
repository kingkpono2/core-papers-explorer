import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { CoreApiService } from '../../../core/api/core-api.service';
import { Paper, SearchResult, YearCounts } from '../../../core/models/paper';
import { makePaper } from '../../../../testing/paper.fixture';
import { PAGE_SIZE_STORAGE_KEY } from '../page-size-preference';
import { RECENT_SEARCHES_STORAGE_KEY, RecentSearches } from '../recent-searches';
import { SearchPage } from './search-page';

const papers = (count: number, offset = 0): Paper[] =>
  Array.from({ length: count }, (_, i) =>
    makePaper({ id: String(offset + i + 1), title: `Paper ${offset + i + 1}` }),
  );

const resultOf = (total: number, list: Paper[], offset = 0): SearchResult => ({
  total,
  papers: list,
  limit: 10,
  offset,
});

describe('SearchPage', () => {
  let harness: RouterTestingHarness;
  let el: HTMLElement;
  let responses: Subject<SearchResult>[];
  let searchWorks: jasmine.Spy;
  let yearResponses: Subject<YearCounts>[];
  let countByYear: jasmine.Spy;

  const stable = () => harness.fixture.whenStable();
  const url = () => TestBed.inject(Router).url;
  const summary = () => el.querySelector('.summary[aria-live="polite"]')?.textContent?.trim();
  const results = () => el.querySelector<HTMLElement>('section.results')!;
  const input = () => el.querySelector<HTMLInputElement>('input#query')!;
  const pageSize = () => el.querySelector<HTMLSelectElement>('select#page-size')!;
  const lastRequest = () => searchWorks.calls.mostRecent().args[0];
  const recentQueries = () => TestBed.inject(RecentSearches).queries();
  const pageLink = (name: string) =>
    [...el.querySelectorAll<HTMLAnchorElement>('app-pagination a[href]')].find(
      (a) => a.textContent?.replace(/\s+/g, ' ').trim() === name,
    )!;

  const open = async (path = '/') => {
    harness = await RouterTestingHarness.create();
    // Normally done at bootstrap; without it the router does not react to Back and Forward.
    TestBed.inject(Router).setUpLocationChangeListener();
    await harness.navigateByUrl(path, SearchPage);
    el = harness.routeNativeElement!;
    await stable();
  };

  const submit = async (query?: string) => {
    if (query !== undefined) {
      input().value = query;
      input().dispatchEvent(new Event('input'));
    }
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await stable();
  };

  const selectPageSize = async (size: string) => {
    pageSize().value = size;
    pageSize().dispatchEvent(new Event('change'));
    await stable();
  };

  const back = async () => {
    TestBed.inject(Location).back();
    // The router reacts to popstate in a setTimeout, which whenStable does not wait for.
    await new Promise((resolve) => setTimeout(resolve));
    await stable();
  };

  const respond = async (result: SearchResult) => {
    responses.at(-1)!.next(result);
    await stable();
  };

  const fail = async (error: ApiError) => {
    responses.at(-1)!.error(error);
    await stable();
  };

  beforeEach(() => {
    localStorage.removeItem(PAGE_SIZE_STORAGE_KEY);
    localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
    responses = [];
    searchWorks = jasmine.createSpy('searchWorks').and.callFake(() => {
      const response = new Subject<SearchResult>();
      responses.push(response);
      return response;
    });
    yearResponses = [];
    countByYear = jasmine.createSpy('countByYear').and.callFake(() => {
      const response = new Subject<YearCounts>();
      yearResponses.push(response);
      return response;
    });

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '', component: SearchPage }]),
        provideLocationMocks(),
        { provide: CoreApiService, useValue: { searchWorks, countByYear } },
      ],
    });
  });

  afterEach(() => {
    localStorage.removeItem(PAGE_SIZE_STORAGE_KEY);
    localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
  });

  describe('search form', () => {
    beforeEach(() => open());

    it('renders an empty, labelled search field with an example boolean query', () => {
      expect(input().labels?.[0]?.textContent).toContain('Keywords');
      expect(input().placeholder).toBe('(drone AND (package OR delivery))');
      expect(input().value).toBe('');
    });

    it('has a labelled page size control with presets up to 100', () => {
      expect(pageSize().labels?.[0]?.textContent).toContain('Results per page');
      expect([...pageSize().options].map((option) => option.value)).toEqual([
        '10',
        '25',
        '50',
        '100',
      ]);
      expect(pageSize().value).toBe('10');
    });

    it('starts with a prompt and example queries that run a search', async () => {
      expect(results().textContent).toContain('Search to begin');
      expect(searchWorks).not.toHaveBeenCalled();

      el.querySelector<HTMLButtonElement>('app-empty-state .chip')!.click();
      await stable();

      // CORE ignores the inner OR group when the whole query is in brackets, so they are dropped.
      expect(searchWorks).toHaveBeenCalledOnceWith({
        query: 'drone AND (package OR delivery)',
        limit: 10,
        offset: 0,
      });
      expect(input().value).toBe('(drone AND (package OR delivery))');
      expect(url()).toBe('/?q=(drone%20AND%20(package%20OR%20delivery))&size=10');
    });

    it('searches for the normalised query and refuses a blank one', async () => {
      await submit('   ');
      expect(searchWorks).not.toHaveBeenCalled();
      expect(url()).toBe('/');
      expect(el.querySelector('#query-problems')?.textContent).toContain(
        'Enter something to search for.',
      );

      await submit('  robots   and  drones ');
      expect(searchWorks).toHaveBeenCalledOnceWith({
        query: 'robots and drones',
        limit: 10,
        offset: 0,
      });
      expect(url()).toBe('/?q=robots%20and%20drones&size=10');
    });

    it('does not send a query with errors', async () => {
      await submit('drone AND (');

      expect(searchWorks).not.toHaveBeenCalled();
      expect(url()).toBe('/');
      expect(input().getAttribute('aria-invalid')).toBe('true');
    });

    it('marks the query terms in the results', async () => {
      await submit('drone NOT military');
      await respond(
        resultOf(1, [makePaper({ title: 'Military drone delivery', abstract: 'Drones at sea.' })]),
      );

      const marks = [...el.querySelectorAll('app-paper-card mark')].map((m) => m.textContent);
      expect(marks).toEqual(['drone', 'Drones']);
    });

    it('remembers successful searches', async () => {
      await submit('robots');
      expect(recentQueries()).toEqual([]);

      await respond(resultOf(1, papers(1)));
      expect(recentQueries()).toEqual(['robots']);
      expect(el.querySelector('.recent')?.textContent).toContain('robots');
    });

    it('shows skeleton cards while loading', async () => {
      await submit('drone');

      expect(el.querySelectorAll('app-skeleton-card').length).toBe(3);
      expect(results().getAttribute('aria-busy')).toBe('true');
      expect(summary()).toBe('Searching CORE for “drone”…');
    });

    it('lists the papers, announces the range and total and focuses the results heading', async () => {
      await submit('drone');
      await respond(
        resultOf(71213, [makePaper({ id: '1', title: 'Drone delivery' }), ...papers(9, 1)]),
      );

      expect(summary()).toBe('Showing 1–10 of 71,213 papers for “drone”');
      const cards = el.querySelectorAll('ol > li > app-paper-card article');
      expect(cards.length).toBe(10);
      expect(cards[0].textContent).toContain('Drone delivery');
      expect(el.querySelector('app-skeleton-card')).toBeNull();
      expect(results().getAttribute('aria-busy')).toBe('false');
      expect(document.activeElement).toBe(el.querySelector('#results-heading'));
    });

    it('uses the singular for one paper', async () => {
      await submit('unique');
      await respond(resultOf(1, papers(1)));

      expect(summary()).toBe('Showing 1 of 1 paper for “unique”');
      expect(el.querySelector('app-pagination')).toBeNull();
    });

    it('shows an empty state when nothing matches', async () => {
      await submit('qwxzv');
      await respond(resultOf(0, []));

      expect(summary()).toBe('No papers found for “qwxzv”');
      expect(el.querySelector('app-empty-state')?.textContent).toContain('Nothing matched “qwxzv”');
      expect(el.querySelector('ol')).toBeNull();
    });

    it('shows the error and retries the same search', async () => {
      await submit('drones');
      await fail(new ApiError('rate-limit', 429));

      expect(el.querySelector('[role="alert"]')?.textContent).toContain(
        'CORE is limiting how often we can search',
      );
      expect(document.activeElement).toBe(el.querySelector('#results-heading'));

      el.querySelector<HTMLButtonElement>('app-error-state button')!.click();
      await stable();

      expect(searchWorks).toHaveBeenCalledTimes(2);
      expect(lastRequest()).toEqual({ query: 'drones', limit: 10, offset: 0 });
      expect(el.querySelectorAll('app-skeleton-card').length).toBe(3);
    });

    it('cancels the in-flight request when a new search starts', async () => {
      await submit('first');
      await submit('second');

      expect(responses[0].observed).toBeFalse();
      expect(responses[1].observed).toBeTrue();
    });
  });

  describe('one request per action', () => {
    it('sends a single request per search', async () => {
      await open();

      await submit('drone');
      expect(searchWorks).toHaveBeenCalledTimes(1);

      await submit('robots');
      expect(searchWorks).toHaveBeenCalledTimes(2);
    });

    it('runs the same search again with a single request', async () => {
      await open('/?q=drone&size=10');
      await respond(resultOf(30, papers(10)));

      await submit('drone');

      expect(searchWorks).toHaveBeenCalledTimes(2);
      expect(url()).toBe('/?q=drone&size=10');
    });

    it('sends nothing for a link with an invalid query and explains why', async () => {
      await open('/?q=drone%20AND%20(&size=10');

      expect(searchWorks).not.toHaveBeenCalled();
      expect(results().textContent).toContain('so it was not sent to CORE');
      expect(el.querySelector('#query-problems')?.textContent).toContain(
        'This bracket is never closed.',
      );
    });

    it('sends a single request when opening a link that needs repairing', async () => {
      await open('/?q=drone');

      expect(url()).toBe('/?q=drone&size=10');
      expect(searchWorks).toHaveBeenCalledOnceWith({ query: 'drone', limit: 10, offset: 0 });
    });
  });

  describe('URL state', () => {
    it('runs the search described by the URL on load', async () => {
      await open('/?q=robots&size=25&page=3');

      expect(searchWorks).toHaveBeenCalledOnceWith({ query: 'robots', limit: 25, offset: 50 });
      expect(input().value).toBe('robots');
      expect(pageSize().value).toBe('25');
    });

    it('repairs invalid params and rewrites the URL', async () => {
      await open('/?q=robots&size=999&page=-3');

      expect(searchWorks).toHaveBeenCalledOnceWith({ query: 'robots', limit: 100, offset: 0 });
      expect(url()).toBe('/?q=robots&size=100');
      expect(pageSize().value).toBe('100');
    });

    it('keeps the page size and starts again from page 1 for a new query', async () => {
      await open('/?q=drone&size=25&page=3');

      await submit('robots');

      expect(url()).toBe('/?q=robots&size=25');
      expect(lastRequest()).toEqual({ query: 'robots', limit: 25, offset: 0 });
    });

    it('restores the previous search on Back from the cache, without a request', async () => {
      await open();
      await submit('first');
      await respond(resultOf(1, [makePaper({ title: 'First paper' })]));
      await submit('second');
      await respond(resultOf(1, papers(1)));

      await back();

      expect(url()).toBe('/?q=first&size=10');
      expect(input().value).toBe('first');
      expect(searchWorks).toHaveBeenCalledTimes(2);
      expect(results().textContent).toContain('First paper');
      expect(summary()).toBe('Showing 1 of 1 paper for “first”');
    });

    it('asks CORE again on Back when the earlier search failed', async () => {
      await open();
      await submit('first');
      await fail(new ApiError('server'));
      await submit('second');
      await respond(resultOf(1, papers(1)));

      await back();

      expect(searchWorks).toHaveBeenCalledTimes(3);
      expect(lastRequest()).toEqual({ query: 'first', limit: 10, offset: 0 });
    });
  });

  describe('page size', () => {
    it('re-runs the current search from page 1 and remembers the choice', async () => {
      await open('/?q=drone&size=10&page=4');

      await selectPageSize('50');

      expect(url()).toBe('/?q=drone&size=50');
      expect(searchWorks).toHaveBeenCalledTimes(2);
      expect(lastRequest()).toEqual({ query: 'drone', limit: 50, offset: 0 });
      expect(localStorage.getItem(PAGE_SIZE_STORAGE_KEY)).toBe('50');
    });

    it('uses the saved size when the URL has none', async () => {
      localStorage.setItem(PAGE_SIZE_STORAGE_KEY, '50');
      await open('/?q=drone');

      expect(lastRequest()).toEqual({ query: 'drone', limit: 50, offset: 0 });
      expect(url()).toBe('/?q=drone&size=50');
    });

    it('lets the URL win over the saved size', async () => {
      localStorage.setItem(PAGE_SIZE_STORAGE_KEY, '50');
      await open('/?q=drone&size=25');

      expect(lastRequest()).toEqual({ query: 'drone', limit: 25, offset: 0 });
    });

    it('only saves the choice before the first search', async () => {
      await open();

      await selectPageSize('100');

      expect(searchWorks).not.toHaveBeenCalled();
      expect(url()).toBe('/');
      await submit('drone');
      expect(lastRequest()).toEqual({ query: 'drone', limit: 100, offset: 0 });
    });
  });

  describe('pagination', () => {
    it('moves between pages through the URL', async () => {
      await open('/?q=drone&size=25');
      await respond(resultOf(71213, papers(25)));

      expect(el.querySelector('nav[aria-label="Pages"]')).not.toBeNull();
      pageLink('Next').click();
      await stable();

      expect(url()).toBe('/?q=drone&size=25&page=2');
      expect(searchWorks).toHaveBeenCalledTimes(2);
      expect(lastRequest()).toEqual({ query: 'drone', limit: 25, offset: 25 });

      await respond(resultOf(71213, papers(25, 25), 25));
      expect(summary()).toBe('Showing 26–50 of 71,213 papers for “drone”');
      expect(el.querySelector('ol')?.getAttribute('start')).toBe('26');
      expect(document.activeElement).toBe(el.querySelector('#results-heading'));

      await back();

      expect(url()).toBe('/?q=drone&size=25');
      expect(summary()).toBe('Showing 1–25 of 71,213 papers for “drone”');
      expect(searchWorks).toHaveBeenCalledTimes(2);
    });

    it('stops at the 10,000th result and says why', async () => {
      await open('/?q=drone&size=25');
      await respond(resultOf(71213, papers(25)));

      expect(pageLink('Page 400')).toBeDefined();
      expect(el.querySelector('.note')?.textContent).toContain(
        'CORE only serves the first 10,000 results',
      );
    });

    it('has no note or pagination when everything fits on one page', async () => {
      await open('/?q=drone');
      await respond(resultOf(7, papers(7)));

      expect(el.querySelector('app-pagination')).toBeNull();
      expect(el.querySelector('.note')).toBeNull();
    });

    it('offers the last page when the URL points past the end', async () => {
      await open('/?q=drone&size=10&page=9');
      await respond(resultOf(30, [], 80));

      expect(summary()).toBe('Page 9 is past the end of the results for “drone”');
      const link = el.querySelector<HTMLAnchorElement>('app-empty-state a')!;
      expect(link.textContent).toContain('Go to the last page');
      link.click();
      await stable();

      expect(url()).toBe('/?q=drone&size=10&page=3');
      expect(lastRequest()).toEqual({ query: 'drone', limit: 10, offset: 20 });
    });
  });

  describe('chart', () => {
    const years: YearCounts = {
      counts: [
        { year: 2020, count: 354 },
        { year: 2026, count: 655 },
      ],
      truncated: false,
    };
    const respondYears = async () => {
      yearResponses.at(-1)!.next(years);
      await stable();
      await new Promise(requestAnimationFrame);
      await stable();
    };

    it('is blank before a search', async () => {
      await open();

      expect(el.querySelector('app-year-chart')?.textContent).toContain('Search to see when');
      expect(countByYear).not.toHaveBeenCalled();
    });

    it('asks CORE for year counts after the results, with the query as sent to CORE', async () => {
      await open('/?q=(drone AND (package OR delivery))');
      expect(countByYear).not.toHaveBeenCalled();

      await respond(resultOf(4_729, papers(10)));

      expect(countByYear).toHaveBeenCalledOnceWith('drone AND (package OR delivery)');
    });

    it('keeps the chart when only the page or page size changes', async () => {
      await open('/?q=drone');
      await respond(resultOf(71_213, papers(10)));
      await respondYears();

      pageLink('Next').click();
      await stable();
      expect(el.querySelector('app-bar-chart')).not.toBeNull();
      await respond(resultOf(71_213, papers(10, 10), 10));
      await selectPageSize('25');
      await respond(resultOf(71_213, papers(25)));

      expect(searchWorks).toHaveBeenCalledTimes(3);
      expect(countByYear).toHaveBeenCalledTimes(1);
    });

    it('asks again for a new query and drops the old request', async () => {
      await open('/?q=drone');
      await respond(resultOf(71_213, papers(10)));
      await submit('robots');

      expect(yearResponses[0].observed).toBeFalse();
      await respond(resultOf(500, papers(10)));
      expect(countByYear.calls.mostRecent().args).toEqual(['robots']);
    });

    it('searches the chosen year when a bar is selected', async () => {
      await open('/?q=(drone AND (package OR delivery))');
      await respond(resultOf(4_729, papers(10)));
      await respondYears();

      const bar = [...el.querySelectorAll<SVGRectElement>('app-bar-chart rect.hit')].find((hit) =>
        hit.getAttribute('aria-label')?.startsWith('2020'),
      )!;
      bar.dispatchEvent(new MouseEvent('click'));
      await stable();

      expect(lastRequest()).toEqual({
        query: 'drone AND (package OR delivery) AND yearPublished:2020',
        limit: 10,
        offset: 0,
      });
    });
  });
});
