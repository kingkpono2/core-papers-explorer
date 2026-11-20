import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject, of } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { CoreApiService } from '../../../core/api/core-api.service';
import { Paper, SearchResult } from '../../../core/models/paper';
import { syntheticPapers } from '../../../../testing/galaxy.fixture';
import { makePaper } from '../../../../testing/paper.fixture';
import { GalaxyInput, analyseGalaxy } from '../analysis/galaxy-analysis';
import { GalaxyAnalyser } from '../galaxy-analyser';
import { GalaxyPage } from './galaxy-page';

const papers = (count: number): Paper[] =>
  syntheticPapers(10)
    .slice(0, count)
    .map((paper, i) => makePaper({ id: String(i + 1), ...paper }));
const resultOf = (list: Paper[], total = 4_330): SearchResult => ({
  total,
  papers: list,
  limit: 100,
  offset: 0,
});

describe('GalaxyPage', () => {
  let harness: RouterTestingHarness;
  let el: HTMLElement;
  let responses: Subject<SearchResult>[];
  let searchWorks: jasmine.Spy;
  let analyse: jasmine.Spy;

  const stable = () => harness.fixture.whenStable();
  const url = () => TestBed.inject(Router).url;
  const text = (selector: string) =>
    el.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();

  const open = async (path: string) => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(path, GalaxyPage);
    el = harness.routeNativeElement!;
    await stable();
  };
  const respond = async (result: SearchResult) => {
    responses.at(-1)!.next(result);
    responses.at(-1)!.complete();
    await stable();
    await new Promise(requestAnimationFrame);
    await stable();
  };

  beforeEach(() => {
    responses = [];
    searchWorks = jasmine.createSpy('searchWorks').and.callFake(() => {
      const response = new Subject<SearchResult>();
      responses.push(response);
      return response;
    });
    analyse = jasmine
      .createSpy('analyse')
      .and.callFake((input: GalaxyInput) => of({ ...analyseGalaxy(input), thread: 'worker' }));
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'galaxy', component: GalaxyPage },
          { path: '', children: [] },
        ]),
        { provide: CoreApiService, useValue: { searchWorks } },
      ],
    });
    TestBed.overrideComponent(GalaxyPage, {
      set: { providers: [{ provide: GalaxyAnalyser, useValue: { analyse } }] },
    });
  });

  it('offers example searches before there is a query, and asks CORE nothing', async () => {
    await open('/galaxy');

    expect(text('h1')).toBe('Research galaxy');
    expect(text('app-empty-state .heading')).toBe('Pick a search to map');
    expect(el.querySelectorAll('app-empty-state .chip').length).toBe(3);
    expect(searchWorks).not.toHaveBeenCalled();
  });

  it('maps an example when it is picked, putting it in the URL', async () => {
    await open('/galaxy');
    el.querySelector<HTMLButtonElement>('app-empty-state .chip')!.click();
    await stable();

    expect(url()).toBe('/galaxy?q=drone%20AND%20delivery');
    expect(searchWorks).toHaveBeenCalledOnceWith({
      query: 'drone AND delivery',
      limit: 100,
      offset: 0,
    });
  });

  it('never sends a query with errors', async () => {
    await open('/galaxy?q=drone%20AND%20(');

    expect(text('app-empty-state .heading')).toBe('Check the search');
    expect(searchWorks).not.toHaveBeenCalled();
  });

  it('fetches the 100 most relevant papers in one request, as CORE needs the query', async () => {
    await open('/galaxy?q=(drone%20AND%20(package%20OR%20delivery))');

    expect(searchWorks).toHaveBeenCalledOnceWith({
      query: 'drone AND (package OR delivery)',
      limit: 100,
      offset: 0,
    });
    expect(text('.summary')).toBe(
      'Fetching the 100 most relevant papers for “(drone AND (package OR delivery))”…',
    );
    expect(text('[role="status"] .notice')).toContain(
      'CORE ignores an OR group nested inside other brackets',
    );
    expect(el.querySelector('app-galaxy-map section')?.getAttribute('aria-busy')).toBe('true');
  });

  it('draws the galaxy once the papers arrive, merging duplicate records', async () => {
    await open('/galaxy?q=drone%20AND%20delivery');
    const list = papers(40);
    await respond(resultOf([...list, { ...list[0], id: '99' }]));

    expect(text('.summary')).toBe(
      'The 40 papers most relevant to “drone AND delivery” (1 duplicate record merged), of 4,330 matches',
    );
    expect(el.querySelectorAll('app-galaxy-sky a.star').length).toBe(40);
    expect(analyse).toHaveBeenCalledTimes(1);
    expect(text('app-galaxy-map .footnote')).toContain('1 duplicate record from CORE was merged');
  });

  it('switches to the results for the same query', async () => {
    await open('/galaxy?q=drone%20AND%20delivery');
    const links = [...el.querySelectorAll<HTMLAnchorElement>('app-view-switch a')];

    expect(links.map((a) => a.textContent?.trim())).toEqual(['Results', 'Galaxy']);
    expect(links[0].getAttribute('href')).toBe('/?q=drone%20AND%20delivery');
    expect(links[1].getAttribute('aria-current')).toBe('page');
  });

  it('lists the papers instead when there are too few for topics', async () => {
    await open('/galaxy?q=drone%20AND%20sonar');
    await respond(resultOf(papers(5), 5));

    expect(text('#few-heading')).toBe('Too few papers for a galaxy');
    expect(el.querySelectorAll('.few__list a[target="_blank"]').length).toBe(5);
    expect(el.querySelector('app-galaxy-map')).toBeNull();
    expect(analyse).not.toHaveBeenCalled();
  });

  it('says when nothing matches', async () => {
    await open('/galaxy?q=qwxzv');
    await respond(resultOf([], 0));

    expect(text('app-empty-state .heading')).toBe('No papers found');
    expect(text('.summary')).toBe('No papers found for “qwxzv”');
  });

  it('shows the error and retries the same request', async () => {
    await open('/galaxy?q=drone');
    responses[0].error(new ApiError('rate-limit', 429));
    await stable();

    expect(text('app-error-state .heading')).toBe('Too many searches');
    el.querySelector<HTMLButtonElement>('app-error-state button')!.click();
    await stable();

    expect(searchWorks).toHaveBeenCalledTimes(2);
  });

  it('reuses papers already fetched for the same query', async () => {
    await open('/galaxy?q=drone%20AND%20delivery');
    await respond(resultOf(papers(40)));
    await harness.navigateByUrl('/galaxy?q=drone');
    await harness.navigateByUrl('/galaxy?q=drone%20AND%20delivery');
    await stable();

    expect(searchWorks).toHaveBeenCalledTimes(2);
    expect(searchWorks.calls.argsFor(1)[0].query).toBe('drone');
  });
});
