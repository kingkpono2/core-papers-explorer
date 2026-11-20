import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { FAULT_SWITCHES, FaultInjection } from '../../diagnostics/fault-injection';

/** Set on the root element while the banner shows: its height, for other sticky content. */
export const FAULT_BANNER_OFFSET = '--fault-banner-offset';

/**
 * Says, on every page, that Break it switches are on, so a sabotaged request is never mistaken for
 * a real failure, and turns them all off in one click.
 */
@Component({
  selector: 'app-fault-banner',
  templateUrl: './fault-banner.html',
  styleUrl: './fault-banner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FaultBanner {
  private readonly document = inject(DOCUMENT);
  private readonly banner = viewChild<ElementRef<HTMLElement>>('banner');
  protected readonly faults = inject(FaultInjection);

  protected readonly names = computed(() => {
    const enabled = this.faults.enabled();
    return FAULT_SWITCHES.filter(({ mode }) => enabled.has(mode))
      .map(({ label }) => label)
      .join(', ');
  });

  constructor() {
    // The banner sticks to the top of the window, so the sticky chart and anything scrolled into
    // view by focus are kept clear of it, at whatever height it wraps to.
    effect((onCleanup) => {
      const banner = this.banner()?.nativeElement;
      if (!banner) {
        return;
      }
      const root = this.document.documentElement;
      const observer = new ResizeObserver(() =>
        root.style.setProperty(FAULT_BANNER_OFFSET, `${banner.offsetHeight}px`),
      );
      observer.observe(banner);
      onCleanup(() => {
        observer.disconnect();
        root.style.removeProperty(FAULT_BANNER_OFFSET);
      });
    });
  }

  /** The button goes with the banner, so focus moves to the page rather than being lost. */
  protected turnOff(): void {
    this.faults.turnOff();
    this.document.getElementById('main-content')?.focus();
  }
}
