import { HttpContext, HttpRequest } from '@angular/common/http';
import { REQUEST_TRACE, RequestTrace, RetryNote } from './request-trace';

describe('RequestTrace', () => {
  it('numbers the attempts of a request from 1', () => {
    const trace = new RequestTrace();

    expect([trace.nextAttempt(), trace.nextAttempt(), trace.nextAttempt()]).toEqual([1, 2, 3]);
  });

  it('gives every trace its own id', () => {
    expect(new RequestTrace().id).not.toBe(new RequestTrace().id);
  });

  it('passes retry notes to its listener', () => {
    const trace = new RequestTrace();
    const notes: RetryNote[] = [];
    trace.note({ type: 'cancelled' });
    trace.listen((note) => notes.push(note));

    trace.note({ type: 'retry', delayMs: 1_000, reason: 'backoff' });

    expect(notes).toEqual([{ type: 'retry', delayMs: 1_000, reason: 'backoff' }]);
  });

  it('is shared by clones of a request, and created for a request sent without one', () => {
    const request = new HttpRequest('GET', '/core-api/v3/search/works/');
    const trace = request.context.get(REQUEST_TRACE);

    // The API key interceptor sends a clone with the Authorization header.
    const clone = request.clone({ setHeaders: { Authorization: 'Bearer key' } });

    expect(trace).toEqual(jasmine.any(RequestTrace));
    expect(clone.context.get(REQUEST_TRACE)).toBe(trace);
    expect(new HttpContext().get(REQUEST_TRACE)).not.toBe(trace);
  });
});
