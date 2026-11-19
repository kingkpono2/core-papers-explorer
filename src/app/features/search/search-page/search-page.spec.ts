import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { CoreApiService } from '../../../core/api/core-api.service';
import { Paper, SearchResult } from '../../../core/models/paper';
import { makePaper } from '../../../../testing/paper.fixture';
import { SearchPage } from './search-page';

const resultOf = (total: number, papers: Paper[]): SearchResult => ({
  total,
  papers,
  limit: 10,
  offset: 0,
});

describe('SearchPage', () => {
  let fixture: ComponentFixture<SearchPage>;
  let el: HTMLElement;
  let responses: Subject<SearchResult>[];
  let searchWorks: jasmine.Spy;

  const summary = () => el.querySelector('[aria-live="polite"]')?.textContent?.trim();
  const results = () => el.querySelector<HTMLElement>('section.results')!;

  const submit = async (query?: string) => {
    const input = el.querySelector<HTMLInputElement>('input#query')!;
    if (query !== undefined) {
      input.value = query;
      input.dispatchEvent(new Event('input'));
    }
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
  };

  const respond = async (result: SearchResult) => {
    responses.at(-1)!.next(result);
    await fixture.whenStable();
  };

  const fail = async (error: ApiError) => {
    responses.at(-1)!.error(error);
    await fixture.whenStable();
  };

  beforeEach(async () => {
    responses = [];
    searchWorks = jasmine.createSpy('searchWorks').and.callFake(() => {
      const response = new Subject<SearchResult>();
      responses.push(response);
      return response;
    });

    await TestBed.configureTestingModule({
      imports: [SearchPage],
      providers: [
        provideZonelessChangeDetection(),
        { provide: CoreApiService, useValue: { searchWorks } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SearchPage);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  it('renders a labelled search field with an example boolean query', () => {
    const input = el.querySelector<HTMLInputElement>('input#query');

    expect(input?.labels?.[0]?.textContent).toContain('Keywords');
    expect(input?.placeholder).toBe('(drone AND (package OR delivery))');
    expect(input?.value).toBe('drone');
  });

  it('starts with a prompt and example queries that run a search', async () => {
    expect(results().textContent).toContain('Search to begin');

    const example = el.querySelector<HTMLButtonElement>('app-empty-state .chip')!;
    example.click();
    await fixture.whenStable();

    expect(searchWorks).toHaveBeenCalledOnceWith({
      query: '(drone AND (package OR delivery))',
      limit: 10,
    });
    expect(el.querySelector<HTMLInputElement>('input#query')?.value).toBe(
      '(drone AND (package OR delivery))',
    );
  });

  it('searches for the trimmed query and ignores a blank one', async () => {
    await submit('   ');
    expect(searchWorks).not.toHaveBeenCalled();

    await submit('  robots  ');
    expect(searchWorks).toHaveBeenCalledOnceWith({ query: 'robots', limit: 10 });
  });

  it('shows skeleton cards while loading', async () => {
    await submit();

    expect(el.querySelectorAll('app-skeleton-card').length).toBe(3);
    expect(results().getAttribute('aria-busy')).toBe('true');
    expect(summary()).toBe('Searching CORE for “drone”…');
  });

  it('lists the papers, announces the total and focuses the results heading', async () => {
    await submit();
    await respond(
      resultOf(71213, [
        makePaper({ id: '1', title: 'Drone delivery' }),
        makePaper({ id: '2', title: 'Swarm robotics' }),
      ]),
    );

    expect(summary()).toBe('71,213 papers found for “drone”');
    const cards = el.querySelectorAll('ol > li > app-paper-card article');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('Drone delivery');
    expect(el.querySelector('app-skeleton-card')).toBeNull();
    expect(results().getAttribute('aria-busy')).toBe('false');
    expect(document.activeElement).toBe(el.querySelector('#results-heading'));
  });

  it('shows an empty state when nothing matches', async () => {
    await submit('qwxzv');
    await respond(resultOf(0, []));

    expect(summary()).toBe('No papers found for “qwxzv”');
    expect(el.querySelector('app-empty-state')?.textContent).toContain('Nothing matched “qwxzv”');
    expect(el.querySelector('ol')).toBeNull();
  });

  it('shows the error and retries the same query', async () => {
    await submit('drones');
    await fail(new ApiError('rate-limit', 429));

    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'CORE is limiting how often we can search',
    );
    expect(document.activeElement).toBe(el.querySelector('#results-heading'));

    el.querySelector<HTMLButtonElement>('app-error-state button')!.click();
    await fixture.whenStable();

    expect(searchWorks).toHaveBeenCalledTimes(2);
    expect(searchWorks.calls.mostRecent().args).toEqual([{ query: 'drones', limit: 10 }]);
    expect(el.querySelectorAll('app-skeleton-card').length).toBe(3);
  });

  it('cancels the in-flight request when a new search starts', async () => {
    await submit('first');
    await submit('second');

    expect(responses[0].observed).toBeFalse();
    expect(responses[1].observed).toBeTrue();
  });
});
