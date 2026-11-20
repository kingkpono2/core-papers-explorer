import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RequestLog, RequestStart } from '../../../core/diagnostics/request-log';
import { UnderTheHood } from '../../../core/diagnostics/under-the-hood';
import { ANNOUNCE_INTERVAL_MS, HoodDrawer } from './hood-drawer';

describe('HoodDrawer', () => {
  let fixture: ComponentFixture<HoodDrawer>;
  let el: HTMLElement;
  let hood: UnderTheHood;
  let log: RequestLog;
  let opener: HTMLButtonElement;

  const dialog = () => el.querySelector<HTMLDialogElement>('dialog')!;
  const stable = () => fixture.whenStable();
  const press = async (key: string, options: KeyboardEventInit = {}) => {
    const target = (document.activeElement as HTMLElement | null) ?? dialog();
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...options,
    });
    target.dispatchEvent(event);
    await stable();
    return event;
  };
  const open = async (focus: Parameters<UnderTheHood['open']>[1] = null) => {
    hood.open(opener, focus);
    await stable();
  };
  const focusable = () =>
    [...dialog().querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input')].filter(
      (element) => element.getClientRects().length > 0,
    );
  const closeEvent = () =>
    new Promise((resolve) => dialog().addEventListener('close', resolve, { once: true }));
  const announcement = () => el.querySelector('.announcement[role="status"]')?.textContent;
  const fail = (overrides: Partial<RequestStart> = {}) => {
    const id = log.start({
      trace: 1,
      attempt: 1,
      method: 'GET',
      endpoint: '/search/works/',
      query: 'drone',
      injected: null,
      injectedDelayMs: 0,
      ...overrides,
    });
    log.fail(id, 'server', {
      status: 503,
      sizeBytes: null,
      coreMs: null,
      proxyMs: null,
      cdnCache: null,
      rateLimit: null,
      requestId: null,
    });
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    hood = TestBed.inject(UnderTheHood);
    log = TestBed.inject(RequestLog);
    opener = document.createElement('button');
    opener.textContent = 'Under the hood';
    document.body.appendChild(opener);
    opener.focus();
    fixture = TestBed.createComponent(HoodDrawer);
    el = fixture.nativeElement;
    await stable();
  });

  afterEach(() => {
    fixture.destroy();
    opener.remove();
  });

  it('draws nothing and reads nothing while closed', async () => {
    const entries = spyOn(log, 'entries').and.callThrough();
    fail();
    await stable();

    expect(dialog().open).toBeFalse();
    expect(dialog().children.length).toBe(0);
    expect(entries).not.toHaveBeenCalled();
  });

  it('opens as a labelled modal dialog with focus on its heading', async () => {
    await open();

    expect(dialog().open).toBeTrue();
    expect(dialog().matches(':modal')).toBeTrue();
    expect(dialog().getAttribute('aria-labelledby')).toBe('hood-heading');
    expect(el.querySelector('#hood-heading')?.textContent).toBe('Under the hood');
    expect(document.activeElement).toBe(el.querySelector('#hood-heading'));
    expect(
      [...el.querySelectorAll('h3')].map((h) => h.textContent?.replace(/\s+/g, ' ').trim()),
    ).toEqual(['What you’re seeing', 'Session', 'Break it', 'Live requests (0)']);
  });

  it('can open on a Break it switch', async () => {
    await open('rate-limit');

    expect(document.activeElement?.id).toBe('fault-rate-limit');
  });

  it('closes on Escape and gives focus back to what opened it', async () => {
    await open();

    const event = await press('Escape');

    expect(event.defaultPrevented).toBeTrue();
    expect(hood.isOpen()).toBeFalse();
    expect(dialog().open).toBeFalse();
    expect(dialog().children.length).toBe(0);
    expect(document.activeElement).toBe(opener);
  });

  it('closes with its labelled close button, and on a click on the backdrop', async () => {
    await open();
    const close = el.querySelector<HTMLButtonElement>('button[aria-label="Close Under the hood"]')!;
    close.click();
    await stable();
    expect(hood.isOpen()).toBeFalse();
    expect(document.activeElement).toBe(opener);

    await open();
    el.querySelector<HTMLElement>('.drawer__panel')!.click();
    await stable();
    expect(hood.isOpen()).withContext('a click inside the panel').toBeTrue();
    dialog().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await stable();
    expect(hood.isOpen()).toBeFalse();
  });

  it('stays open when reopened straight after closing', async () => {
    await open();
    const closed = closeEvent();
    hood.close();
    await stable();
    // Reopen before the close event, which comes a task after the dialog closes.
    hood.open(opener);
    await closed;
    await stable();

    expect(hood.isOpen()).toBeTrue();
    expect(dialog().open).toBeTrue();
  });

  it('follows the browser if it closes the dialog by itself', async () => {
    await open();
    const closed = closeEvent();

    dialog().close();
    await closed;
    await stable();

    expect(hood.isOpen()).toBeFalse();
    expect(document.activeElement).toBe(opener);
  });

  it('keeps focus inside: Tab from the last control goes to the first, Shift+Tab back', async () => {
    await open();
    const controls = focusable();
    const first = controls[0];
    const last = controls[controls.length - 1];
    expect(first.getAttribute('aria-label')).toBe('Close Under the hood');

    last.focus();
    const forward = await press('Tab');
    expect(forward.defaultPrevented).toBeTrue();
    expect(document.activeElement).toBe(first);

    const backward = await press('Tab', { shiftKey: true });
    expect(backward.defaultPrevented).toBeTrue();
    expect(document.activeElement).toBe(last);

    // From the heading, which has focus on opening, Shift+Tab also wraps to the end.
    el.querySelector<HTMLElement>('#hood-heading')!.focus();
    await press('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(last);

    // Tab between controls is left to the browser.
    controls[1].focus();
    expect((await press('Tab')).defaultPrevented).toBeFalse();
  });

  it('shows requests as they happen', async () => {
    await open();

    fail({ query: 'robots' });
    await stable();

    expect(el.querySelector('app-request-timeline .row__query')?.textContent).toBe('robots');
    expect(el.querySelector('#hood-stats-heading')).not.toBeNull();
  });

  describe('announcements', () => {
    beforeEach(() => {
      jasmine.clock().install();
      jasmine.clock().mockDate(new Date('2026-11-20T10:00:00Z'));
    });

    afterEach(() => jasmine.clock().uninstall());

    it('announces new failures politely, at most every few seconds', async () => {
      fail({ query: 'before opening' });
      await open();
      expect(announcement()).toBe('');

      fail({ query: 'drone' });
      await stable();
      expect(announcement()).toBe('Attempt 1 of search for “drone” failed: 503 Server error.');

      fail({ query: 'robots', attempt: 2 });
      fail({ query: 'cells', attempt: 3 });
      await stable();
      expect(announcement()).toContain('“drone”');

      jasmine.clock().tick(ANNOUNCE_INTERVAL_MS);
      await stable();
      expect(announcement()).toBe(
        '2 attempts failed. Latest: Attempt 3 of search for “cells” failed: 503 Server error.',
      );
    });

    it('says what the retry policy does next, and when a failure was faked', async () => {
      await open();
      const id = log.start({
        trace: 5,
        attempt: 1,
        method: 'GET',
        endpoint: '/search/works/',
        query: 'drone',
        injected: 'rate-limit',
        injectedDelayMs: 0,
      });
      log.fail(id, 'rate-limit', {
        status: 429,
        sizeBytes: null,
        coreMs: null,
        proxyMs: null,
        cdnCache: null,
        rateLimit: null,
        requestId: null,
      });
      log.note(5, { type: 'retry', delayMs: 3_000, reason: 'retry-after' });
      await stable();

      expect(announcement()).toBe(
        'Attempt 1 of search for “drone” failed: 429 Rate limited, faked by Break it. ' +
          'Next attempt after 3.0 s, as CORE’s Retry-After asked',
      );
    });
  });
});
