import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { IsActiveMatchOptions, RouterLink, RouterLinkActive } from '@angular/router';
import { FaultInjection } from '../../diagnostics/fault-injection';
import { UnderTheHood } from '../../diagnostics/under-the-hood';
import { ThemeToggle } from '../theme-toggle/theme-toggle';

/** Input types that take typed text, where Shift+D is a capital D and nothing else. */
const NON_TEXT_INPUTS = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

@Component({
  selector: 'app-site-header',
  imports: [RouterLink, RouterLinkActive, ThemeToggle],
  templateUrl: './site-header.html',
  styleUrl: './site-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'toggleOnShortcut($event)' },
})
export class SiteHeader {
  private readonly document = inject(DOCUMENT);
  private readonly hoodButton = viewChild.required<ElementRef<HTMLButtonElement>>('hoodButton');
  protected readonly hood = inject(UnderTheHood);
  protected readonly faults = inject(FaultInjection);

  /** "Search" is current on the search page, whatever the search. */
  protected readonly exactPath: IsActiveMatchOptions = {
    paths: 'exact',
    queryParams: 'ignored',
    matrixParams: 'ignored',
    fragment: 'ignored',
  };

  protected openHood(): void {
    this.hood.open(this.hoodButton().nativeElement);
  }

  /**
   * Shift+D opens and closes Under the hood from anywhere, unless the user is typing. Focus goes
   * back to where it was, or to the header button if nothing had focus.
   */
  protected toggleOnShortcut(event: KeyboardEvent): void {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (
      !event.shiftKey ||
      event.key.toLowerCase() !== 'd' ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.defaultPrevented ||
      (target && isTyping(target))
    ) {
      return;
    }
    event.preventDefault();
    const focused = this.document.activeElement;
    const opener =
      focused instanceof HTMLElement && focused !== this.document.body
        ? focused
        : this.hoodButton().nativeElement;
    this.hood.toggle(opener);
  }
}

function isTyping(target: HTMLElement): boolean {
  if (target.isContentEditable || target.closest('textarea, select')) {
    return true;
  }
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type);
}
