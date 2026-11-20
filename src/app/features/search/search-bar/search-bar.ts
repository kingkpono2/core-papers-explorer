import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Diagnostic, analyseQuery, normaliseQuery } from '../query/query-analyser';
import { RecentSearches } from '../recent-searches';
import { HELP_EXAMPLES, SearchHelp } from '../search-help/search-help';

/** How long typing has to pause before problems are shown. Submitting shows them at once. */
export const VALIDATION_DELAY_MS = 500;
const EXCERPT_CONTEXT = 16;

interface Problem extends Diagnostic {
  excerpt: { before: string; text: string; after: string } | null;
}

/**
 * The search box. It checks the query as the user types and only emits `searched` for a query with
 * no errors, so a malformed query never reaches CORE.
 */
@Component({
  selector: 'app-search-bar',
  imports: [SearchHelp],
  templateUrl: './search-bar.html',
  styleUrl: './search-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchBar {
  /** The query in the URL. */
  readonly query = input('');
  readonly searched = output<string>();

  protected readonly recent = inject(RecentSearches);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('queryInput');
  private readonly helpToggle = viewChild.required<ElementRef<HTMLButtonElement>>('helpToggle');
  private timer?: ReturnType<typeof setTimeout>;

  protected readonly placeholder = HELP_EXAMPLES[0];
  protected readonly text = linkedSignal(() => this.query());
  /** The text the messages describe. It catches up with `text` after a pause or on submit. */
  private readonly checked = linkedSignal(() => this.query());
  private readonly submitted = linkedSignal({ source: this.query, computation: () => false });
  protected readonly helpOpen = signal(false);

  protected readonly problems = computed<Problem[]>(() => {
    const text = this.checked();
    return analyseQuery(text)
      .diagnostics.filter((d) => d.code !== 'empty-query' || this.submitted())
      .map((d) => ({ ...d, excerpt: excerpt(text, d) }));
  });
  protected readonly invalid = computed(() => this.problems().some((p) => p.severity === 'error'));

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected edit(value: string): void {
    this.text.set(value);
    this.submitted.set(false);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.checked.set(value), VALIDATION_DELAY_MS);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.run(this.text());
  }

  /** Searches for the query, or shows why it cannot. */
  protected run(query: string): void {
    clearTimeout(this.timer);
    this.text.set(query);
    this.checked.set(query);
    this.submitted.set(true);
    if (analyseQuery(query).hasErrors) {
      this.input().nativeElement.focus();
    } else {
      this.searched.emit(normaliseQuery(query));
    }
  }

  protected clear(event: Event): void {
    if (!this.text()) {
      return;
    }
    event.preventDefault();
    clearTimeout(this.timer);
    this.text.set('');
    this.checked.set('');
    this.submitted.set(false);
  }

  /** Selects the part of the query a message is about. */
  protected select({ start, end }: Diagnostic): void {
    const field = this.input().nativeElement;
    field.focus();
    field.setSelectionRange(start, end);
  }

  /** Inserts a field such as `title:` at the cursor, with a space before it if needed. */
  protected insert(snippet: string): void {
    const field = this.input().nativeElement;
    const { value } = field;
    const start = field.selectionStart ?? value.length;
    const head = value.slice(0, start);
    const inserted = (/[^\s(]$/.test(head) ? `${head} ` : head) + snippet;
    field.value = inserted + value.slice(field.selectionEnd ?? start);
    field.focus();
    field.setSelectionRange(inserted.length, inserted.length);
    this.edit(field.value);
  }

  protected runExample(query: string): void {
    this.helpOpen.set(false);
    this.run(query);
  }

  protected closeHelp(): void {
    this.helpOpen.set(false);
    this.helpToggle().nativeElement.focus();
  }

  protected clearHistory(): void {
    this.recent.clear();
    this.input().nativeElement.focus();
  }
}

function excerpt(text: string, { start, end }: Diagnostic): Problem['excerpt'] {
  if (end <= start) {
    return null;
  }
  const from = Math.max(0, start - EXCERPT_CONTEXT);
  const to = Math.min(text.length, end + EXCERPT_CONTEXT);
  return {
    before: (from > 0 ? '…' : '') + text.slice(from, start),
    text: text.slice(start, end),
    after: text.slice(end, to) + (to < text.length ? '…' : ''),
  };
}
