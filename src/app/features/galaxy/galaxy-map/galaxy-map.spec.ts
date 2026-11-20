import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { Paper } from '../../../core/models/paper';
import { syntheticPapers } from '../../../../testing/galaxy.fixture';
import { makePaper } from '../../../../testing/paper.fixture';
import { GalaxyInput, analyseGalaxy } from '../analysis/galaxy-analysis';
import { AnalysedGalaxy, GalaxyAnalyser } from '../galaxy-analyser';
import { ReducedMotion } from '../reduced-motion';
import { GalaxyMap } from './galaxy-map';

/** 40 papers in four topics, published from 2014 to 2026. */
const PAPERS: Paper[] = syntheticPapers().map((paper, i) =>
  makePaper({
    id: String(i + 1),
    title: paper.title,
    abstract: paper.abstract,
    year: paper.year,
    authors: ['Ada Lovelace', 'Alan Turing', 'Grace Hopper'],
  }),
);
const FIRST_YEAR = 2014;
const LAST_YEAR = 2026;
const STEP_MS = 7_000 / (LAST_YEAR - FIRST_YEAR + 1);

describe('GalaxyMap', () => {
  let fixture: ComponentFixture<GalaxyMap>;
  let el: HTMLElement;
  let analyse: jasmine.Spy<(input: GalaxyInput) => Observable<AnalysedGalaxy>>;
  let reduced: ReturnType<typeof signal<boolean>>;

  const stable = () => fixture.whenStable();
  const stars = () => [...el.querySelectorAll<SVGAElement>('a.star')];
  const shownStars = () => stars().filter((star) => !star.classList.contains('is-hidden'));
  const button = (name: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.replace(/\s+/g, ' ').trim().startsWith(name),
    )!;
  const slider = () => el.querySelector<HTMLInputElement>('input[type="range"]')!;
  const insight = () => el.querySelector('.insight')?.textContent?.replace(/\s+/g, ' ').trim();
  const legend = () => [...el.querySelectorAll<HTMLButtonElement>('app-galaxy-legend .topic')];
  const topicOf = (star: Element) =>
    /Topic: (.+)\. Opens in a new tab\.$/.exec(star.getAttribute('aria-label')!)![1];
  const key = (target: Element, name: string) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));

  async function render(papers: Paper[] | null = PAPERS) {
    fixture.componentRef.setInput('papers', papers);
    fixture.componentRef.setInput('query', 'drone AND delivery');
    fixture.componentRef.setInput('currentYear', 2026);
    await stable();
    // The sky is measured after the first render, then analysed.
    await new Promise(requestAnimationFrame);
    await stable();
  }

  async function scrub(year: number) {
    slider().value = String(year);
    slider().dispatchEvent(new Event('input'));
    await stable();
  }

  beforeEach(() => {
    analyse = jasmine
      .createSpy('analyse')
      .and.callFake((input: GalaxyInput) => of({ ...analyseGalaxy(input), thread: 'worker' }));
    reduced = signal(false);
    TestBed.configureTestingModule({
      imports: [GalaxyMap],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: GalaxyAnalyser, useValue: { analyse } },
        { provide: ReducedMotion, useValue: { reduced } },
      ],
    });
    fixture = TestBed.createComponent(GalaxyMap);
    el = fixture.nativeElement;
    el.style.width = '800px';
    document.body.appendChild(el);
  });

  afterEach(() => el.remove());

  it('shows a starfield the size of the sky while the papers are fetched', async () => {
    await render(null);

    expect(el.querySelector('section')?.getAttribute('aria-busy')).toBe('true');
    expect(el.querySelector('.placeholder')).not.toBeNull();
    expect(el.querySelector<HTMLElement>('.frame')!.clientHeight).toBeGreaterThan(300);
    expect(el.querySelector('.caption')?.textContent).toContain('Fetching');
    expect(analyse).not.toHaveBeenCalled();
  });

  it('asks the worker for topics laid out for the sky, then draws a star per paper', async () => {
    await render();

    const [input] = analyse.calls.mostRecent().args;
    expect(input.width).toBeGreaterThan(600);
    expect(input.height).toBeCloseTo((input.width * 9) / 16, -1);
    expect(input.papers[0]).toEqual({
      title: PAPERS[0].title,
      abstract: PAPERS[0].abstract,
      year: 2014,
    });
    expect(stars().length).toBe(40);
    expect(legend().length).toBe(4);
    expect(insight()).toMatch(/^4 topics · fastest-growing: .+ \(100% of its papers since 2023\)/);
    expect(el.querySelector('[aria-live="polite"]')?.textContent).toContain(
      '40 papers in 4 topics',
    );
    expect(el.querySelector('.footnote')?.textContent).toContain('in a background thread');
  });

  it('opens each paper from its star, in a new tab', async () => {
    await render();

    const [star] = stars();
    expect(star.getAttribute('href')).toBe('https://core.ac.uk/works/1');
    expect(star.getAttribute('target')).toBe('_blank');
    expect(star.getAttribute('aria-label')).toMatch(
      /^Drone delivery .+, 2014, by Ada Lovelace, Alan Turing et al\. Topic: .+\. Opens in a new tab\.$/,
    );
  });

  describe('time-lapse', () => {
    beforeEach(() => jasmine.clock().install());
    afterEach(() => jasmine.clock().uninstall());

    it('plays year by year, updating the counts, and pauses', async () => {
      await render();
      expect(slider().value).toBe(String(LAST_YEAR));

      button('Play').click();
      await stable();
      expect(slider().value).toBe(String(FIRST_YEAR));
      expect(button('Pause').getAttribute('aria-label')).toBe('Pause the time-lapse');
      const first = shownStars().length;
      expect(first).toBe(PAPERS.filter((p) => p.year === FIRST_YEAR).length);
      expect(insight()).toBe(`${FIRST_YEAR} · ${first} of 40 papers so far`);
      const counts = legend().map((b) =>
        Number(b.querySelector('.topic__count')?.firstChild?.textContent),
      );
      expect(counts.reduce((a, b) => a + b, 0)).toBe(first);

      jasmine.clock().tick(STEP_MS + 1);
      await stable();
      expect(slider().value).toBe(String(FIRST_YEAR + 1));
      expect(shownStars().length).toBeGreaterThan(first);

      button('Pause').click();
      await stable();
      jasmine.clock().tick(STEP_MS * 3);
      await stable();
      expect(slider().value).toBe(String(FIRST_YEAR + 1));
    });

    it('ends with every star and the summary, and starts again from the first year', async () => {
      await render();
      button('Play').click();
      await stable();

      for (let year = FIRST_YEAR; year < LAST_YEAR; year++) {
        jasmine.clock().tick(STEP_MS + 1);
        await stable();
      }

      expect(slider().value).toBe(String(LAST_YEAR));
      expect(shownStars().length).toBe(40);
      expect(button('Play')).toBeDefined();
      expect(insight()).toMatch(/^4 topics/);

      button('Play').click();
      await stable();
      expect(slider().value).toBe(String(FIRST_YEAR));
    });

    it('jumps to the end without animation when the system asks for reduced motion', async () => {
      reduced.set(true);
      await render();
      await scrub(2017);

      button('Play').click();
      await stable();

      expect(slider().value).toBe(String(LAST_YEAR));
      expect(button('Play')).toBeDefined();
      expect(el.querySelector('app-galaxy-sky')?.classList).toContain('still');
    });
  });

  it('describes the year on the slider for screen readers', async () => {
    await render();
    expect(slider().getAttribute('aria-valuetext')).toBe('2026: all 40 papers');

    await scrub(2017);
    const shown = PAPERS.filter((p) => p.year! <= 2017).length;
    expect(slider().getAttribute('aria-valuetext')).toBe(`2017: ${shown} of 40 papers`);
  });

  it('keeps stars the time-lapse has not reached out of reach of the keyboard', async () => {
    await render();
    await scrub(2016);

    const hidden = stars().filter((star) => star.classList.contains('is-hidden'));
    expect(hidden.length).toBe(PAPERS.filter((p) => p.year! > 2016).length);
    expect(hidden.every((star) => star.getAttribute('aria-hidden') === 'true')).toBeTrue();
    expect(hidden.every((star) => star.getAttribute('tabindex') === '-1')).toBeTrue();
    const stops = stars().filter((star) => star.getAttribute('tabindex') === '0');
    expect(stops.length).toBe(1);
    expect(stops[0].classList).not.toContain('is-hidden');
  });

  it('moves between stars with the arrow keys, showing each one’s details', async () => {
    await render();
    const start = stars().find((star) => star.getAttribute('tabindex') === '0')!;
    start.focus();
    await stable();
    expect(el.querySelector('.tooltip__title')?.textContent).toBe(
      PAPERS[stars().indexOf(start)].title,
    );

    let moved = false;
    for (const arrow of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']) {
      key(document.activeElement!, arrow);
      await stable();
      moved ||= document.activeElement !== start;
    }
    expect(moved).toBeTrue();
    expect(document.activeElement?.classList).toContain('star');
    expect(document.activeElement?.getAttribute('tabindex')).toBe('0');

    key(document.activeElement!, 'Escape');
    await stable();
    expect(el.querySelector('.tooltip')).toBeNull();
  });

  it('highlights a topic from the legend, keeps the arrow keys in it and offers to search it', async () => {
    await render();
    legend()[1].click();
    await stable();

    expect(legend()[1].getAttribute('aria-pressed')).toBe('true');
    const topic = legend()[1].querySelector('.topic__name')!.firstChild!.textContent!.trim();
    const dimmed = stars().filter((star) => star.classList.contains('is-dimmed'));
    expect(dimmed.length).toBe(30);
    expect(dimmed.every((star) => topicOf(star) !== topic)).toBeTrue();

    const start = stars().find((star) => star.getAttribute('tabindex') === '0')!;
    expect(topicOf(start)).toBe(topic);
    start.focus();
    for (const arrow of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight']) {
      key(document.activeElement!, arrow);
      await stable();
      expect(topicOf(document.activeElement!)).toBe(topic);
    }

    const search = [...el.querySelectorAll<HTMLAnchorElement>('.detail a')].find(
      (a) => a.textContent?.trim() === 'Search this topic',
    )!;
    const terms = topic.split(' · ').map((term) => (term.includes(' ') ? `"${term}"` : term));
    expect(decodeURIComponent(search.getAttribute('href')!)).toBe(
      `/?q=drone AND delivery AND (${terms.join(' OR ')})`,
    );

    key(document.activeElement!, 'Escape');
    await stable();
    expect(legend()[1].getAttribute('aria-pressed')).toBe('false');
    expect(el.querySelector('.detail')).toBeNull();
  });

  it('shows the same topics and papers as a list', async () => {
    await render();
    button('List view').click();
    await stable();

    expect(button('List view').getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector<HTMLElement>('.frame')!.hidden).toBeTrue();
    const headings = [...el.querySelectorAll('app-galaxy-topic-list h3')];
    expect(headings.length).toBe(4);
    expect(headings[0].textContent).toContain('10 papers');
    expect(el.querySelectorAll('app-galaxy-topic-list a[target="_blank"]').length).toBe(40);
  });

  it('offers to try again when the galaxy cannot be drawn', async () => {
    analyse.and.returnValue(throwError(() => new Error('worker failed')));
    await render();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'The galaxy could not be drawn.',
    );
    analyse.and.callFake((input: GalaxyInput) => of({ ...analyseGalaxy(input), thread: 'main' }));
    button('Retry').click();
    await stable();

    expect(analyse).toHaveBeenCalledTimes(2);
    expect(stars().length).toBe(40);
  });

  it('shows every star without a time-lapse when no paper has a year', async () => {
    await render(PAPERS.map((paper) => ({ ...paper, year: null })));

    expect(shownStars().length).toBe(40);
    expect(slider()).toBeNull();
    expect(el.querySelector('.counter')).toBeNull();
    expect(insight()).toMatch(/^4 topics/);
  });

  it('says when the topics come from titles alone', async () => {
    await render(PAPERS.map((paper) => ({ ...paper, abstract: null })));

    expect(el.querySelector('.footnote')?.textContent).toContain(
      'None of these papers has an abstract in CORE',
    );
  });
});
