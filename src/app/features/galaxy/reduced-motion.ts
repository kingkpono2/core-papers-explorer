import { DOCUMENT, DestroyRef, Injectable, inject, signal } from '@angular/core';

/** Whether the system asks for reduced motion, kept up to date as the setting changes. */
@Injectable({ providedIn: 'root' })
export class ReducedMotion {
  private readonly query = inject(DOCUMENT).defaultView?.matchMedia(
    '(prefers-reduced-motion: reduce)',
  );
  private readonly matches = signal(this.query?.matches ?? false);
  readonly reduced = this.matches.asReadonly();

  constructor() {
    const update = (event: MediaQueryListEvent) => this.matches.set(event.matches);
    this.query?.addEventListener('change', update);
    inject(DestroyRef).onDestroy(() => this.query?.removeEventListener('change', update));
  }
}
