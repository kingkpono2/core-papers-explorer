import { Injectable, signal } from '@angular/core';
import { FaultMode } from './fault-injection';

/**
 * Whether the Under the hood drawer is open, and where focus goes back to when it closes. The
 * drawer itself is loaded the first time it opens, so the app pays nothing for it until then.
 */
@Injectable({ providedIn: 'root' })
export class UnderTheHood {
  private readonly opened = signal(false);
  private readonly target = signal<FaultMode | null>(null);
  private opener: HTMLElement | null = null;

  readonly isOpen = this.opened.asReadonly();
  /** A Break it switch to focus on opening, instead of the drawer's heading. */
  readonly focusTarget = this.target.asReadonly();

  /** `opener` gets focus back on close; `focus` names a switch to start on. */
  open(opener: HTMLElement | null, focus: FaultMode | null = null): void {
    if (this.opened()) {
      return;
    }
    this.opener = opener;
    this.target.set(focus);
    this.opened.set(true);
  }

  close(): void {
    this.opened.set(false);
  }

  toggle(opener: HTMLElement | null): void {
    if (this.opened()) {
      this.close();
    } else {
      this.open(opener);
    }
  }

  /** Called by the drawer once its dialog has closed, when the page can take focus again. */
  restoreFocus(): void {
    const opener = this.opener;
    this.opener = null;
    this.target.set(null);
    if (opener?.isConnected) {
      opener.focus();
    }
  }
}
