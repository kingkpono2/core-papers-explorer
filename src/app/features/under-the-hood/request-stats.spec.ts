import { makeEntry, makeMemoryHit } from '../../../testing/request-log.fixture';
import { percentile, sessionStats } from './request-stats';

describe('percentile', () => {
  it('gives null for no values', () => {
    expect(percentile([], 50)).toBeNull();
  });

  it('gives the only value for one value', () => {
    expect(percentile([420], 50)).toBe(420);
    expect(percentile([420], 95)).toBe(420);
  });

  it('uses the nearest rank, so the answer is always one of the values', () => {
    const values = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1_000];

    expect(percentile(values, 50)).toBe(500);
    expect(percentile(values, 90)).toBe(900);
    expect(percentile(values, 95)).toBe(1_000);
    expect(percentile([100, 200], 50)).toBe(100);
    expect(percentile([100, 200], 51)).toBe(200);
  });

  it('does not care about order, and leaves the input alone', () => {
    const values = [900, 100, 500, 300, 700];

    expect(percentile(values, 50)).toBe(500);
    expect(values).toEqual([900, 100, 500, 300, 700]);
  });

  it('treats p at or past the ends as the smallest and largest values', () => {
    expect(percentile([3, 1, 2], 0)).toBe(1);
    expect(percentile([3, 1, 2], -10)).toBe(1);
    expect(percentile([3, 1, 2], 100)).toBe(3);
    expect(percentile([3, 1, 2], 150)).toBe(3);
  });

  it('finds p95 among twenty values', () => {
    const values = Array.from({ length: 20 }, (_, i) => (i + 1) * 10);

    expect(percentile(values, 95)).toBe(190);
    expect(percentile(values, 50)).toBe(100);
  });
});

describe('sessionStats', () => {
  it('gives empty figures for an empty log', () => {
    expect(sessionStats([])).toEqual({
      requests: 0,
      faked: 0,
      p50Ms: null,
      p95Ms: null,
      failed: 0,
      finished: 0,
      errorRate: null,
      memoryHits: 0,
      cdnHits: 0,
      cacheHitRate: null,
      budget: null,
    });
  });

  it('counts requests sent and faked, and the share that failed', () => {
    const stats = sessionStats([
      makeEntry({ durationMs: 640 }),
      makeEntry({ outcome: 'error', status: 503, errorKind: 'server', durationMs: 90 }),
      makeEntry({ outcome: 'error', status: 429, injected: 'rate-limit', durationMs: 0 }),
      makeEntry({ outcome: 'pending', status: null, durationMs: null }),
      makeEntry({ outcome: 'cancelled', status: null, durationMs: 120 }),
    ]);

    expect(stats.requests).toBe(4);
    expect(stats.faked).toBe(1);
    expect(stats.failed).toBe(2);
    expect(stats.finished).toBe(3);
    expect(stats.errorRate).toBeCloseTo(2 / 3);
  });

  it('works out latency from attempts that were sent and finished', () => {
    const stats = sessionStats([
      makeEntry({ durationMs: 300 }),
      makeEntry({ durationMs: 100 }),
      makeEntry({ durationMs: 5_400, injectedDelayMs: 5_000 }),
      makeEntry({ outcome: 'error', status: 0, errorKind: 'network', durationMs: 200 }),
      makeEntry({ outcome: 'error', status: 0, injected: 'offline', durationMs: 0 }),
      makeEntry({ outcome: 'cancelled', status: null, durationMs: 9_000 }),
    ]);

    expect(stats.p50Ms).toBe(200);
    expect(stats.p95Ms).toBe(5_400);
  });

  it('counts memory and CDN hits as cache hits, out of everything that could have been one', () => {
    const stats = sessionStats([
      makeMemoryHit(),
      makeMemoryHit(),
      makeEntry({ cdnCache: 'HIT' }),
      makeEntry({ cdnCache: 'STALE' }),
      makeEntry({ cdnCache: 'MISS' }),
      makeEntry({ cdnCache: null }),
      makeEntry({ outcome: 'error', status: 0, errorKind: 'network' }),
      makeEntry({ outcome: 'error', status: 429, injected: 'rate-limit' }),
    ]);

    expect(stats.memoryHits).toBe(2);
    expect(stats.cdnHits).toBe(2);
    expect(stats.cacheHitRate).toBe(4 / 6);
    expect(stats.requests).toBe(5);
  });

  it('takes the rate-limit budget from the latest response that had one', () => {
    const stats = sessionStats([
      makeEntry({ outcome: 'pending', status: null }),
      makeEntry({ rateLimit: { remaining: 7, limit: 10 } }),
      makeEntry({ rateLimit: { remaining: 9, limit: 10 } }),
    ]);

    expect(stats.budget).toEqual({ remaining: 7, limit: 10 });
  });
});
