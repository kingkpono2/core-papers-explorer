import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { CoreApiService } from '../../../core/api/core-api.service';
import { Paper, SearchResult } from '../../../core/models/paper';
import { SearchPage } from './search-page';

const paper = (id: string, title: string, overrides: Partial<Paper> = {}): Paper => ({
  id,
  title,
  authors: [],
  abstract: null,
  year: null,
  publishedDate: null,
  doi: null,
  doiUrl: null,
  downloadUrl: null,
  publisher: null,
  journal: null,
  documentType: null,
  citationCount: null,
  language: null,
  sourceUrl: `https://core.ac.uk/works/${id}`,
  ...overrides,
});

describe('SearchPage', () => {
  let fixture: ComponentFixture<SearchPage>;
  let el: HTMLElement;
  let responses: Subject<SearchResult>[];
  let searchWorks: jasmine.Spy;

  const results = () => el.querySelector('.results')?.textContent ?? '';

  const submit = async (query?: string) => {
    const input = el.querySelector<HTMLInputElement>('input#query')!;
    if (query !== undefined) {
      input.value = query;
      input.dispatchEvent(new Event('input'));
    }
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
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
    expect(results()).toContain('Enter keywords and press Search.');
  });

  it('searches for the trimmed query', async () => {
    await submit('  robots  ');

    expect(searchWorks).toHaveBeenCalledOnceWith({ query: 'robots', limit: 10 });
  });

  it('does not search for a blank query', async () => {
    await submit('   ');

    expect(searchWorks).not.toHaveBeenCalled();
  });

  it('shows a loading message, then the total and the papers', async () => {
    await submit();
    expect(results()).toContain('Searching CORE');

    responses[0].next({
      total: 71213,
      limit: 10,
      offset: 0,
      papers: [
        paper('1', 'Drone delivery', { year: 2021, authors: ['Ada Lovelace', 'Alan Turing'] }),
        paper('2', 'Swarm robotics'),
      ],
    });
    await fixture.whenStable();

    expect(results()).toContain('71,213 papers found');
    const items = [...el.querySelectorAll('.paper-list li')].map((li) => li.textContent);
    expect(items.length).toBe(2);
    expect(items[0]).toContain('Drone delivery');
    expect(items[0]).toContain('2021');
    expect(items[0]).toContain('Ada Lovelace, Alan Turing');
    expect(items[1]).toContain('Year unknown');
    expect(items[1]).toContain('Unknown authors');
    expect(el.querySelector<HTMLAnchorElement>('.paper-list a')?.href).toBe(
      'https://core.ac.uk/works/1',
    );
  });

  it('shows the error message in an alert', async () => {
    await submit();
    responses[0].error(new ApiError('rate-limit', 429));
    await fixture.whenStable();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'CORE is limiting how often we can search',
    );
  });

  it('cancels the in-flight request when a new search starts', async () => {
    await submit('first');
    await submit('second');

    expect(responses[0].observed).toBeFalse();
    expect(responses[1].observed).toBeTrue();
  });
});
