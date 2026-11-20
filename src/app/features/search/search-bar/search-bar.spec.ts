import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RECENT_SEARCHES_STORAGE_KEY } from '../recent-searches';
import { SearchBar, VALIDATION_DELAY_MS } from './search-bar';

describe('SearchBar', () => {
  let fixture: ComponentFixture<SearchBar>;
  let el: HTMLElement;
  let searched: string[];

  const input = () => el.querySelector<HTMLInputElement>('input#query')!;
  const problems = () =>
    [...el.querySelectorAll('#query-problems .problem__message')].map((p) =>
      p.textContent!.replace(/\s+/g, ' ').trim(),
    );
  const button = (name: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!;
  const helpToggle = () => button('How to search');
  const helpPanel = () => el.querySelector<HTMLElement>('#search-help')!;

  const create = async (query = '') => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(SearchBar);
    fixture.componentRef.setInput('query', query);
    searched = [];
    fixture.componentInstance.searched.subscribe((value) => searched.push(value));
    el = fixture.nativeElement;
    document.body.appendChild(el);
    await fixture.whenStable();
  };

  const type = (value: string) => {
    input().value = value;
    input().dispatchEvent(new Event('input'));
  };

  const submit = async (value?: string) => {
    if (value !== undefined) {
      type(value);
    }
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
  };

  const press = async (target: HTMLElement, key: string) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    await fixture.whenStable();
    return event;
  };

  beforeEach(() => localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY));

  afterEach(() => {
    el.remove();
    localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
  });

  describe('validation', () => {
    beforeEach(() => create());

    it('ties the messages to the field', () => {
      expect(input().getAttribute('aria-describedby')).toBe('query-problems query-hint');
      expect(el.querySelector('#query-problems')?.getAttribute('aria-live')).toBe('polite');
      expect(input().hasAttribute('aria-invalid')).toBeFalse();
    });

    it('shows errors once typing pauses', () => {
      jasmine.clock().install();
      try {
        type('drone AND (');
        fixture.detectChanges();
        expect(problems()).toEqual([]);

        jasmine.clock().tick(VALIDATION_DELAY_MS - 1);
        fixture.detectChanges();
        expect(problems()).toEqual([]);

        jasmine.clock().tick(1);
        fixture.detectChanges();
        expect(problems()).toEqual(['Error: This bracket is never closed. Add a ).']);
        expect(input().getAttribute('aria-invalid')).toBe('true');
        expect(el.querySelector('.problem__excerpt')?.textContent).toBe('drone AND (');
        expect(el.querySelector('.problem__excerpt mark')?.textContent).toBe('(');
      } finally {
        jasmine.clock().uninstall();
      }
    });

    it('shows errors at once on submit and does not search', async () => {
      await submit('title:"drone');

      expect(searched).toEqual([]);
      expect(problems()).toEqual(['Error: This quote is never closed. Add a ".']);
      expect(document.activeElement).toBe(input());
    });

    it('asks for a query when submitted empty, but not while typing', async () => {
      await submit('');
      expect(problems()).toEqual(['Error: Enter something to search for.']);

      type('d');
      type('');
      await new Promise((resolve) => setTimeout(resolve, VALIDATION_DELAY_MS));
      await fixture.whenStable();
      expect(problems()).toEqual([]);
    });

    it('searches despite warnings, normalising whitespace', async () => {
      await submit('  drone   and delivery ');

      expect(searched).toEqual(['drone and delivery']);
      expect(problems()).toEqual([
        'Warning: CORE treats “and” as AND, the same as in capitals. Write AND to make that clear.',
      ]);
      expect(input().hasAttribute('aria-invalid')).toBeFalse();
    });

    it('selects the part of the query a message is about', async () => {
      await submit('drone AND AND delivery');

      el.querySelector<HTMLButtonElement>('.problem__excerpt')!.click();

      expect(document.activeElement).toBe(input());
      expect([input().selectionStart, input().selectionEnd]).toEqual([6, 13]);
    });

    it('clears the query and its messages with Escape', async () => {
      await submit('drone AND');

      const event = await press(input(), 'Escape');

      expect(event.defaultPrevented).toBeTrue();
      expect(input().value).toBe('');
      expect(problems()).toEqual([]);
      expect((await press(input(), 'Escape')).defaultPrevented).toBeFalse();
    });
  });

  it('follows the query in the URL', async () => {
    await create('robots');
    expect(input().value).toBe('robots');

    fixture.componentRef.setInput('query', 'drones');
    await fixture.whenStable();
    expect(input().value).toBe('drones');
  });

  describe('keyboard shortcut', () => {
    beforeEach(() => create('drone'));

    it('focuses and selects the search box on /', async () => {
      const event = await press(document.body, '/');

      expect(event.defaultPrevented).toBeTrue();
      expect(document.activeElement).toBe(input());
      expect([input().selectionStart, input().selectionEnd]).toEqual([0, 5]);
      expect(input().getAttribute('aria-keyshortcuts')).toBe('/');
    });

    it('leaves / alone while typing or with a modifier key', async () => {
      const other = document.body.appendChild(document.createElement('textarea'));
      other.focus();

      expect((await press(other, '/')).defaultPrevented).toBeFalse();
      expect(document.activeElement).toBe(other);
      other.remove();

      input().focus();
      expect((await press(input(), '/')).defaultPrevented).toBeFalse();

      input().blur();
      const withCtrl = new KeyboardEvent('keydown', { key: '/', ctrlKey: true, bubbles: true });
      document.body.dispatchEvent(withCtrl);
      expect(document.activeElement).not.toBe(input());
    });
  });

  describe('help', () => {
    beforeEach(() => create());

    it('is a disclosure that Escape closes, returning focus to its button', async () => {
      expect(helpToggle().getAttribute('aria-expanded')).toBe('false');
      expect(helpToggle().getAttribute('aria-controls')).toBe('search-help');
      expect(helpPanel().hidden).toBeTrue();

      helpToggle().click();
      await fixture.whenStable();
      expect(helpToggle().getAttribute('aria-expanded')).toBe('true');
      expect(helpPanel().hidden).toBeFalse();

      const example = helpPanel().querySelector<HTMLButtonElement>('button')!;
      example.focus();
      await press(example, 'Escape');

      expect(helpPanel().hidden).toBeTrue();
      expect(helpToggle().getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(helpToggle());
    });

    it('runs an example and closes', async () => {
      helpToggle().click();
      await fixture.whenStable();

      button('(drone AND (package OR delivery))').click();
      await fixture.whenStable();

      expect(searched).toEqual(['(drone AND (package OR delivery))']);
      expect(input().value).toBe('(drone AND (package OR delivery))');
      expect(helpPanel().hidden).toBeTrue();
    });

    it('inserts a field at the cursor', async () => {
      type('drone delivery');
      input().setSelectionRange(5, 5);

      button('title:').click();
      await fixture.whenStable();

      expect(input().value).toBe('drone title: delivery');
      expect(input().selectionStart).toBe(12);
      expect(document.activeElement).toBe(input());
    });
  });

  describe('recent searches', () => {
    beforeEach(async () => {
      localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(['robots', 'drone']));
      await create();
    });

    it('lists them as buttons that search again', async () => {
      const chips = [...el.querySelectorAll<HTMLButtonElement>('.recent__list button')];
      expect(chips.map((chip) => chip.textContent?.trim())).toEqual(['robots', 'drone']);
      expect(el.querySelector('.recent__list')?.getAttribute('aria-labelledby')).toBe(
        'recent-label',
      );

      chips[1].click();
      await fixture.whenStable();

      expect(searched).toEqual(['drone']);
      expect(input().value).toBe('drone');
    });

    it('can be cleared', async () => {
      button('Clear history').click();
      await fixture.whenStable();

      expect(el.querySelector('.recent')).toBeNull();
      expect(localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY)).toBeNull();
      expect(document.activeElement).toBe(input());
    });
  });
});
