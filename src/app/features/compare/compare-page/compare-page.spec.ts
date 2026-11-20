import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { CoreApiService } from '../../../core/api/core-api.service';
import { YearCounts } from '../../../core/models/paper';
import { ComparePage } from './compare-page';

const CURRENT_YEAR = new Date().getFullYear();
const LAST_FULL = CURRENT_YEAR - 1;
const FIRST = CURRENT_YEAR - 14;

/** Counts that grow from `from` papers in the first year shown to `to` in the last full year. */
const trend = (from: number, to: number, older = 0): YearCounts => ({
  counts: [
    ...(older ? [{ year: FIRST - 3, count: older }] : []),
    { year: FIRST, count: from },
    { year: LAST_FULL, count: to },
    { year: CURRENT_YEAR, count: 5 },
  ],
  truncated: false,
});

describe('ComparePage', () => {
  let harness: RouterTestingHarness;
  let el: HTMLElement;
  let countByYear: jasmine.Spy;
  let pending: Map<string, Subject<YearCounts>>;

  const stable = () => harness.fixture.whenStable();
  const url = () => TestBed.inject(Router).url;
  const inputs = () => [...el.querySelectorAll<HTMLInputElement>('input.field__input')];
  const text = (selector: string) =>
    [...el.querySelectorAll(selector)].map((node) => node.textContent?.replace(/\s+/g, ' ').trim());
  const button = (name: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === name,
    )!;

  const open = async (path: string) => {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(path, ComparePage);
    el = harness.routeNativeElement!;
    await stable();
  };
  const respond = async (query: string, counts: YearCounts) => {
    pending.get(query)!.next(counts);
    pending.get(query)!.complete();
    await stable();
  };
  const type = async (index: number, value: string) => {
    inputs()[index].value = value;
    inputs()[index].dispatchEvent(new Event('input'));
    await stable();
  };
  const submit = async () => {
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await stable();
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
        provideRouter([
          { path: 'compare', component: ComparePage },
          { path: '', children: [] },
        ]),
        { provide: CoreApiService, useValue: { countByYear } },
      ],
    });
  });

  describe('without queries', () => {
    beforeEach(() => open('/compare'));

    it('shows two labelled boxes and example comparisons, and asks CORE nothing', () => {
      expect(inputs().map((input) => input.labels?.[0]?.textContent?.trim())).toEqual([
        'Query 1',
        'Query 2',
      ]);
      expect(el.querySelector('h1')?.textContent).toBe('Compare research trends');
      expect(text('.example')[0]).toBe('drone AND delivery vs autonomous AND vehicles');
      expect(countByYear).not.toHaveBeenCalled();
    });

    it('puts the queries in the URL on Compare', async () => {
      await type(0, '  drone   AND delivery ');
      await type(1, 'robots');
      await submit();

      expect(url()).toBe('/compare?q=drone%20AND%20delivery&q=robots');
      expect(countByYear.calls.allArgs()).toEqual([['drone AND delivery'], ['robots']]);
    });

    it('needs two different queries', async () => {
      await type(0, 'drone');
      await submit();
      expect(text('.form-error')).toEqual(['Enter at least two queries to compare.']);

      await type(1, 'drone');
      await submit();
      expect(text('.form-error')).toEqual(['Enter two different queries to compare.']);
      expect(url()).toBe('/compare');
    });

    it('explains a query with errors under its box and sends nothing', async () => {
      await type(0, 'drone');
      await type(1, 'robots AND (');
      await submit();

      const field = inputs()[1];
      expect(field.getAttribute('aria-invalid')).toBe('true');
      const problems = el.querySelector(`#${field.getAttribute('aria-describedby')}`);
      expect(problems?.textContent).toContain('Error:');
      expect(document.activeElement).toBe(field);
      expect(url()).toBe('/compare');
      expect(countByYear).not.toHaveBeenCalled();

      await type(1, 'robots');
      expect(field.getAttribute('aria-describedby')).toBeNull();
    });

    it('adds a third box, at most, and removes it again', async () => {
      button('Add a query').click();
      await stable();
      expect(inputs().length).toBe(3);
      expect(document.activeElement).toBe(inputs()[2]);
      expect(button('Add a query')).toBeUndefined();

      el.querySelector<HTMLButtonElement>('button[aria-label="Remove query 3"]')!.click();
      await stable();
      expect(inputs().length).toBe(2);
    });
  });

  it('arrives from the search page with one query and the second box focused', async () => {
    await open('/compare?q=drone');

    expect(inputs().map((input) => input.value)).toEqual(['drone', '']);
    expect(document.activeElement).toBe(inputs()[1]);
    expect(el.querySelector('#compare-start-heading')?.textContent?.trim()).toBe(
      'Add a second query',
    );
    expect(countByYear).not.toHaveBeenCalled();
  });

  describe('with queries', () => {
    it('loads each query, then charts them with insights', async () => {
      await open('/compare?q=drone%20delivery&q=autonomous%20vehicles');

      expect(el.querySelector('section.results')?.getAttribute('aria-busy')).toBe('true');
      expect(text('.status')).toEqual([
        'Counting papers for “drone delivery”…',
        'Counting papers for “autonomous vehicles”…',
      ]);
      expect(el.querySelector('.skeleton')).not.toBeNull();

      await respond('drone delivery', trend(50, 410, 7));
      expect(el.querySelectorAll('app-line-chart').length).toBe(1);
      expect(text('.status')).toEqual(['Counting papers for “autonomous vehicles”…']);

      await respond('autonomous vehicles', trend(100, 310));
      expect(el.querySelector('section.results')?.getAttribute('aria-busy')).toBe('false');
      expect(text('.insights__list li')).toEqual([
        `drone delivery: 472 dated papers, peaking in ${LAST_FULL}; output grew 8.2× from ${FIRST} to ${LAST_FULL}.`,
        `autonomous vehicles: 415 dated papers, peaking in ${LAST_FULL}; output grew 3.1× from ${FIRST} to ${LAST_FULL}.`,
      ]);
      expect(text('.comparison')).toEqual([
        'drone delivery grew faster than autonomous vehicles (8.2× vs 3.1×).',
      ]);
      expect(text('.legend__item')).toEqual(['drone delivery', 'autonomous vehicles']);
      expect(text('.notes li')).toEqual([
        `${CURRENT_YEAR} is the year so far.`,
        `drone delivery: 7 papers from before ${FIRST} not drawn.`,
      ]);
    });

    it('can show each series relative to its own peak', async () => {
      await open('/compare?q=a&q=b');
      await respond('a', trend(10, 20));
      await respond('b', trend(300, 400));

      button('Relative to each peak').click();
      await stable();

      expect(button('Relative to each peak').getAttribute('aria-pressed')).toBe('true');
      const hits = [...el.querySelectorAll('rect.hit')];
      expect(hits[0].getAttribute('aria-label')).toBe(
        `${FIRST}: a 10 papers (50% of peak), b 300 papers (75% of peak)`,
      );
      expect(text('.tick').at(-1)).toBe('100%');
    });

    it('shows a table with one column per query', async () => {
      await open('/compare?q=a&q=b');
      await respond('a', trend(10, 20));
      await respond('b', trend(30, 40));

      button('Show as table').click();
      await stable();

      expect(text('thead th')).toEqual(['Year', 'a', 'b']);
      const rows = [...el.querySelectorAll('tbody tr')];
      expect(rows.length).toBe(15);
      const cells = (row?: Element) =>
        [...(row?.querySelectorAll('th, td') ?? [])].map((cell) => cell.textContent?.trim());
      expect(cells(rows[0])).toEqual([String(FIRST), '10', '30']);
      expect(cells(rows.at(-1))).toEqual([`${CURRENT_YEAR} so far`, '5', '5']);
      expect(el.querySelector('app-line-chart')).toBeNull();
    });

    it('keeps the other series when one fails, and retries it', async () => {
      await open('/compare?q=a&q=b');
      await respond('a', trend(10, 20));
      pending.get('b')!.error(new ApiError('rate-limit', 429));
      await stable();

      expect(el.querySelector('.status--error')?.textContent).toContain(
        '“b” could not be counted.',
      );
      expect(el.querySelector('app-line-chart')).not.toBeNull();
      expect(text('.legend__item')).toEqual(['a']);

      button('Retry').click();
      await stable();
      expect(countByYear).toHaveBeenCalledTimes(3);
      expect(text('.status')).toEqual(['Counting papers for “b”…']);

      await respond('b', trend(10, 30));
      expect(text('.legend__item')).toEqual(['a', 'b']);
    });

    it('does not send a query with errors from the URL, and says why', async () => {
      await open('/compare?q=drone&q=robots%20AND%20(');

      expect(countByYear.calls.allArgs()).toEqual([['drone']]);
      expect(el.querySelector('.status--error')?.textContent).toContain(
        '“robots AND (” was not compared:',
      );
    });

    it('sends the corrected form of the brief’s example and says so', async () => {
      await open('/compare?q=(drone%20AND%20(package%20OR%20delivery))&q=drone');

      expect(countByYear.calls.allArgs()).toEqual([['drone AND (package OR delivery)'], ['drone']]);
      expect(text('.notice')[0]).toContain(
        '“(drone AND (package OR delivery))” was sent as drone AND (package OR delivery).',
      );
    });

    it('cancels the old requests when the queries change', async () => {
      await open('/compare?q=a&q=b');
      await harness.navigateByUrl('/compare?q=c&q=d');
      await stable();

      expect(pending.get('a')!.observed).toBeFalse();
      expect(pending.get('b')!.observed).toBeFalse();
      expect(pending.get('c')!.observed).toBeTrue();
    });

    it('says when no matching paper has a year', async () => {
      await open('/compare?q=a&q=b');
      await respond('a', { counts: [], truncated: false });
      await respond('b', { counts: [{ year: 9999, count: 2 }], truncated: false });

      expect(el.querySelector('.results')?.textContent).toContain(
        'None of the matching papers has a publication year to chart.',
      );
    });
  });
});
