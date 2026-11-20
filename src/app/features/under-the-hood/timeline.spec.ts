import { RequestLogEntry } from '../../core/diagnostics/request-log';
import { makeEntry, makeMemoryHit } from '../../../testing/request-log.fixture';
import {
  describeSegments,
  endpointLabel,
  followUpText,
  formatBytes,
  formatMs,
  injectedLabel,
  segments,
  statusOf,
  timelineScale,
} from './timeline';

describe('segments', () => {
  it("splits an attempt's time into CORE, the rest of the proxy and the network", () => {
    expect(segments(makeEntry({ durationMs: 640, coreMs: 512, proxyMs: 530 }))).toEqual([
      { kind: 'core', ms: 512 },
      { kind: 'proxy', ms: 18 },
      { kind: 'network', ms: 110 },
    ]);
  });

  it('puts the time a Break it switch held the attempt first', () => {
    expect(
      segments(makeEntry({ durationMs: 5_640, injectedDelayMs: 5_000, coreMs: 512, proxyMs: 530 })),
    ).toEqual([
      { kind: 'held', ms: 5_000 },
      { kind: 'core', ms: 512 },
      { kind: 'proxy', ms: 18 },
      { kind: 'network', ms: 110 },
    ]);
  });

  it('does not split the time without Server-Timing, as behind the dev proxy', () => {
    expect(segments(makeEntry({ durationMs: 700 }))).toEqual([{ kind: 'total', ms: 700 }]);
  });

  it('counts a CDN hit as all network, whatever its replayed Server-Timing says', () => {
    expect(
      segments(makeEntry({ durationMs: 40, cdnCache: 'HIT', coreMs: 512, proxyMs: 530 })),
    ).toEqual([{ kind: 'network', ms: 40 }]);
  });

  it('splits a request the proxy answered without CORE between proxy and network', () => {
    expect(segments(makeEntry({ durationMs: 50, proxyMs: 2 }))).toEqual([
      { kind: 'proxy', ms: 2 },
      { kind: 'network', ms: 48 },
    ]);
  });

  it('never gives more time than the browser measured, or negative parts', () => {
    expect(segments(makeEntry({ durationMs: 100, coreMs: 150, proxyMs: 140 }))).toEqual([
      { kind: 'core', ms: 100 },
    ]);
  });

  it('draws nothing for a faked failure, a memory hit or an attempt still pending', () => {
    expect(segments(makeEntry({ injected: 'offline', status: 0, durationMs: 1 }))).toEqual([]);
    expect(segments(makeMemoryHit())).toEqual([]);
    expect(segments(makeEntry({ outcome: 'pending', durationMs: null }))).toEqual([]);
    expect(
      segments(makeEntry({ injected: 'rate-limit', injectedDelayMs: 5_000, durationMs: 5_000 })),
    ).toEqual([{ kind: 'held', ms: 5_000 }]);
  });
});

describe('timeline formatting', () => {
  it('measures bars against the slowest attempt, and at least a second', () => {
    expect(timelineScale([])).toBe(1_000);
    expect(timelineScale([makeEntry({ durationMs: 200 })])).toBe(1_000);
    expect(timelineScale([makeEntry({ durationMs: 5_640 }), makeEntry({ durationMs: null })])).toBe(
      5_640,
    );
  });

  it('writes durations in ms under a second, then in seconds', () => {
    expect(formatMs(0)).toBe('0 ms');
    expect(formatMs(640.4)).toBe('640 ms');
    expect(formatMs(999.4)).toBe('999 ms');
    expect(formatMs(1_000)).toBe('1.0 s');
    expect(formatMs(5_640)).toBe('5.6 s');
    expect(formatMs(30_000)).toBe('30 s');
  });

  it('writes sizes in bytes and kB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(18_234)).toBe('18.2 kB');
  });

  it('writes the parts of a bar out in words', () => {
    expect(
      describeSegments([
        { kind: 'held', ms: 5_000 },
        { kind: 'core', ms: 512 },
        { kind: 'network', ms: 110 },
      ]),
    ).toBe('held by Break it 5.0 s · CORE 512 ms · network 110 ms');
  });

  it('names the two endpoints', () => {
    expect(endpointLabel('/search/works/')).toBe('search');
    expect(endpointLabel('/search/works/aggregate')).toBe('aggregate');
    expect(endpointLabel('/elsewhere')).toBe('/elsewhere');
  });
});

describe('statusOf', () => {
  it('labels each outcome, with a tone that never stands alone', () => {
    expect(statusOf(makeEntry())).toEqual({ label: '200', tone: 'ok' });
    expect(statusOf(makeMemoryHit())).toEqual({ label: 'Memory', tone: 'memory' });
    expect(statusOf(makeEntry({ outcome: 'pending', status: null }))).toEqual({
      label: 'Pending',
      tone: 'neutral',
    });
    expect(statusOf(makeEntry({ outcome: 'cancelled', status: null }))).toEqual({
      label: 'Cancelled',
      tone: 'neutral',
    });
  });

  it("names a failure the way the app's error handling sees it", () => {
    const failed = (status: number | null, errorKind: RequestLogEntry['errorKind']) =>
      statusOf(makeEntry({ outcome: 'error', status, errorKind }));

    expect(failed(429, 'rate-limit')).toEqual({ label: '429 Rate limited', tone: 'warning' });
    expect(failed(0, 'network')).toEqual({ label: 'No response', tone: 'danger' });
    expect(failed(null, 'timeout')).toEqual({ label: 'Timed out', tone: 'danger' });
    expect(failed(500, 'bad-query')).toEqual({ label: '500 Rejected', tone: 'danger' });
    expect(failed(503, 'server')).toEqual({ label: '503 Server error', tone: 'danger' });
  });

  it('names the switch that faked an answer', () => {
    expect(injectedLabel(makeEntry({ injected: 'rate-limit' }))).toBe('Rate limited');
    expect(injectedLabel(makeEntry())).toBeNull();
  });
});

describe('followUpText', () => {
  const after = (followUp: RequestLogEntry['followUp']) =>
    followUpText(makeEntry({ outcome: 'error', followUp }));

  it('says when the next attempt comes, and why then', () => {
    expect(after({ type: 'retry', delayMs: 3_000, reason: 'retry-after' })).toBe(
      'Next attempt after 3.0 s, as CORE’s Retry-After asked',
    );
    expect(after({ type: 'retry', delayMs: 1_000, reason: 'backoff' })).toBe(
      'Next attempt after 1.0 s: exponential backoff',
    );
  });

  it('says why there was no next attempt', () => {
    expect(
      followUpText(
        makeEntry({ errorKind: 'bad-query', followUp: { type: 'give-up', reason: 'permanent' } }),
      ),
    ).toBe('Not retried: CORE rejected the query, so it would fail again');
    expect(
      followUpText(
        makeEntry({ errorKind: 'timeout', followUp: { type: 'give-up', reason: 'permanent' } }),
      ),
    ).toBe('Not retried: it timed out');
    expect(after({ type: 'give-up', reason: 'exhausted' })).toBe('Gave up: every retry was used');
    expect(after({ type: 'give-up', reason: 'wait-budget' })).toBe(
      'Gave up: CORE asked for a longer wait than the app allows',
    );
    expect(after({ type: 'cancelled' })).toBe('Retry cancelled by a newer request');
    expect(after(null)).toBeNull();
  });
});
