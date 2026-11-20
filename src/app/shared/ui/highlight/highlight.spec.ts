import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Highlight, splitHighlights } from './highlight';

const marked = (text: string, terms: string[]) =>
  splitHighlights(text, terms)
    .map((part) => (part.match ? `[${part.text}]` : part.text))
    .join('');

describe('splitHighlights', () => {
  it('marks whole words, ignoring case', () => {
    expect(marked('Drone delivery by drones, not androne', ['drone'])).toBe(
      '[Drone] delivery by [drones], not androne',
    );
  });

  it('prefers a phrase over the words inside it and allows any spacing', () => {
    expect(marked('Drone  delivery and delivery drones', ['delivery', 'drone delivery'])).toBe(
      '[Drone  delivery] and [delivery] drones',
    );
  });

  it('expands * and ? wildcards', () => {
    expect(marked('Drones droned dronk', ['dron*'])).toBe('[Drones] [droned] [dronk]');
    expect(marked('colour color', ['colo?r'])).toBe('[colour] color');
  });

  it('treats regular expression characters as text', () => {
    expect(marked('Using C++ (and C) for a.b', ['C++', 'a.b'])).toBe(
      'Using [C++] (and C) for [a.b]',
    );
  });

  it('matches letters outside ASCII', () => {
    expect(marked('Énergie et énergie solaire', ['énergie'])).toBe(
      '[Énergie] et [énergie] solaire',
    );
  });

  it('returns the text as one part when there is nothing to mark', () => {
    expect(splitHighlights('Drone', [])).toEqual([{ text: 'Drone', match: false }]);
    expect(splitHighlights('Drone', ['*'])).toEqual([{ text: 'Drone', match: false }]);
    expect(splitHighlights('', ['drone'])).toEqual([]);
  });
});

describe('Highlight', () => {
  it('wraps matches in mark elements without parsing the text as HTML', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Highlight);
    fixture.componentRef.setInput('text', '<b>Drone</b> delivery');
    fixture.componentRef.setInput('terms', ['drone']);
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toBe('<b>Drone</b> delivery');
    expect(el.querySelector('b')).toBeNull();
    expect([...el.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual(['Drone']);
  });
});
