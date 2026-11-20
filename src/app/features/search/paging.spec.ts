import { MAX_RESULTS, lastPage, pageOffset, resultRange } from './paging';

describe('paging', () => {
  describe('lastPage', () => {
    it('rounds partial pages up', () => {
      expect(lastPage(71, 25)).toBe(3);
      expect(lastPage(75, 25)).toBe(3);
      expect(lastPage(76, 25)).toBe(4);
    });

    it('is 1 when there are no results', () => {
      expect(lastPage(0, 10)).toBe(1);
    });

    it('stops at the first 10,000 results CORE will serve', () => {
      expect(MAX_RESULTS).toBe(10_000);
      expect(lastPage(71_213, 10)).toBe(1_000);
      expect(lastPage(71_213, 25)).toBe(400);
      expect(lastPage(71_213, 100)).toBe(100);
    });

    it('never asks CORE for an offset above 10,000', () => {
      for (const size of [10, 25, 30, 50, 100]) {
        expect(pageOffset(lastPage(1_000_000, size), size)).toBeLessThanOrEqual(10_000);
      }
    });
  });

  describe('resultRange', () => {
    it('gives the 1-based positions shown on a page', () => {
      expect(resultRange(1, 10, 71_213)).toEqual({ first: 1, last: 10 });
      expect(resultRange(2, 25, 71_213)).toEqual({ first: 26, last: 50 });
    });

    it('ends at the total on the last page', () => {
      expect(resultRange(3, 25, 71)).toEqual({ first: 51, last: 71 });
      expect(resultRange(1, 10, 1)).toEqual({ first: 1, last: 1 });
    });

    it('is null past the end', () => {
      expect(resultRange(4, 25, 71)).toBeNull();
      expect(resultRange(1, 10, 0)).toBeNull();
    });
  });
});
