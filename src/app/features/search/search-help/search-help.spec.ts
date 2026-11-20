import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { analyseQuery } from '../query/query-analyser';
import { FIELD_SNIPPETS, HELP_EXAMPLES, SearchHelp } from './search-help';

describe('SearchHelp', () => {
  let fixture: ComponentFixture<SearchHelp>;
  let el: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(SearchHelp);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  it('only offers examples that the analyser accepts without comment', () => {
    for (const example of HELP_EXAMPLES) {
      expect(analyseQuery(example).diagnostics).withContext(example).toEqual([]);
    }
  });

  it('includes the example from the brief', () => {
    expect(el.textContent).toContain('(drone AND (package OR delivery))');
  });

  it('emits the example or field that was clicked', () => {
    const examples: string[] = [];
    const fields: string[] = [];
    fixture.componentInstance.exampleSelected.subscribe((value) => examples.push(value));
    fixture.componentInstance.fieldSelected.subscribe((value) => fields.push(value));
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('button')];

    buttons.find((b) => b.textContent?.trim() === HELP_EXAMPLES[1])!.click();
    buttons.find((b) => b.textContent?.trim() === FIELD_SNIPPETS[0])!.click();

    expect(examples).toEqual([HELP_EXAMPLES[1]]);
    expect(fields).toEqual([FIELD_SNIPPETS[0]]);
  });

  it('asks to close on Escape', () => {
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);

    el.querySelector('button')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    expect(closed).toBe(1);
  });
});
