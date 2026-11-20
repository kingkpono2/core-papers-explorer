import { pageItems } from './page-items';

describe('pageItems', () => {
  it('lists every page when they all fit', () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('puts ellipses on both sides of the current page in the middle', () => {
    expect(pageItems(10, 20)).toEqual([1, null, 9, 10, 11, null, 20]);
  });

  it('keeps the same number of items near either end', () => {
    expect(pageItems(1, 20)).toEqual([1, 2, 3, 4, 5, null, 20]);
    expect(pageItems(4, 20)).toEqual([1, 2, 3, 4, 5, null, 20]);
    expect(pageItems(5, 20)).toEqual([1, null, 4, 5, 6, null, 20]);
    expect(pageItems(17, 20)).toEqual([1, null, 16, 17, 18, 19, 20]);
    expect(pageItems(20, 20)).toEqual([1, null, 16, 17, 18, 19, 20]);
  });

  it('never hides a single page behind an ellipsis', () => {
    for (let current = 1; current <= 30; current++) {
      const items = pageItems(current, 30);
      items.forEach((item, i) => {
        if (item === null) {
          expect((items[i + 1] as number) - (items[i - 1] as number)).toBeGreaterThan(2);
        }
      });
    }
  });

  it('shows fewer pages in compact mode', () => {
    expect(pageItems(10, 20, 0)).toEqual([1, null, 10, null, 20]);
    expect(pageItems(1, 20, 0)).toEqual([1, 2, 3, null, 20]);
    expect(pageItems(20, 20, 0)).toEqual([1, null, 18, 19, 20]);
    expect(pageItems(2, 5, 0)).toEqual([1, 2, 3, 4, 5]);
  });

  it('copes with a current page past the end', () => {
    expect(pageItems(500, 3)).toEqual([1, 2, 3]);
    expect(pageItems(500, 400)).toEqual([1, null, 396, 397, 398, 399, 400]);
  });
});
