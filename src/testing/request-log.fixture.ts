import { RequestLogEntry } from '../app/core/diagnostics/request-log';

let lastId = 0;

/** A successful search attempt with no headers, for tests to fill in as needed. */
export function makeEntry(overrides: Partial<RequestLogEntry> = {}): RequestLogEntry {
  return {
    id: ++lastId,
    source: 'network',
    trace: 1,
    attempt: 1,
    method: 'GET',
    endpoint: '/search/works/',
    query: 'drone',
    injected: null,
    injectedDelayMs: 0,
    startedAt: Date.parse('2026-11-20T10:00:00Z'),
    startTime: 0,
    durationMs: 500,
    outcome: 'ok',
    status: 200,
    errorKind: null,
    sizeBytes: null,
    coreMs: null,
    proxyMs: null,
    cdnCache: null,
    rateLimit: null,
    requestId: null,
    followUp: null,
    ...overrides,
  };
}

/** A request answered from the app's memory. */
export function makeMemoryHit(overrides: Partial<RequestLogEntry> = {}): RequestLogEntry {
  return makeEntry({
    source: 'memory',
    trace: null,
    attempt: 0,
    durationMs: 0,
    status: null,
    ...overrides,
  });
}
