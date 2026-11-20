import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RequestLog, RequestLogEntry } from '../../../core/diagnostics/request-log';
import { makeEntry, makeMemoryHit } from '../../../../testing/request-log.fixture';
import { RequestTimeline } from './request-timeline';

describe('RequestTimeline', () => {
  let fixture: ComponentFixture<RequestTimeline>;
  let el: HTMLElement;

  const render = async (entries: RequestLogEntry[]) => {
    fixture.componentRef.setInput('entries', entries);
    await fixture.whenStable();
  };
  const rows = () => [...el.querySelectorAll<HTMLElement>('ol.rows > li')];
  const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RequestTimeline],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(RequestTimeline);
    el = fixture.nativeElement;
  });

  it('says how to fill it while empty', async () => {
    await render([]);

    expect(text(el.querySelector('h3'))).toBe('Live requests (0)');
    expect(text(el.querySelector('.empty'))).toContain('No requests yet');
    expect(el.querySelector('ol')).toBeNull();
  });

  it('lists requests in the order given, newest first, in a labelled list', async () => {
    await render([makeEntry({ query: 'newer' }), makeEntry({ query: 'older' })]);

    expect(el.querySelector('ol')?.getAttribute('aria-label')).toBe('Requests, newest first');
    expect(rows().map((row) => text(row.querySelector('.row__query')))).toEqual(['newer', 'older']);
  });

  it('shows when, what, the outcome and where the time went', async () => {
    await render([
      makeEntry({
        trace: 14,
        attempt: 2,
        query: 'drone AND delivery',
        startedAt: new Date(2026, 10, 20, 13, 57, 2).getTime(),
        durationMs: 640,
        coreMs: 512,
        proxyMs: 530,
        cdnCache: 'MISS',
        sizeBytes: 18_234,
        rateLimit: { remaining: 9, limit: 10 },
      }),
    ]);
    const [row] = rows();

    expect(text(row.querySelector('.status'))).toBe('200');
    expect(row.querySelector('.status')?.classList).toContain('status--ok');
    expect(text(row.querySelector('.row__what'))).toBe('GET search');
    expect(text(row.querySelector('.row__duration'))).toBe('640 ms');
    expect(text(row.querySelector('.row__split'))).toBe(
      'CORE 512 ms · proxy 18 ms · network 110 ms',
    );
    expect(text(row.querySelector('.row__meta span'))).toBe(
      '13:57:02 · request 14, attempt 2 · 18.2 kB · budget 9/10',
    );
    expect(text(row.querySelector('.tag'))).toBe(', CDN miss');
    expect(row.querySelector('.tag--hit')).toBeNull();
    const bar = row.querySelector('.bar')!;
    expect(bar.getAttribute('aria-hidden')).toBe('true');
    expect([...bar.querySelectorAll<HTMLElement>('.bar__part')].map((p) => p.className)).toEqual([
      'bar__part bar__part--core',
      'bar__part bar__part--proxy',
      'bar__part bar__part--network',
    ]);
    expect(bar.querySelector<HTMLElement>('.bar__fill')!.style.width).toBe('64%');
  });

  it("badges a response from Vercel's CDN cache as a hit", async () => {
    await render([makeEntry({ cdnCache: 'HIT', durationMs: 40 })]);

    const badge = rows()[0].querySelector('.tag')!;
    expect(text(badge)).toBe(', CDN hit');
    expect(badge.classList).toContain('tag--hit');
    expect(text(rows()[0].querySelector('.row__split'))).toBe('network 40 ms');
  });

  it('draws bars against the slowest attempt listed', async () => {
    await render([makeEntry({ durationMs: 5_000 }), makeEntry({ durationMs: 1_250 })]);

    expect(rows().map((row) => row.querySelector<HTMLElement>('.bar__fill')!.style.width)).toEqual([
      '100%',
      '25%',
    ]);
  });

  it('marks a faked failure and says what the retry policy did next', async () => {
    await render([
      makeEntry({
        outcome: 'error',
        status: 429,
        errorKind: 'rate-limit',
        injected: 'rate-limit',
        durationMs: 0,
        followUp: { type: 'retry', delayMs: 3_000, reason: 'retry-after' },
      }),
    ]);
    const [row] = rows();

    expect(text(row.querySelector('.status'))).toBe('429 Rate limited');
    expect(row.querySelector('.status')?.classList).toContain('status--warning');
    expect(text(row.querySelector('.tag--faked'))).toBe(', Faked: Rate limited');
    expect(row.querySelector('.tag--faked .visually-hidden')?.textContent).toBe(', ');
    expect(text(row.querySelector('.row__follow-up'))).toBe(
      'Next attempt after 3.0 s, as CORE’s Retry-After asked',
    );
    expect(row.querySelector('.bar')).toBeNull();
  });

  it('shows a request answered from memory as one that cost nothing', async () => {
    await render([makeMemoryHit({ query: 'drone' })]);
    const [row] = rows();

    expect(text(row.querySelector('.status'))).toBe('Memory');
    expect(text(row.querySelector('.row__note'))).toBe('Served from memory · 0 requests');
    expect(row.querySelector('.row__duration')).toBeNull();
    expect(text(row.querySelector('.row__meta'))).not.toContain('attempt');
  });

  it('shows an attempt still waiting for an answer', async () => {
    await render([makeEntry({ outcome: 'pending', status: null, durationMs: null })]);

    expect(text(rows()[0].querySelector('.status'))).toBe('Pending');
    expect(rows()[0].querySelector('.bar--pending')).not.toBeNull();
  });

  it('says when the time cannot be split because there is no Server-Timing', async () => {
    await render([makeEntry({ durationMs: 300 })]);
    expect(text(el.querySelector('.hint'))).toContain('No Server-Timing');

    await render([makeEntry({ durationMs: 300, coreMs: 200, proxyMs: 210 }), makeMemoryHit()]);
    expect(el.querySelector('.hint')).toBeNull();
  });

  it("copies the proxy's request id, and says so", async () => {
    const writeText = spyOn(navigator.clipboard, 'writeText').and.resolveTo();
    await render([makeEntry({ requestId: '3f2a91c4-0d1e-4b7a-9c55-1f2e3d4c5b6a' })]);
    const copy = rows()[0].querySelector<HTMLButtonElement>('button.copy')!;

    expect(copy.getAttribute('aria-label')).toBe(
      'Copy request ID 3f2a91c4-0d1e-4b7a-9c55-1f2e3d4c5b6a',
    );
    expect(text(copy)).toBe('3f2a91c4');
    copy.click();
    await fixture.whenStable();

    expect(writeText).toHaveBeenCalledOnceWith('3f2a91c4-0d1e-4b7a-9c55-1f2e3d4c5b6a');
    expect(text(el.querySelector('[role="status"]'))).toBe('Request ID copied');
  });

  it('clears the log', async () => {
    const log = TestBed.inject(RequestLog);
    const clear = spyOn(log, 'clear');
    await render([makeEntry()]);

    [...el.querySelectorAll('button')].find((b) => text(b) === 'Clear')!.click();

    expect(clear).toHaveBeenCalled();
  });

  it('labels every bar colour in a legend', async () => {
    await render([]);

    expect([...el.querySelectorAll('.legend li')].map((li) => text(li))).toEqual([
      'CORE',
      'proxy',
      'network',
      'held by Break it',
    ]);
  });
});
