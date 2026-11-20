import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Pagination } from './pagination';

describe('Pagination', () => {
  let fixture: ComponentFixture<Pagination>;
  let el: HTMLElement;

  const render = async (page: number, lastPage: number) => {
    fixture.componentRef.setInput('page', page);
    fixture.componentRef.setInput('lastPage', lastPage);
    await fixture.whenStable();
  };
  const items = () =>
    [...el.querySelectorAll('li')].map((li) => li.textContent?.replace(/\s+/g, ' ').trim());
  const step = (name: string) =>
    [...el.querySelectorAll<HTMLAnchorElement>('a.step')].find((a) =>
      a.textContent?.includes(name),
    )!;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Pagination],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
    fixture = TestBed.createComponent(Pagination);
    el = fixture.nativeElement;
  });

  it('is a labelled navigation landmark', async () => {
    await render(1, 3);

    expect(el.querySelector('nav')?.getAttribute('aria-label')).toBe('Pages');
  });

  it('lists pages with ellipses around the current one', async () => {
    await render(10, 20);

    expect(items()).toEqual([
      'Previous',
      'Page 1',
      '…',
      'Page 9',
      'Page 10',
      'Page 11',
      '…',
      'Page 20',
      'Next',
    ]);
    expect(el.querySelector('[aria-current="page"]')?.textContent).toContain('10');
  });

  it('links to pages by changing only the page query param', async () => {
    await render(2, 3);

    const hrefs = [...el.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/', '/', '/?page=2', '/?page=3', '/?page=3']);
    expect(step('Previous').rel).toBe('prev');
    expect(step('Next').rel).toBe('next');
  });

  it('disables Previous on the first page and Next on the last', async () => {
    await render(1, 3);
    expect(step('Previous').hasAttribute('href')).toBeFalse();
    expect(step('Previous').getAttribute('aria-disabled')).toBe('true');
    expect(step('Next').hasAttribute('href')).toBeTrue();

    await render(3, 3);
    expect(step('Previous').hasAttribute('href')).toBeTrue();
    expect(step('Next').hasAttribute('href')).toBeFalse();
    expect(step('Next').getAttribute('aria-disabled')).toBe('true');
  });

  it('formats large page numbers', async () => {
    await render(1, 1000);

    expect(items().at(-2)).toBe('Page 1,000');
  });
});
