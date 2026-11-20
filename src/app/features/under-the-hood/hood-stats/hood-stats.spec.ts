import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RequestLogEntry } from '../../../core/diagnostics/request-log';
import { makeEntry, makeMemoryHit } from '../../../../testing/request-log.fixture';
import { HoodStats } from './hood-stats';

describe('HoodStats', () => {
  let fixture: ComponentFixture<HoodStats>;
  let el: HTMLElement;

  const render = async (entries: RequestLogEntry[]) => {
    fixture.componentRef.setInput('entries', entries);
    await fixture.whenStable();
  };
  /** Each tile's label and what it says, as a screen reader would pair them. */
  const tiles = () =>
    Object.fromEntries(
      [...el.querySelectorAll('.tile')].map((tile) => [
        tile.querySelector('dt')!.textContent!.trim(),
        [...tile.querySelectorAll('dd')].map((dd) => dd.textContent!.replace(/\s+/g, ' ').trim()),
      ]),
    );

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HoodStats],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(HoodStats);
    el = fixture.nativeElement;
  });

  it('shows dashes, not zeros, before any request', async () => {
    await render([]);

    expect(tiles()['Median (p50)'][0]).toBe('—');
    expect(tiles()['Error rate'][0]).toBe('—');
    expect(tiles()['Rate-limit budget'][0]).toBe('Not known yet');
    expect(el.querySelector('.gauge')).toBeNull();
  });

  it('shows the figures for the session in labelled tiles', async () => {
    await render([
      makeMemoryHit(),
      makeEntry({ durationMs: 400, cdnCache: 'HIT', rateLimit: { remaining: 8, limit: 10 } }),
      makeEntry({ durationMs: 1_200 }),
      makeEntry({ outcome: 'error', status: 429, errorKind: 'rate-limit', injected: 'rate-limit' }),
    ]);

    expect(el.querySelector('h3')?.textContent).toBe('Session');
    expect(tiles()).toEqual(
      jasmine.objectContaining({
        Requests: ['2', 'plus 1 faked by Break it'],
        'Median (p50)': ['400 ms', 'per attempt'],
        'p95 latency': ['1.2 s', 'per attempt'],
        'Error rate': ['33%', '1 of 3 attempts'],
        'Cache hit rate': ['67%', 'memory + CDN'],
        'Saved by cache': ['2', '1 memory · 1 CDN'],
      }),
    );
    expect(tiles()['Rate-limit budget'][0]).toBe('8 of 10 left');
  });

  it('fills the budget gauge in proportion, with a warning colour as it runs low', async () => {
    const budget = async (remaining: number) => {
      await render([makeEntry({ rateLimit: { remaining, limit: 10 } })]);
      const gauge = el.querySelector<HTMLElement>('.gauge')!;
      return {
        width: gauge.querySelector<HTMLElement>('.gauge__fill')!.style.width,
        low: gauge.classList.contains('gauge--low'),
        critical: gauge.classList.contains('gauge--critical'),
        hidden: gauge.getAttribute('aria-hidden'),
      };
    };

    expect(await budget(8)).toEqual({ width: '80%', low: false, critical: false, hidden: 'true' });
    expect(await budget(4)).toEqual({ width: '40%', low: true, critical: false, hidden: 'true' });
    expect(await budget(1)).toEqual({ width: '10%', low: false, critical: true, hidden: 'true' });
  });
});
