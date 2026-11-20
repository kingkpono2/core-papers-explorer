import { coreQueryAdjustment, narrowQuery, toCoreQuery } from './core-query';

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

describe('coreQueryAdjustment', () => {
  it('explains removing brackets that would nest an OR group', () => {
    expect(coreQueryAdjustment('(drone AND (package OR delivery))')).toEqual({
      sent: 'drone AND (package OR delivery)',
      change: 'nested-or',
    });
    expect(coreQueryAdjustment('(drone AND NOT (uav OR quadcopter))')?.change).toBe('nested-or');
  });

  it('explains removing brackets that change nothing', () => {
    expect(coreQueryAdjustment(' ( drone ) ')).toEqual({ sent: 'drone', change: 'outer-brackets' });
    expect(coreQueryAdjustment('(drone OR uav)')?.change).toBe('outer-brackets');
  });

  it('explains bracketing a lone phrase', () => {
    expect(coreQueryAdjustment('"drone delivery"')).toEqual({
      sent: '("drone delivery")',
      change: 'phrase',
    });
  });

  it('is null when the query is sent as written, whitespace aside', () => {
    for (const query of [
      'drone',
      'drone AND (package OR delivery)',
      '("drone delivery")',
      'drone  and   delivery',
    ]) {
      expect(coreQueryAdjustment(query)).withContext(query).toBeNull();
    }
  });
});

describe('narrowQuery', () => {
  const year = 'yearPublished:2020';

  // Checked against CORE on 20 November 2026: the first and third return the matching bar's count
  // (354 and 6,068), while bracketing an AND query with an OR group inside returns 5,626, the count
  // for drone alone.
  const cases: [string, string][] = [
    ['drone AND (package OR delivery)', 'drone AND (package OR delivery) AND yearPublished:2020'],
    ['(drone AND (package OR delivery))', 'drone AND (package OR delivery) AND yearPublished:2020'],
    ['drone OR quadcopter', '(drone OR quadcopter) AND yearPublished:2020'],
    ['drone quadcopter', '(drone quadcopter) AND yearPublished:2020'],
    ['drone', 'drone AND yearPublished:2020'],
    ['"drone delivery"', '("drone delivery") AND yearPublished:2020'],
    ['drone NOT military', '(drone NOT military) AND yearPublished:2020'],
    ['(drone OR uav) AND delivery', '(drone OR uav) AND delivery AND yearPublished:2020'],
    ['drone OR (package AND delivery)', '(drone OR (package AND delivery)) AND yearPublished:2020'],
  ];

  for (const [query, expected] of cases) {
    it(`narrows ${query} to ${expected}`, () => {
      expect(narrowQuery(query, year)).toBe(expected);
    });
  }

  it('never brackets an AND query, which would nest its OR group', () => {
    expect(narrowQuery('drone AND (package OR delivery)', year)).not.toContain('(drone AND');
  });

  it('refuses when bracketing would push an OR group into nested brackets', () => {
    expect(narrowQuery('drone OR (package OR delivery)', year)).toBeNull();
  });

  it('allows bracketing when the nested OR group was already ignored', () => {
    expect(narrowQuery('uav OR (drone AND (package OR delivery))', year)).toBe(
      '(uav OR (drone AND (package OR delivery))) AND yearPublished:2020',
    );
  });

  it('leaves queries that already filter by year alone', () => {
    expect(narrowQuery('drone AND yearPublished:2020', year)).toBeNull();
    expect(narrowQuery('drone AND yearPublished>=2019', 'yearPublished<2000')).toBeNull();
  });

  it('accepts other clauses, such as the bucket for earlier years', () => {
    expect(narrowQuery('drone', 'yearPublished<2003')).toBe('drone AND yearPublished<2003');
  });
});
