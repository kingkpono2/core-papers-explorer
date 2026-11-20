import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';

const CONFIRMATION_MS = 2500;

/**
 * Shares the address of the current search through the system share sheet where there is one,
 * such as on phones, and copies it to the clipboard everywhere else.
 */
@Component({
  selector: 'app-share-link',
  templateUrl: './share-link.html',
  styleUrl: './share-link.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareLink {
  private readonly document = inject(DOCUMENT);
  private readonly navigator = this.document.defaultView!.navigator;
  private timer?: ReturnType<typeof setTimeout>;

  protected readonly canShare = typeof this.navigator.share === 'function';
  protected readonly status = signal<'copied' | 'failed' | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected async share(): Promise<void> {
    const url = this.document.location.href;
    if (this.canShare) {
      try {
        await this.navigator.share({ title: this.document.title, url });
        return;
      } catch (error) {
        // The user closed the share sheet.
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
      }
    }
    try {
      await this.navigator.clipboard.writeText(url);
      this.show('copied');
    } catch {
      this.show('failed');
    }
  }

  private show(status: 'copied' | 'failed'): void {
    clearTimeout(this.timer);
    this.status.set(status);
    this.timer = setTimeout(() => this.status.set(null), CONFIRMATION_MS);
  }
}
