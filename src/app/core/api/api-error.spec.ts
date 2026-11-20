import { HttpErrorResponse } from '@angular/common/http';
import { TimeoutError } from 'rxjs';
import { ApiError, isRejectedQuery, toApiError } from './api-error';

describe('toApiError', () => {
  const kindFor = (status: number) => toApiError(new HttpErrorResponse({ status })).kind;

  it('maps HTTP statuses to error kinds', () => {
    expect(kindFor(0)).toBe('network');
    expect(kindFor(429)).toBe('rate-limit');
    expect(kindFor(400)).toBe('bad-query');
    expect(kindFor(401)).toBe('server');
    expect(kindFor(500)).toBe('server');
  });

  it('maps rxjs timeouts and unknown errors', () => {
    expect(toApiError(new TimeoutError()).kind).toBe('timeout');
    expect(toApiError(new Error('boom')).kind).toBe('server');
  });

  it('keeps the original error as the cause and passes ApiErrors through', () => {
    const cause = new HttpErrorResponse({ status: 503 });
    const error = toApiError(cause);

    expect(error.cause).toBe(cause);
    expect(error.status).toBe(503);
    expect(toApiError(error)).toBe(error);
  });

  it('carries a user-facing message', () => {
    expect(new ApiError('timeout').message).toBe(
      'CORE took too long to respond. Try again, or make the search more specific.',
    );
  });
});

describe('isRejectedQuery', () => {
  const rejected =
    'Azure search failed with status code: 400. Error context: code=OperationNotAllowed';
  const response = (status: number, error: unknown) => new HttpErrorResponse({ status, error });

  it("recognises CORE's 500 for a query it cannot parse, as JSON or text", () => {
    expect(isRejectedQuery(response(500, { message: rejected }))).toBeTrue();
    expect(isRejectedQuery(response(500, JSON.stringify({ message: rejected })))).toBeTrue();
    expect(toApiError(response(500, { message: rejected })).kind).toBe('bad-query');
  });

  it('leaves other server errors alone', () => {
    expect(isRejectedQuery(response(500, { message: 'Internal error' }))).toBeFalse();
    expect(isRejectedQuery(response(500, null))).toBeFalse();
    expect(isRejectedQuery(response(503, { message: rejected }))).toBeFalse();
    expect(
      isRejectedQuery(response(500, { message: 'Azure search failed with status code: 503' })),
    ).toBeFalse();
  });
});
