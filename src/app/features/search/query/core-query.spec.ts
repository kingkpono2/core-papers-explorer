import { toCoreQuery } from './core-query';

describe('toCoreQuery', () => {
  const cases: [string, string][] = [
    ['(drone AND (package OR delivery))', 'drone AND (package OR delivery)'],
    ['((drone AND package))', 'drone AND package'],
    [' ( drone ) ', 'drone'],
    ['"drone delivery"', '("drone delivery")'],
    ['("drone delivery")', '("drone delivery")'],
    ['(drone) AND (package OR delivery)', '(drone) AND (package OR delivery)'],
    ['(drone OR uav) AND (package OR delivery)', '(drone OR uav) AND (package OR delivery)'],
    ['title:(drone delivery)', 'title:(drone delivery)'],
    ['title:"drone delivery"', 'title:"drone delivery"'],
    ['"drone delivery" AND package', '"drone delivery" AND package'],
    ['drone  and   delivery', 'drone and delivery'],
  ];

  for (const [query, expected] of cases) {
    it(`sends ${query} as ${expected}`, () => {
      expect(toCoreQuery(query)).toBe(expected);
    });
  }
});
