import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RequestLog, RequestLogEntry } from '../../../core/diagnostics/request-log';
import { UnderTheHood } from '../../../core/diagnostics/under-the-hood';
import { BreakIt } from '../break-it/break-it';
import { HoodStats } from '../hood-stats/hood-stats';
import { RequestTimeline } from '../request-timeline/request-timeline';
import { endpointLabel, followUpText, injectedLabel, statusOf } from '../timeline';

/** At most one announcement of new errors this often, so a burst of retries is not a barrage. */
export const ANNOUNCE_INTERVAL_MS = 3_000;

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]';
const NONE: readonly RequestLogEntry[] = [];

/**
 * The Under the hood drawer: a modal dialog on the right, or a bottom sheet on phones, with the
 * session's figures, the Break it switches and the live list of requests. Its contents only exist
 * while it is open, so the request log is only read, and the list only drawn, while someone looks.
 */
@Component({
  selector: 'app-hood-drawer',
  imports: [BreakIt, HoodStats, RequestTimeline],
  templateUrl: './hood-drawer.html',
  styleUrl: './hood-drawer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HoodDrawer {
  protected readonly hood = inject(UnderTheHood);
  private readonly log = inject(RequestLog);
  private readonly document = inject(DOCUMENT);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  /** Closed, this does not depend on the log, so recording never wakes the drawer up. */
  protected readonly entries = computed(() => (this.hood.isOpen() ? this.log.entries() : NONE));
  protected readonly announcement = signal('');

  /** Whether the dialog is showing as far as the drawer knows; see onClose. */
  private shown = false;
  private watching = false;
  private announced = new Set<number>();
  private queued: RequestLogEntry[] = [];
  private lastAnnouncedAt = -Infinity;
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const open = this.hood.isOpen();
      const entries = this.entries();
      untracked(() => this.watchForErrors(open, entries));
    });

    afterRenderEffect(() => {
      const dialog = this.dialog().nativeElement;
      if (this.hood.isOpen() && !this.shown) {
        this.shown = true;
        if (!dialog.open) {
          dialog.showModal();
        }
        const target = this.hood.focusTarget();
        const wanted = target ? dialog.querySelector<HTMLElement>(`#fault-${target}`) : null;
        (wanted ?? this.heading()?.nativeElement)?.focus();
      } else if (!this.hood.isOpen() && this.shown) {
        this.shown = false;
        if (dialog.open) {
          dialog.close();
        }
        this.hood.restoreFocus();
      }
    });

    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected close(): void {
    this.hood.close();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    } else if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  }

  /** The browser's own Escape handling; the drawer state decides. */
  protected onCancel(event: Event): void {
    event.preventDefault();
    this.close();
  }

  /**
   * Keeps the state in step if the browser closes the dialog some other way. The close event comes
   * a task after the dialog closed, so one from the drawer's own closing, arriving after a quick
   * reopen, must not close it again: only a dialog the drawer thinks is showing counts.
   */
  protected onClose(): void {
    if (this.shown && !this.dialog().nativeElement.open) {
      this.shown = false;
      this.hood.close();
      this.hood.restoreFocus();
    }
  }

  /** A click on the dialog itself rather than on its panel is a click on the backdrop. */
  protected onClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) {
      this.close();
    }
  }

  /** Tab and Shift+Tab go round inside the drawer instead of leaving it. */
  private trapFocus(event: KeyboardEvent): void {
    const focusable = [
      ...this.dialog().nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE),
    ].filter((element) => element.getClientRects().length > 0);
    const active = this.document.activeElement as HTMLElement | null;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first) {
      event.preventDefault();
    } else if (event.shiftKey && (active === first || !focusable.includes(active!))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /**
   * Announces attempts that fail while the drawer is open, politely and at most once every few
   * seconds; failures in between are summed up in the next announcement.
   */
  private watchForErrors(open: boolean, entries: readonly RequestLogEntry[]): void {
    const failed = entries.filter((entry) => entry.outcome === 'error');
    if (!open) {
      this.watching = false;
      this.queued = [];
      clearTimeout(this.timer);
      this.timer = undefined;
      this.announcement.set('');
      return;
    }
    if (!this.watching) {
      this.watching = true;
      this.announced = new Set(failed.map((entry) => entry.id));
      return;
    }
    const fresh = failed.filter((entry) => !this.announced.has(entry.id));
    if (!fresh.length) {
      return;
    }
    fresh.forEach((entry) => this.announced.add(entry.id));
    this.queued.push(...fresh);
    if (this.timer === undefined) {
      const wait = this.lastAnnouncedAt + ANNOUNCE_INTERVAL_MS - Date.now();
      if (wait <= 0) {
        this.flush();
      } else {
        this.timer = setTimeout(() => this.flush(), wait);
      }
    }
  }

  private flush(): void {
    this.timer = undefined;
    const queued = this.queued;
    this.queued = [];
    if (!queued.length) {
      return;
    }
    this.lastAnnouncedAt = Date.now();
    const latest = describeFailure(queued.reduce((a, b) => (b.id > a.id ? b : a)));
    this.announcement.set(
      queued.length === 1 ? latest : `${queued.length} attempts failed. Latest: ${latest}`,
    );
  }
}

function describeFailure(entry: RequestLogEntry): string {
  const what = endpointLabel(entry.endpoint) + (entry.query ? ` for “${entry.query}”` : '');
  const faked = injectedLabel(entry);
  const failure = `Attempt ${entry.attempt} of ${what} failed: ${statusOf(entry).label}`;
  return [`${failure}${faked ? `, faked by Break it` : ''}.`, followUpText(entry)]
    .filter(Boolean)
    .join(' ');
}
