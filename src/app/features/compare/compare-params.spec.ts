import { convertToParamMap } from '@angular/router';
import { parseCompareQueries, sameQueries, tidyQueries } from './compare-params';

describe('parseCompareQueries', () => {
  const parse = (q: string | string[] | undefined) =>
    parseCompareQueries(convertToParamMap(q === undefined ? {} : { q }));

  it('reads two or three queries in order', () => {
    expect(parse(['drone delivery', 'autonomous vehicles'])).toEqual([
      'drone delivery',
      'autonomous vehicles',
    ]);
    expect(parse(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('reads a single query, for a comparison still to be completed', () => {
    expect(parse('drone')).toEqual(['drone']);
    expect(parse(undefined)).toEqual([]);
  });

  it('keeps at most three', () => {
    expect(parse(['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c']);
  });

  it('tidies whitespace and drops blanks', () => {
    expect(parse(['  drone   delivery ', '', '   ', 'robots'])).toEqual([
      'drone delivery',
      'robots',
    ]);
  });

  it('drops exact repeats, after tidying, but not queries that differ in case', () => {
    expect(parse(['drone', ' drone ', 'robots', 'drone'])).toEqual(['drone', 'robots']);
    expect(parse(['drone and robots', 'drone AND robots'])).toEqual([
      'drone and robots',
      'drone AND robots',
    ]);
  });

  it('drops absurdly long queries', () => {
    expect(parse(['x'.repeat(1_001), 'robots'])).toEqual(['robots']);
  });
});

describe('tidyQueries', () => {
  it('counts the limit after dropping repeats', () => {
    expect(tidyQueries(['a', 'a', 'b', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c']);
  });
});

describe('sameQueries', () => {
  it('compares lists in order', () => {
    expect(sameQueries(['a', 'b'], ['a', 'b'])).toBeTrue();
    expect(sameQueries(['a', 'b'], ['b', 'a'])).toBeFalse();
    expect(sameQueries(['a'], ['a', 'b'])).toBeFalse();
  });
});
