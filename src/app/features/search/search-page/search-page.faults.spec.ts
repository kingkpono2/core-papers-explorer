import { HttpRequest, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { FaultInjection } from '../../../core/diagnostics/fault-injection';
import { MONOTONIC_NOW, RequestLog } from '../../../core/diagnostics/request-log';
import { apiKeyInterceptor } from '../../../core/interceptors/api-key.interceptor';
import { underTheHoodInterceptor } from '../../../core/interceptors/under-the-hood.interceptor';
import { CoreSearchResponse } from '../../../core/models/core-api.models';
import { RECENT_SEARCHES_STORAGE_KEY } from '../recent-searches';
import { REVIEWER_TOUR_STORAGE_KEY } from '../reviewer-tour/reviewer-tour-preference';
import { SearchPage } from './search-page';

/**
 * Each Break it switch against the real search page, API service, retry policy and interceptors,
 * with only the network replaced: the app has to meet a faked failure exactly as it would a real
 * one, with the same waits, messages and Retry button.
 */
describe('SearchPage with Break it switches', () => {
  const isSearch = (req: HttpRequest<unknown>) => req.url === '/core-api/v3/search/works/';
  const isAggregate = (req: HttpRequest<unknown>) =>
    req.url === '/core-api/v3/search/works/aggregate';
  const found = (title: string): CoreSearchResponse => ({
    totalHits: 1,
    limit: 10,
    offset: 0,
    results: [{ id: 1, title }],
  });

  let harness: RouterTestingHarness;
  let el: HTMLElement;
  let http: HttpTestingController;
  let faults: FaultInjection;
  let log: RequestLog;

  const stable = () => harness.fixture.whenStable();
  const summary = () => el.querySelector('.summary')?.textContent?.trim();
  const alertText = () =>
    el.querySelector('app-error-state [role="alert"]')?.textContent?.replace(/\s+/g, ' ');
  const retryButton = () => el.querySelector<HTMLButtonElement>('app-error-state button');
  const placeholders = () => el.querySelectorAll('app-skeleton-card').length;
  const searchAttempts = () =>
    [...log.entries()]
      .reverse()
      .filter((entry) => entry.endpoint === '/search/works/' && entry.source === 'network');

  const search = async (query = 'drone') => {
    const input = el.querySelector<HTMLInputElement>('input#query')!;
    input.value = query;
    input.dispatchEvent(new Event('input'));
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await stable();
  };

  const wait = async (ms: number) => {
    jasmine.clock().tick(ms);
    await stable();
  };

  const answer = async (title = 'Drone delivery in cities') => {
    http.expectOne(isSearch).flush(found(title));
    await stable();
  };

  beforeEach(async () => {
    localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
    localStorage.setItem(REVIEWER_TOUR_STORAGE_KEY, 'true');
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '', component: SearchPage }]),
        provideLocationMocks(),
        provideHttpClient(withInterceptors([apiKeyInterceptor, underTheHoodInterceptor])),
        provideHttpClientTesting(),
        { provide: MONOTONIC_NOW, useValue: () => Date.now() },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    faults = TestBed.inject(FaultInjection);
    log = TestBed.inject(RequestLog);
    harness = await RouterTestingHarness.create();
    TestBed.inject(Router).setUpLocationChangeListener();
    await harness.navigateByUrl('/', SearchPage);
    el = harness.routeNativeElement!;
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-11-20T10:00:00Z'));
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    // The chart asks for its counts after the results; these tests are about the results.
    http.match(isAggregate);
    http.verify();
    localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
    localStorage.removeItem(REVIEWER_TOUR_STORAGE_KEY);
  });

  it('rate limited: waits twice as CORE asks, then shows the results', async () => {
    faults.set('rate-limit', true);
    await search();

    expect(summary()).toBe('Searching CORE for “drone”…');
    expect(placeholders()).toBe(3);
    await wait(3_000);
    http.expectNone(isSearch);
    expect(placeholders()).toBe(3);
    await wait(3_000);
    await answer();

    expect(summary()).toBe('Showing 1 of 1 paper for “drone”');
    expect(alertText()).toBeUndefined();
    expect(searchAttempts().map((entry) => [entry.attempt, entry.status, entry.injected])).toEqual([
      [1, 429, 'rate-limit'],
      [2, 429, 'rate-limit'],
      [3, 200, null],
    ]);
  });

  it('offline: retries after 1, 2 and 4 s, says CORE cannot be reached, and Retry recovers', async () => {
    faults.set('offline', true);
    await search();

    for (const ms of [1_000, 2_000, 4_000]) {
      expect(alertText()).toBeUndefined();
      await wait(ms);
    }
    http.expectNone(isSearch);
    expect(alertText()).toContain('Could not reach CORE. Check your connection and try again.');
    expect(searchAttempts().length).toBe(4);

    faults.turnOff();
    retryButton()!.click();
    await stable();
    await answer();

    expect(summary()).toBe('Showing 1 of 1 paper for “drone”');
  });

  it('slow CORE: keeps the placeholders up for 5 s, then shows the results', async () => {
    faults.set('slow', true);
    await search();

    await wait(4_999);
    http.expectNone(isSearch);
    expect(placeholders()).toBe(3);
    await wait(1);
    await answer();

    expect(summary()).toBe('Showing 1 of 1 paper for “drone”');
    expect(searchAttempts()[0].injectedDelayMs).toBe(5_000);
  });

  it('CORE rejects the query: asks for the query to be checked, without retrying or Retry', async () => {
    faults.set('rejected', true);
    await search();

    expect(alertText()).toContain(
      'CORE could not run this search. Check the field names and quotes, or simplify the query.',
    );
    expect(retryButton()).toBeNull();
    await wait(10_000);
    http.expectNone(isSearch);
    expect(searchAttempts().length).toBe(1);
  });

  it('CORE unavailable: retries after 1, 2 and 4 s, then says CORE is having trouble, with Retry', async () => {
    faults.set('unavailable', true);
    await search();

    await wait(1_000);
    await wait(2_000);
    expect(alertText()).toBeUndefined();
    await wait(4_000);

    expect(alertText()).toContain('CORE is having trouble right now. Try again in a moment.');
    expect(retryButton()?.textContent?.trim()).toBe('Retry');
    expect(searchAttempts().map((entry) => entry.status)).toEqual([503, 503, 503, 503]);
  });

  it('still answers from memory with a switch on, without a request', async () => {
    await search('drone');
    await answer('Drone paper');
    await search('robots');
    await answer('Robot paper');
    faults.set('offline', true);

    TestBed.inject(Location).back();
    // The router reacts to popstate in a timeout.
    await wait(1);

    http.expectNone(isSearch);
    expect(el.textContent).toContain('Drone paper');
    expect(searchAttempts().map((entry) => entry.query)).toEqual(['drone', 'robots']);
    expect(log.entries()).toContain(
      jasmine.objectContaining({ source: 'memory', endpoint: '/search/works/', query: 'drone' }),
    );
  });
});
