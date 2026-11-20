import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { ApiError } from '../../../../core/api/api-error';
import { CoreApiService } from '../../../../core/api/core-api.service';
import { YearCounts } from '../../../../core/models/paper';
import { ChartSearch, YearChart } from './year-chart';

const BRIEF = 'drone AND (package OR delivery)';

const yearsOf = (counts: Record<number, number>, truncated = false): YearCounts => ({
  counts: Object.entries(counts).map(([year, count]) => ({ year: Number(year), count })),
  truncated,
});

describe('YearChart', () => {
  let fixture: ComponentFixture<YearChart>;
  let el: HTMLElement;
  let responses: Subject<YearCounts>[];
  let countByYear: jasmine.Spy;
  let narrowed: string[];

  const render = async (search: ChartSearch | null) => {
    fixture.componentRef.setInput('search', search);
    await fixture.whenStable();
    await new Promise(requestAnimationFrame);
    await fixture.whenStable();
  };
  const respond = async (counts: YearCounts) => {
    responses.at(-1)!.next(counts);
    await fixture.whenStable();
    await new Promise(requestAnimationFrame);
    await fixture.whenStable();
  };
  const text = (selector: string) =>
    el.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  const notes = () =>
    [...el.querySelectorAll('.notes li')].map((li) => li.textContent?.replace(/\s+/g, ' ').trim());
  const bars = () => [...el.querySelectorAll<SVGRectElement>('rect.hit')];
  const button = (name: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!;
  const settled = (query = BRIEF, total: number | null = 4_729): ChartSearch => ({
    query,
    total,
    settled: true,
  });

  beforeEach(() => {
    responses = [];
    countByYear = jasmine.createSpy('countByYear').and.callFake(() => {
      const response = new Subject<YearCounts>();
      responses.push(response);
      return response;
    });
    TestBed.configureTestingModule({
      imports: [YearChart],
      providers: [
        provideZonelessChangeDetection(),
        { provide: CoreApiService, useValue: { countByYear } },
      ],
    });
    fixture = TestBed.createComponent(YearChart);
    fixture.componentRef.setInput('currentYear', 2026);
    el = fixture.nativeElement;
    document.body.appendChild(el);
    narrowed = [];
    fixture.componentInstance.narrowed.subscribe((query) => narrowed.push(query));
  });

  afterEach(() => el.remove());

  it('is blank, without asking CORE, before anything is searched', async () => {
    await render(null);

    expect(text('.message')).toBe('Search to see when the matching papers were published.');
    expect(el.querySelector('app-bar-chart')).toBeNull();
    expect(countByYear).not.toHaveBeenCalled();
  });

  it('waits for the results before asking CORE', async () => {
    await render({ query: BRIEF, total: null, settled: false });

    expect(el.querySelector('.skeleton')).not.toBeNull();
    expect(el.querySelector('section')?.getAttribute('aria-busy')).toBe('true');
    expect(countByYear).not.toHaveBeenCalled();

    await render(settled());
    expect(countByYear).toHaveBeenCalledOnceWith(BRIEF);
    expect(el.querySelector('.skeleton')).not.toBeNull();
  });

  it('draws a bar per year with readable labels and explains what is counted', async () => {
    await render(settled());
    await respond(yearsOf({ 2015: 51, 2020: 354, 2025: 608, 2026: 655 }));

    expect(text('.caption')).toBe(
      'All 4,729 matching papers by year of publication, not only those on this page. Counts come from CORE.',
    );
    const labels = bars().map((bar) => bar.getAttribute('aria-label'));
    expect(labels.length).toBe(12);
    expect(labels).toContain('2020: 354 papers');
    expect(labels).toContain('2016: 0 papers');
    expect(labels.at(-1)).toBe('2026 so far: 655 papers');
    expect(notes()).toContain('2026 is the year so far.');
    expect(notes()).toContain('3,061 papers without a usable publication year are not counted.');
  });

  it('mentions older papers that are not drawn, with a lower bound when CORE cut the list', async () => {
    const years = { 1990: 2, 2010: 300, 2018: 300, 2026: 300 };
    await render(settled('drone', 71_213));
    await respond(yearsOf(years, true));

    const note = notes().find((n) => n?.includes('before'));
    expect(note).toBe('At least 2 papers from before 2010 are not drawn. Search them');
    expect(notes().at(-1)).toContain('or from years too sparse for CORE to list');
  });

  it('offers the same numbers as a table', async () => {
    await render(settled());
    await respond(yearsOf({ 2000: 1, 2020: 354, 2026: 655 }));

    button('Show as table').click();
    await fixture.whenStable();

    expect(el.querySelector('app-bar-chart')).toBeNull();
    const rows = [...el.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.children].map((cell) => cell.textContent?.trim()),
    );
    expect(rows[0]).toEqual(['Before 2017', '1']);
    expect(rows).toContain(['2020', '354']);
    expect(rows.at(-1)).toEqual(['2026 (so far)', '655']);
    expect(button('Show as table').getAttribute('aria-pressed')).toBe('true');
  });

  it('narrows the search to the chosen year without nesting the OR group', async () => {
    await render(settled());
    await respond(yearsOf({ 2020: 354, 2026: 655 }));

    bars()
      .find((bar) => bar.getAttribute('aria-label')?.startsWith('2020'))!
      .dispatchEvent(new MouseEvent('click'));

    expect(narrowed[0]).toBe(`${BRIEF} AND yearPublished:2020`);
  });

  it('brackets a top-level OR query before narrowing it', async () => {
    await render(settled('drone OR quadcopter', 80_000));
    await respond(yearsOf({ 2020: 6_068, 2026: 7_000 }));

    bars()[bars().length - 1].dispatchEvent(new MouseEvent('click'));

    expect(narrowed).toEqual(['(drone OR quadcopter) AND yearPublished:2026']);
  });

  it('does not offer narrowing for a query that already filters by year', async () => {
    await render(settled('drone AND yearPublished>=2020', 40_000));
    await respond(yearsOf({ 2020: 5_626, 2026: 6_546 }));

    expect(bars()[0].getAttribute('role')).toBe('img');
    expect(notes()).not.toContain('Select a bar to search that year only.');
  });

  it('asks CORE again only when the query changes', async () => {
    await render(settled());
    await respond(yearsOf({ 2020: 354 }));
    await render(settled(BRIEF, 4_729));
    await render({ query: BRIEF, total: 4_729, settled: true });
    expect(countByYear).toHaveBeenCalledTimes(1);

    await render(settled('drone', 71_213));
    expect(countByYear).toHaveBeenCalledTimes(2);
  });

  it('cancels the previous request when the query changes', async () => {
    await render(settled());
    const first = responses[0];
    await render(settled('drone', 71_213));

    expect(first.observed).toBeFalse();
    expect(responses[1].observed).toBeTrue();
  });

  it('shows an error with a retry button that asks again', async () => {
    await render(settled());
    responses[0].error(new ApiError('rate-limit', 429));
    await fixture.whenStable();

    expect(text('[role="alert"] .message')).toContain('The chart could not be loaded.');
    button('Retry').click();
    await fixture.whenStable();
    expect(countByYear).toHaveBeenCalledTimes(2);
    await respond(yearsOf({ 2020: 354 }));
    expect(el.querySelector('app-bar-chart')).not.toBeNull();
  });

  it('says there is nothing to chart when nothing matched, without asking CORE', async () => {
    await render(settled('qzxvjwkq', 0));

    expect(text('.message')).toBe('No matching papers have a publication year to chart.');
    expect(countByYear).not.toHaveBeenCalled();
  });

  it('says there is nothing to chart when no match has a usable year', async () => {
    await render(settled('odd', 3));
    await respond(yearsOf({ 9999: 3 }));

    expect(text('.message')).toBe('No matching papers have a publication year to chart.');
  });
});
