import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LineCategory, LineChart, LineSeries, linePath } from './line-chart';

const years = (first: number, count: number): LineCategory[] =>
  Array.from({ length: count }, (_, i) => ({
    key: String(first + i),
    label: String(first + i),
    description: String(first + i),
  }));

describe('LineChart', () => {
  let fixture: ComponentFixture<LineChart>;
  let el: HTMLElement;

  const render = async (
    categories: LineCategory[],
    series: LineSeries[],
    width = 600,
    unit = 'papers',
  ) => {
    el.style.width = `${width}px`;
    fixture.componentRef.setInput('categories', categories);
    fixture.componentRef.setInput('series', series);
    fixture.componentRef.setInput('label', 'Papers per year');
    fixture.componentRef.setInput('unit', unit);
    await fixture.whenStable();
    // The chart measures itself after the first render, then draws.
    await new Promise(requestAnimationFrame);
    await fixture.whenStable();
  };
  const hits = () => [...el.querySelectorAll<SVGRectElement>('rect.hit')];
  const key = (target: Element, name: string) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
  const two: LineSeries[] = [
    { key: 'a', label: 'drone delivery', values: [10, 20, 40], slot: 1 },
    { key: 'b', label: 'robots', values: [1_200, 1_100, 900], slot: 2 },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LineChart],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(LineChart);
    el = fixture.nativeElement;
    document.body.appendChild(el);
  });

  afterEach(() => el.remove());

  it('draws one line per series in its own colour slot, with a legend', async () => {
    await render(years(2020, 3), two);

    expect(el.querySelector('svg.chart')?.getAttribute('role')).toBe('group');
    expect(el.querySelector('svg.chart')?.getAttribute('aria-label')).toBe('Papers per year');
    const lines = [...el.querySelectorAll('path.line')];
    expect(lines.map((line) => line.classList.contains('series-1'))).toEqual([true, false]);
    expect(lines[1].classList).toContain('series-2');
    expect(
      [...el.querySelectorAll('.legend__item')].map((item) => item.textContent?.trim()),
    ).toEqual(['drone delivery', 'robots']);
  });

  it('keeps a series in its slot when another one is missing', async () => {
    await render(years(2020, 3), [{ ...two[1], slot: 3 }]);

    expect(el.querySelector('path.line')?.classList).toContain('series-3');
  });

  it('describes every series for each year, for screen readers', async () => {
    await render(years(2020, 3), two);

    expect(hits().map((hit) => hit.getAttribute('aria-label'))).toEqual([
      '2020: drone delivery 10 papers, robots 1,200 papers',
      '2021: drone delivery 20 papers, robots 1,100 papers',
      '2022: drone delivery 40 papers, robots 900 papers',
    ]);
    expect(hits().every((hit) => hit.getAttribute('role') === 'img')).toBeTrue();
  });

  it('shows all series for the hovered or focused year in the tooltip, with a crosshair', async () => {
    await render(years(2020, 3), two);

    hits()[1].dispatchEvent(new MouseEvent('mouseenter'));
    await fixture.whenStable();
    expect(el.querySelector('.tooltip__heading')?.textContent).toBe('2021');
    const rows = [...el.querySelectorAll('.tooltip__row')].map((row) =>
      [...row.querySelectorAll('span')].map((cell) => cell.textContent?.trim()).join(' '),
    );
    expect(rows).toEqual(['drone delivery 20 papers', 'robots 1,100 papers']);
    expect(el.querySelector('.crosshair')).not.toBeNull();

    hits()[1].dispatchEvent(new MouseEvent('mouseleave'));
    await fixture.whenStable();
    expect(el.querySelector('.tooltip')).toBeNull();

    hits()[0].focus();
    await fixture.whenStable();
    expect(el.querySelector('.tooltip__heading')?.textContent).toBe('2020');
  });

  it('is a single tab stop that the arrow keys, Home and End move along', async () => {
    await render(years(2020, 4), [{ key: 'a', label: 'a', values: [1, 2, 3, 4], slot: 1 }]);
    const tabbable = () => hits().findIndex((hit) => hit.getAttribute('tabindex') === '0');

    expect(tabbable()).toBe(0);
    hits()[0].focus();
    key(hits()[0], 'ArrowRight');
    await fixture.whenStable();
    expect(document.activeElement).toBe(hits()[1]);
    expect(tabbable()).toBe(1);

    key(hits()[1], 'End');
    await fixture.whenStable();
    expect(document.activeElement).toBe(hits()[3]);

    key(hits()[3], 'Home');
    await fixture.whenStable();
    expect(document.activeElement).toBe(hits()[0]);
  });

  it('scales one shared axis to the largest value, compact above 10,000', async () => {
    await render(years(2020, 2), [
      { key: 'a', label: 'a', values: [100, 151_742], slot: 1 },
      { key: 'b', label: 'b', values: [5, 9], slot: 2 },
    ]);

    expect([...el.querySelectorAll('.tick')].map((tick) => tick.textContent?.trim())).toEqual([
      '0',
      '50K',
      '100K',
      '150K',
      '200K',
    ]);
  });

  it('keeps the latest year label on a narrow chart', async () => {
    await render(
      years(2012, 15),
      [{ key: 'a', label: 'a', values: Array.from({ length: 15 }, (_, i) => i), slot: 1 }],
      1_000,
    );
    expect(el.querySelectorAll('.label').length).toBe(15);

    await render(years(2012, 15), two, 300);
    const labels = [...el.querySelectorAll('.label')].map((label) => label.textContent?.trim());
    expect(labels.length).toBeLessThan(15);
    expect(labels.at(-1)).toBe('2026');
  });

  it('says when a series has no value for a year', async () => {
    await render(years(2020, 2), [{ key: 'a', label: 'a', values: [null, 3], slot: 1 }]);

    expect(hits()[0].getAttribute('aria-label')).toBe('2020: a no data');
  });
});

describe('linePath', () => {
  const x = (i: number) => i * 10;
  const y = (value: number) => 100 - value;

  it('joins the points and breaks the line at a gap', () => {
    expect(linePath([1, 2, null, 4, 5], x, y)).toBe('M0,99L10,98M30,96L40,95');
  });

  it('is empty without values', () => {
    expect(linePath([null, null], x, y)).toBe('');
  });
});
