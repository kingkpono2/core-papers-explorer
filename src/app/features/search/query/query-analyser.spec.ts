import {
  Diagnostic,
  DiagnosticCode,
  analyseQuery,
  normaliseQuery,
  positiveTerms,
  suggestFields,
} from './query-analyser';

/** Diagnostics as `code@start-end`, which keeps the tables readable. */
const summarise = (diagnostics: Diagnostic[]) =>
  diagnostics.map(({ code, start, end }) => `${code}@${start}-${end}`);

describe('analyseQuery', () => {
  describe('valid queries', () => {
    const valid: [string, string[]][] = [
      ['drone', ['drone']],
      ['drone delivery', ['drone', 'delivery']],
      ['(drone AND (package OR delivery))', ['drone', 'package', 'delivery']],
      ['drone AND (package OR (parcel AND delivery))', ['drone', 'package', 'parcel', 'delivery']],
      ['((drone))', ['drone']],
      ['"drone delivery"', ['drone delivery']],
      ['drone NOT military', ['drone']],
      ['drone -military +delivery', ['drone', 'delivery']],
      ['drone AND NOT (military OR weapon)', ['drone']],
      ['dron* AND deliver?', ['dron*', 'deliver?']],
      ['title:"machine learning" AND yearPublished>=2020', ['machine learning']],
      ['title:(drone delivery) AND authors:smith', ['drone', 'delivery']],
      ['yearPublished>2019 AND yearPublished<=2021', []],
      ['doi:"10.1038/s41597-023-02208-w"', []],
      ['_exists_:fullText AND drone', ['drone']],
      ['drone && package', ['drone', 'package']],
      ['state-of-the-art', ['state-of-the-art']],
      ['C\\+\\+', ['C++']],
    ];

    for (const [query, terms] of valid) {
      it(`accepts ${query}`, () => {
        const result = analyseQuery(query);
        expect(result.diagnostics).toEqual([]);
        expect(result.hasErrors).toBeFalse();
        expect(positiveTerms(result.ast)).toEqual(terms);
      });
    }
  });

  it('builds a tree with AND inside the OR group for the example from the brief', () => {
    const { ast } = analyseQuery('(drone AND (package OR delivery))');

    expect(ast).toEqual({
      kind: 'group',
      start: 0,
      end: 33,
      child: {
        kind: 'and',
        start: 1,
        end: 32,
        children: [
          { kind: 'term', text: 'drone', field: null, start: 1, end: 6 },
          {
            kind: 'group',
            start: 11,
            end: 32,
            child: {
              kind: 'or',
              start: 12,
              end: 31,
              children: [
                { kind: 'term', text: 'package', field: null, start: 12, end: 19 },
                { kind: 'term', text: 'delivery', field: null, start: 23, end: 31 },
              ],
            },
          },
        ],
      },
    });
  });

  it('binds AND tighter than OR and joins adjacent terms with OR, as CORE does', () => {
    const { ast } = analyseQuery('a b AND c');

    expect(ast?.kind).toBe('or');
    expect(ast?.kind === 'or' && ast.children.map((child) => child.kind)).toEqual(['term', 'and']);
  });

  describe('errors', () => {
    const errors: [string, string, DiagnosticCode, string][] = [
      ['an empty query', '   ', 'empty-query', '0-0'],
      ['an unclosed bracket', 'drone AND (package', 'unclosed-paren', '10-11'],
      ['an extra closing bracket', 'drone)', 'unmatched-paren', '5-6'],
      ['empty brackets', 'drone ()', 'empty-group', '6-8'],
      ['an operator at the start', 'AND drone', 'dangling-operator', '0-3'],
      ['an operator at the end', 'drone OR', 'dangling-operator', '6-8'],
      ['an operator before a closing bracket', '(drone AND)', 'dangling-operator', '7-10'],
      ['two operators in a row', 'drone AND AND delivery', 'dangling-operator', '6-13'],
      ['NOT with nothing after it', 'drone NOT', 'dangling-operator', '6-9'],
      ['a minus with nothing after it', 'drone -', 'dangling-operator', '6-7'],
      ['an unterminated quote', 'title:"drone delivery', 'unterminated-quote', '6-21'],
      ['empty quotes', 'drone ""', 'empty-phrase', '6-8'],
      ['a field without a value', 'drone AND title:', 'missing-value', '10-16'],
      ['a comparison without a value', 'yearPublished>', 'missing-value', '0-14'],
      ['an unknown field', 'foo:bar', 'unknown-field', '0-3'],
      ['a range in square brackets', 'yearPublished:[2019 TO 2021]', 'unsupported-range', '14-28'],
    ];

    for (const [name, query, code, span] of errors) {
      it(`reports ${name}`, () => {
        const result = analyseQuery(query);
        expect(summarise(result.diagnostics)).toEqual([`${code}@${span}`]);
        expect(result.diagnostics[0].severity).toBe('error');
        expect(result.hasErrors).toBeTrue();
      });
    }

    it('reports every problem in order of position', () => {
      const { diagnostics } = analyseQuery('foo:bar AND (drone');

      expect(summarise(diagnostics)).toEqual(['unknown-field@0-3', 'unclosed-paren@12-13']);
      expect(diagnostics.map((d) => d.message)).toEqual([
        'CORE has no field called foo. Check the list of fields under How to search.',
        'This bracket is never closed. Add a ).',
      ]);
    });

    it('reports the cause rather than the operator next to it', () => {
      expect(summarise(analyseQuery('drone AND (').diagnostics)).toEqual(['unclosed-paren@10-11']);
      expect(summarise(analyseQuery('drone AND title:').diagnostics)).toEqual([
        'missing-value@10-16',
      ]);
    });

    it('suggests the comparison CORE understands instead of a range', () => {
      const [range] = analyseQuery('yearPublished:[2015 TO 2018]').diagnostics;
      expect(range.message).toContain('yearPublished>=2015 AND yearPublished<=2018');
    });

    it('suggests known fields for a misspelt one', () => {
      expect(analyseQuery('auther:smith').diagnostics[0].message).toBe(
        'CORE has no field called auther. Did you mean authors?',
      );
      expect(analyseQuery('Title:drone').diagnostics[0].message).toContain('Did you mean title?');
    });
  });

  describe('warnings', () => {
    const warnings: [string, string, DiagnosticCode, string][] = [
      ['lowercase and', 'drone and delivery', 'lowercase-operator', '6-9'],
      ['lowercase or', 'drone or delivery', 'lowercase-operator', '6-8'],
      ['lowercase not', 'drone not military', 'lowercase-operator', '6-9'],
      ['lowercase not after AND', 'drone AND not military', 'lowercase-operator', '10-13'],
      ['AND and OR without brackets', 'a OR b AND c', 'mixed-operators', '2-4'],
      [
        'an OR group inside other brackets',
        '(drone AND (package OR delivery)) AND yearPublished>2019',
        'nested-or-group',
        '11-32',
      ],
    ];

    for (const [name, query, code, span] of warnings) {
      it(`warns about ${name} without blocking the search`, () => {
        const result = analyseQuery(query);
        expect(summarise(result.diagnostics)).toEqual([`${code}@${span}`]);
        expect(result.diagnostics[0].severity).toBe('warning');
        expect(result.hasErrors).toBeFalse();
      });
    }

    it('reads lowercase operators the way CORE does', () => {
      expect(positiveTerms(analyseQuery('drone and delivery').ast)).toEqual(['drone', 'delivery']);
      expect(analyseQuery('drone and delivery').ast?.kind).toBe('and');
      expect(positiveTerms(analyseQuery('drone not military').ast)).toEqual(['drone']);
    });

    it('treats and, or and not as words when they are not between terms', () => {
      for (const query of ['and', 'drone and', 'or drone', '(drone and)']) {
        expect(analyseQuery(query).diagnostics).withContext(query).toEqual([]);
      }
      expect(positiveTerms(analyseQuery('drone and').ast)).toEqual(['drone']);
    });

    it('does not count brackets around the whole query, which are removed before sending', () => {
      for (const query of [
        '(drone AND (package OR delivery))',
        ' ((drone AND (package OR delivery))) ',
        'drone AND ((package OR delivery))',
        '(drone AND (package))',
      ]) {
        expect(analyseQuery(query).diagnostics).withContext(query).toEqual([]);
      }
    });

    it('explains what CORE does with a lowercase operator', () => {
      expect(analyseQuery('drone and delivery').diagnostics[0].message).toBe(
        'CORE treats “and” as AND, the same as in capitals. Write AND to make that clear.',
      );
    });
  });
});

describe('normaliseQuery', () => {
  it('trims and collapses whitespace without changing anything else', () => {
    expect(normaliseQuery('  drone \n AND\t(package  OR delivery) ')).toBe(
      'drone AND (package OR delivery)',
    );
    expect(normaliseQuery('drone and Delivery')).toBe('drone and Delivery');
  });
});

describe('suggestFields', () => {
  it('matches by case, prefix and small typos', () => {
    expect(suggestFields('TITLE')).toEqual(['title']);
    expect(suggestFields('year')).toEqual(['yearPublished']);
    expect(suggestFields('abstrct')).toEqual(['abstract']);
    expect(suggestFields('xyz')).toEqual([]);
  });
});
