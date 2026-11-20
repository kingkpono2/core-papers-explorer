import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BarChart, BarDatum } from './bar-chart';

const years = (counts: number[], first = 2017): BarDatum[] =>
  counts.map((value, i) => ({
    key: String(first + i),
    label: String(first + i),
    value,
    description: `${first + i}: ${value.toLocaleString('en-US')} papers`,
  }));

describe('BarChart', () => {
  let fixture: ComponentFixture<BarChart>;
  let el: HTMLElement;
  let selected: BarDatum[];

  const render = async (bars: BarDatum[], width = 600, selectable = false) => {
    el.style.width = `${width}px`;
    fixture.componentRef.setInput('bars', bars);
    fixture.componentRef.setInput('label', 'Papers per year');
    fixture.componentRef.setInput('selectable', selectable);
    await fixture.whenStable();
    // The chart measures itself after the first render, then draws.
    await new Promise(requestAnimationFrame);
    await fixture.whenStable();
  };
  const hits = () => [...el.querySelectorAll<SVGRectElement>('rect.hit')];
  const texts = (selector: string) =>
    [...el.querySelectorAll(selector)].map((node) => node.textContent?.trim());
  const key = (target: Element, name: string) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BarChart],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(BarChart);
    el = fixture.nativeElement;
    document.body.appendChild(el);
    selected = [];
    fixture.componentInstance.selected.subscribe((bar) => selected.push(bar));
  });

  afterEach(() => el.remove());

  it('draws a labelled group with one focusable, described bar per datum', async () => {
    await render(years([146, 232, 252, 354, 464]));

    expect(el.querySelector('svg')?.getAttribute('role')).toBe('group');
    expect(el.querySelector('svg')?.getAttribute('aria-label')).toBe('Papers per year');
    expect(hits().map((hit) => hit.getAttribute('aria-label'))).toEqual([
      '2017: 146 papers',
      '2018: 232 papers',
      '2019: 252 papers',
      '2020: 354 papers',
      '2021: 464 papers',
    ]);
    expect(hits().every((hit) => hit.getAttribute('role') === 'img')).toBeTrue();
    expect(el.querySelectorAll('path.bar').length).toBe(5);
  });

  it('scales the axis to round ticks and labels the highest bar', async () => {
    await render(years([1_463, 7_828, 5_626]));

    expect(texts('.tick')).toEqual(['0', '2,000', '4,000', '6,000', '8,000']);
    expect(texts('.peak')).toEqual(['7,828']);
  });

  it('switches to compact tick labels for large counts', async () => {
    await render(years([12_000, 151_742]));

    expect(texts('.tick')).toEqual(['0', '50K', '100K', '150K', '200K']);
  });

  it('thins out the year labels on a narrow chart, keeping the latest year', async () => {
    const bars = years(
      Array.from({ length: 30 }, (_, i) => i + 1),
      1997,
    );

    await render(bars, 1_400);
    expect(texts('.label').length).toBe(30);

    await render(bars, 340);
    const labels = texts('.label');
    expect(labels.length).toBeLessThan(10);
    expect(labels.at(-1)).toBe('2026');
    expect(labels).toContain('2021');
  });

  it('keeps every bar inside its width', async () => {
    await render(years(Array.from({ length: 30 }, () => 5)), 320);

    const svg = el.querySelector('svg')!;
    expect(Number(svg.getAttribute('width'))).toBe(320);
    const last = hits().at(-1)!;
    expect(Number(last.getAttribute('x')) + Number(last.getAttribute('width'))).toBeLessThanOrEqual(
      320,
    );
  });

  it('shows a tooltip on hover and on focus', async () => {
    await render(years([146, 232]));

    hits()[1].dispatchEvent(new MouseEvent('mouseenter'));
    await fixture.whenStable();
    expect(el.querySelector('.tooltip')?.textContent?.trim()).toBe('2018: 232 papers');

    hits()[1].dispatchEvent(new MouseEvent('mouseleave'));
    hits()[0].focus();
    await fixture.whenStable();
    expect(el.querySelector('.tooltip')?.textContent?.trim()).toBe('2017: 146 papers');
  });

  it('is a single tab stop that the arrow keys, Home and End move along', async () => {
    await render(years([1, 2, 3, 4]));
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

    key(hits()[3], 'ArrowRight');
    key(hits()[3], 'Home');
    await fixture.whenStable();
    expect(document.activeElement).toBe(hits()[0]);
  });

  it('emits the bar chosen by click or keyboard when selectable', async () => {
    const bars = years([1, 2, 3]);
    await render(bars, 600, true);

    expect(hits()[0].getAttribute('role')).toBe('button');
    hits()[2].dispatchEvent(new MouseEvent('click'));
    key(hits()[1], 'Enter');
    key(hits()[0], ' ');

    expect(selected).toEqual([bars[2], bars[1], bars[0]]);
  });

  it('ignores clicks when not selectable', async () => {
    await render(years([1, 2, 3]));

    hits()[2].dispatchEvent(new MouseEvent('click'));
    key(hits()[1], 'Enter');

    expect(selected).toEqual([]);
  });

  it('draws no bar for a zero count but keeps it focusable', async () => {
    await render(years([0, 5]));

    expect(el.querySelectorAll('path.bar').length).toBe(1);
    expect(hits().length).toBe(2);
  });
});
