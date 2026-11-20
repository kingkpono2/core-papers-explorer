import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface TextPart {
  text: string;
  match: boolean;
}

const WORD = '[\\p{L}\\p{N}]';

/**
 * Splits text into matching and non-matching parts. Terms match whole words, case-insensitively,
 * with an optional plural "s" or "es"; `*` and `?` are wildcards and phrases allow any spacing.
 */
export function splitHighlights(text: string, terms: readonly string[]): TextPart[] {
  const pattern = toPattern(terms);
  if (!pattern || !text) {
    return text ? [{ text, match: false }] : [];
  }
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) {
      parts.push({ text: text.slice(last, match.index), match: false });
    }
    parts.push({ text: match[0], match: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    parts.push({ text: text.slice(last), match: false });
  }
  return parts;
}

function toPattern(terms: readonly string[]): RegExp | null {
  const alternatives = terms
    .map((term) => term.trim())
    .filter((term) => /[\p{L}\p{N}]/u.test(term))
    // Longer terms first, so a phrase wins over a word inside it.
    .sort((a, b) => b.length - a.length)
    .map((term) => {
      const body = term
        .split(/\s+/)
        .map((word) =>
          word
            .split('')
            .map((char) => (char === '*' ? `${WORD}*` : char === '?' ? WORD : escape(char)))
            .join(''),
        )
        .join('\\s+');
      return /[*?]$/.test(term) ? body : `${body}(?:e?s)?`;
    });
  return alternatives.length
    ? new RegExp(`(?<!${WORD})(?:${alternatives.join('|')})(?!${WORD})`, 'giu')
    : null;
}

function escape(char: string): string {
  return /[\\^$.|+()[\]{}/]/.test(char) ? `\\${char}` : char;
}

/** Text with the given search terms wrapped in `<mark>`, built from text nodes only. */
@Component({
  selector: 'app-highlight',
  // prettier-ignore
  template: `@for (part of parts(); track $index) {@if (part.match) {<mark>{{ part.text }}</mark>} @else {{{ part.text }}}}`,
  styles: `
    mark {
      color: inherit;
      background: var(--color-highlight);
      border-radius: 2px;
      box-shadow: 0 0 0 1px var(--color-highlight);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Highlight {
  readonly text = input.required<string>();
  readonly terms = input<readonly string[]>([]);

  protected readonly parts = computed(() => splitHighlights(this.text(), this.terms()));
}
