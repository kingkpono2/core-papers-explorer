import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { isTransient, retryAfterMs } from './retry-transient';

describe('retryAfterMs', () => {
  const now = Date.parse('2026-01-01T00:00:00Z');
  const headers = (values: Record<string, string>) => new HttpHeaders(values);

  it("parses CORE's timestamp format", () => {
    expect(
      retryAfterMs(headers({ 'X-RateLimit-Retry-After': '2026-01-01T00:00:05+0000' }), now),
    ).toBe(5_000);
  });

  it('accepts a standard Retry-After in seconds', () => {
    expect(retryAfterMs(headers({ 'Retry-After': '2' }), now)).toBe(2_000);
  });

  it('never returns a negative delay', () => {
    expect(
      retryAfterMs(headers({ 'X-RateLimit-Retry-After': '2025-12-31T23:59:00+0000' }), now),
    ).toBe(0);
  });

  it('returns null when the header is missing or unreadable', () => {
    expect(retryAfterMs(headers({}), now)).toBeNull();
    expect(retryAfterMs(headers({ 'Retry-After': 'soon' }), now)).toBeNull();
  });
});

describe('isTransient', () => {
  const httpError = (status: number) => new HttpErrorResponse({ status });

  it('treats network, 429 and 5xx failures as transient', () => {
    expect([0, 429, 500, 503].map((status) => isTransient(httpError(status)))).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it('treats other client errors and non-HTTP errors as permanent', () => {
    expect(isTransient(httpError(400))).toBeFalse();
    expect(isTransient(httpError(404))).toBeFalse();
    expect(isTransient(new Error('boom'))).toBeFalse();
  });
});
