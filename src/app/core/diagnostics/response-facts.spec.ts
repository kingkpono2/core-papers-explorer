import { HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { responseFacts } from './response-facts';

describe('responseFacts', () => {
  const response = (headers: Record<string, string>, status = 200) =>
    new HttpResponse({ status, headers: new HttpHeaders(headers) });

  it('reads the size, timings, CDN status, rate limit and request id', () => {
    expect(
      responseFacts(
        response({
          'Content-Length': '18234',
          'Server-Timing': 'core;dur=512.4;desc="CORE API", proxy;dur=530;desc="Proxy total"',
          'X-Vercel-Cache': 'hit',
          'X-RateLimit-Remaining': '7',
          'X-RateLimit-Limit': '10',
          'X-Request-Id': ' 3f2a91c4-0d1e-4b7a-9c55-1f2e3d4c5b6a ',
        }),
      ),
    ).toEqual({
      status: 200,
      sizeBytes: 18234,
      coreMs: 512.4,
      proxyMs: 530,
      cdnCache: 'HIT',
      rateLimit: { remaining: 7, limit: 10 },
      requestId: '3f2a91c4-0d1e-4b7a-9c55-1f2e3d4c5b6a',
    });
  });

  it('gives nulls for absent headers, as behind the dev proxy', () => {
    expect(responseFacts(response({}))).toEqual({
      status: 200,
      sizeBytes: null,
      coreMs: null,
      proxyMs: null,
      cdnCache: null,
      rateLimit: null,
      requestId: null,
    });
  });

  it('ignores values that are not whole numbers, and a rate limit without its pair', () => {
    const facts = responseFacts(
      response({ 'Content-Length': '12kb', 'X-RateLimit-Remaining': '5', 'X-Request-Id': ' ' }),
    );

    expect(facts.sizeBytes).toBeNull();
    expect(facts.rateLimit).toBeNull();
    expect(facts.requestId).toBeNull();
    expect(
      responseFacts(response({ 'X-RateLimit-Remaining': '3', 'X-RateLimit-Limit': '0' })).rateLimit,
    ).toBeNull();
  });

  it('caps the remaining budget at the limit', () => {
    expect(
      responseFacts(response({ 'X-RateLimit-Remaining': '12', 'X-RateLimit-Limit': '10' }))
        .rateLimit,
    ).toEqual({ remaining: 10, limit: 10 });
  });

  it('reads an error response, and a network failure that has no headers', () => {
    const limited = new HttpErrorResponse({
      status: 429,
      headers: new HttpHeaders({ 'X-RateLimit-Remaining': '0', 'X-RateLimit-Limit': '10' }),
    });

    expect(responseFacts(limited).rateLimit).toEqual({ remaining: 0, limit: 10 });
    expect(responseFacts(new HttpErrorResponse({ status: 0 }))).toEqual(
      jasmine.objectContaining({ status: 0, sizeBytes: null, requestId: null }),
    );
  });
});
