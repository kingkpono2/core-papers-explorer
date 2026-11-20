import { metricDuration, parseServerTiming } from './server-timing';

describe('parseServerTiming', () => {
  it("reads the proxy's core and proxy metrics", () => {
    expect(
      parseServerTiming('core;dur=412.3;desc="CORE API", proxy;dur=420.1;desc="Proxy total"'),
    ).toEqual([
      { name: 'core', durationMs: 412.3, description: 'CORE API' },
      { name: 'proxy', durationMs: 420.1, description: 'Proxy total' },
    ]);
  });

  it('gives nothing for a missing or blank header', () => {
    expect(parseServerTiming(null)).toEqual([]);
    expect(parseServerTiming(undefined)).toEqual([]);
    expect(parseServerTiming('')).toEqual([]);
    expect(parseServerTiming(' , ')).toEqual([]);
  });

  it('allows metrics without a duration or description, and spaces around separators', () => {
    expect(parseServerTiming('cache ,  db ; dur = 53 , app;desc=total')).toEqual([
      { name: 'cache', durationMs: null, description: null },
      { name: 'db', durationMs: 53, description: null },
      { name: 'app', durationMs: null, description: 'total' },
    ]);
  });

  it('keeps separators and escaped quotes inside a quoted description', () => {
    expect(parseServerTiming('db;desc="a, b; \\"c\\"";dur=1, edge;dur=2')).toEqual([
      { name: 'db', durationMs: 1, description: 'a, b; "c"' },
      { name: 'edge', durationMs: 2, description: null },
    ]);
  });

  it('uses the first dur and desc of a metric', () => {
    expect(parseServerTiming('db;dur=1;dur=2;desc=first;desc=second')).toEqual([
      { name: 'db', durationMs: 1, description: 'first' },
    ]);
  });

  it('skips malformed metrics and unreadable durations without losing the rest', () => {
    expect(parseServerTiming('core;dur=abc, proxy;dur=-3, ;dur=4, "x";dur=5, ok;dur=6')).toEqual([
      { name: 'core', durationMs: null, description: null },
      { name: 'proxy', durationMs: null, description: null },
      { name: 'ok', durationMs: 6, description: null },
    ]);
  });
});

describe('metricDuration', () => {
  const metrics = parseServerTiming('Core;dur=120, proxy, cdn;dur=0');

  it('finds a metric by name, ignoring case', () => {
    expect(metricDuration(metrics, 'core')).toBe(120);
    expect(metricDuration(metrics, 'cdn')).toBe(0);
  });

  it('gives null when the metric or its duration is missing', () => {
    expect(metricDuration(metrics, 'proxy')).toBeNull();
    expect(metricDuration(metrics, 'db')).toBeNull();
    expect(metricDuration([], 'core')).toBeNull();
  });
});
