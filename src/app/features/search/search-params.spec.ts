import { convertToParamMap } from '@angular/router';
import { parseSearchParams, sameSearch, toPageSize, toQueryParams } from './search-params';

const parse = (params: Record<string, string>, defaultSize?: number | null) =>
  parseSearchParams(convertToParamMap(params), defaultSize);

describe('search params', () => {
  describe('parseSearchParams', () => {
    it('reads the query, page and size', () => {
      expect(parse({ q: 'drone', page: '3', size: '25' })).toEqual({
        query: 'drone',
        page: 3,
        size: 25,
      });
    });

    it('defaults to page 1 of 10 with no query', () => {
      expect(parse({})).toEqual({ query: '', page: 1, size: 10 });
    });

    it('trims the query', () => {
      expect(parse({ q: '  drone  ' }).query).toBe('drone');
      expect(parse({ q: '   ' }).query).toBe('');
    });

    it('repairs invalid pages', () => {
      expect(parse({ page: '-3' }).page).toBe(1);
      expect(parse({ page: '0' }).page).toBe(1);
      expect(parse({ page: 'two' }).page).toBe(1);
      expect(parse({ page: '2.5' }).page).toBe(1);
    });

    it('caps the page at the last one CORE will serve', () => {
      expect(parse({ page: '5000', size: '10' }).page).toBe(1_000);
      expect(parse({ page: '5000', size: '100' }).page).toBe(100);
    });

    it('snaps the size to a preset between 10 and 100', () => {
      expect(parse({ size: '999' }).size).toBe(100);
      expect(parse({ size: '30' }).size).toBe(50);
      expect(parse({ size: '1' }).size).toBe(10);
      expect(parse({ size: '-5' }).size).toBe(10);
    });

    it('uses the saved size only when the URL has no valid one', () => {
      expect(parse({}, 50).size).toBe(50);
      expect(parse({ size: 'abc' }, 50).size).toBe(50);
      expect(parse({ size: '25' }, 50).size).toBe(25);
    });
  });

  describe('toQueryParams', () => {
    it('leaves out page 1', () => {
      expect(toQueryParams({ query: 'drone', page: 1, size: 10 })).toEqual({
        q: 'drone',
        size: 10,
      });
      expect(toQueryParams({ query: 'drone', page: 3, size: 25 })).toEqual({
        q: 'drone',
        size: 25,
        page: 3,
      });
    });

    it('is empty without a query', () => {
      expect(toQueryParams({ query: '', page: 2, size: 25 })).toEqual({});
    });

    it('round-trips through the parser', () => {
      const params = { query: 'drone AND delivery', page: 7, size: 50 };
      const query = Object.fromEntries(
        Object.entries(toQueryParams(params)).map(([key, value]) => [key, String(value)]),
      );
      expect(parse(query)).toEqual(params);
    });
  });

  it('toPageSize ignores anything that is not a whole number', () => {
    expect(toPageSize(null)).toBeNull();
    expect(toPageSize('')).toBeNull();
    expect(toPageSize('ten')).toBeNull();
    expect(toPageSize('25')).toBe(25);
  });

  it('sameSearch compares every field', () => {
    const params = { query: 'drone', page: 1, size: 10 };
    expect(sameSearch(params, { ...params })).toBeTrue();
    expect(sameSearch(params, { ...params, page: 2 })).toBeFalse();
    expect(sameSearch(params, { ...params, size: 25 })).toBeFalse();
    expect(sameSearch(params, { ...params, query: 'drones' })).toBeFalse();
  });
});
