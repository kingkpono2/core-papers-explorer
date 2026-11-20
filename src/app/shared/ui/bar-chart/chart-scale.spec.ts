import { barPath, labelStep, niceTicks } from './chart-scale';

describe('chart scale', () => {
  describe('niceTicks', () => {
    const cases: [number, number[]][] = [
      [7_828, [0, 2_000, 4_000, 6_000, 8_000]],
      [655, [0, 200, 400, 600, 800]],
      [100, [0, 50, 100]],
      [4, [0, 1, 2, 3, 4]],
      [1, [0, 1]],
      [151_742, [0, 50_000, 100_000, 150_000, 200_000]],
    ];

    for (const [max, expected] of cases) {
      it(`gives ${expected.join(', ')} for a maximum of ${max}`, () => {
        expect(niceTicks(max)).toEqual(expected);
      });
    }

    it('always reaches the maximum with a round step', () => {
      for (const max of [3, 17, 99, 101, 999, 1_001, 12_345, 987_654]) {
        const ticks = niceTicks(max);
        const step = ticks[1];
        expect(ticks[0]).toBe(0);
        expect(ticks.at(-1)!).toBeGreaterThanOrEqual(max);
        expect(ticks.at(-2)!).toBeLessThan(max);
        expect([1, 2, 5]).toContain(step / 10 ** Math.floor(Math.log10(step)));
      }
    });

    it('never uses fractional steps for counts', () => {
      expect(niceTicks(2)).toEqual([0, 1, 2]);
    });

    it('gives a usable axis when everything is zero', () => {
      expect(niceTicks(0)).toEqual([0, 1]);
    });
  });

  describe('labelStep', () => {
    it('labels every bar when there is room', () => {
      expect(labelStep(10, 600, 40)).toBe(1);
    });

    it('steps by round numbers when labels would collide', () => {
      expect(labelStep(30, 600, 40)).toBe(2);
      expect(labelStep(30, 300, 40)).toBe(5);
      expect(labelStep(30, 100, 40)).toBe(20);
    });
  });

  describe('barPath', () => {
    it('rounds the top corners and keeps the base square', () => {
      expect(barPath(10, 20, 12, 50)).toBe('M10,70V24Q10,20 14,20H18Q22,20 22,24V70Z');
    });

    it('shrinks the radius for short or thin bars', () => {
      expect(barPath(0, 98, 10, 2)).toBe('M0,100V100Q0,98 2,98H8Q10,98 10,100V100Z');
    });

    it('draws nothing for a zero-height bar', () => {
      expect(barPath(0, 100, 10, 0)).toBe('');
    });
  });
});
