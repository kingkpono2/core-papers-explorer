import { CoreWork } from './core-api.models';
import { cleanText, toPaper, toSearchResult, toYearCounts } from './paper.mapper';

describe('paper mapper', () => {
  const work = (overrides: Partial<CoreWork> = {}): CoreWork => ({ id: 42, ...overrides });

  describe('toPaper', () => {
    it('maps a fully populated work', () => {
      const paper = toPaper(
        work({
          title: '  Drone delivery  ',
          authors: [{ name: 'Ada Lovelace' }, { name: 'Alan Turing' }],
          abstract: 'Short abstract.',
          yearPublished: 2020,
          publishedDate: '2020-03-15T00:00:00+00:00',
          doi: '10.1234/abc.5',
          downloadUrl: 'https://core.ac.uk/download/1.pdf',
          links: [
            { type: 'download', url: 'https://core.ac.uk/download/1.pdf' },
            { type: 'display', url: 'https://core.ac.uk/works/42' },
          ],
          publisher: "'Elsevier BV'",
          journals: [{ title: 'Journal of Drones' }],
          documentType: 'research',
          citationCount: 7,
          language: { code: 'en', name: 'English' },
        }),
      );

      expect(paper).toEqual({
        id: '42',
        title: 'Drone delivery',
        authors: ['Ada Lovelace', 'Alan Turing'],
        abstract: 'Short abstract.',
        year: 2020,
        publishedDate: '2020-03-15',
        doi: '10.1234/abc.5',
        doiUrl: 'https://doi.org/10.1234/abc.5',
        downloadUrl: 'https://core.ac.uk/download/1.pdf',
        publisher: 'Elsevier BV',
        journal: 'Journal of Drones',
        documentType: 'research',
        citationCount: 7,
        language: 'English',
        sourceUrl: 'https://core.ac.uk/works/42',
        coreUrl: 'https://core.ac.uk/works/42',
      });
    });

    it('turns missing, null and blank fields into nulls and safe defaults', () => {
      const paper = toPaper(
        work({
          title: '   ',
          authors: null,
          abstract: '',
          yearPublished: 0,
          publishedDate: '',
          doi: null,
          downloadUrl: '',
          links: [],
          journals: [],
          citationCount: null,
          language: null,
        }),
      );

      expect(paper.title).toBe('Untitled');
      expect(paper.authors).toEqual([]);
      expect(paper.abstract).toBeNull();
      expect(paper.year).toBeNull();
      expect(paper.publishedDate).toBeNull();
      expect(paper.doiUrl).toBeNull();
      expect(paper.downloadUrl).toBeNull();
      expect(paper.journal).toBeNull();
      expect(paper.citationCount).toBeNull();
      expect(paper.language).toBeNull();
      expect(paper.sourceUrl).toBe('https://core.ac.uk/works/42');
    });

    it('strips escaped and raw HTML from the abstract', () => {
      expect(toPaper(work({ abstract: '&lt;p&gt;First release.&lt;/p&gt' })).abstract).toBe(
        'First release.',
      );
      expect(
        toPaper(
          work({ abstract: '<jats:p>Line one.</jats:p>\n\n  <jats:p>Line&nbsp;two.</jats:p>' }),
        ).abstract,
      ).toBe('Line one. Line two.');
    });

    it('removes a stray unclosed tag fragment at the end of the abstract', () => {
      expect(toPaper(work({ abstract: '&lt;p&gt;First release.&lt;/p' })).abstract).toBe(
        'First release.',
      );
      expect(toPaper(work({ abstract: '<jats:p>Line one.</jats:p> <jats:p' })).abstract).toBe(
        'Line one.',
      );
      expect(cleanText('Text.</p  \n')).toBe('Text.');
    });

    it('keeps comparison operators that are not tags', () => {
      expect(cleanText('p &lt; 0.05 and q &gt; 1')).toBe('p < 0.05 and q > 1');
      expect(cleanText('true when a < b')).toBe('true when a < b');
    });

    it('removes duplicate and blank authors, ignoring case', () => {
      const paper = toPaper(
        work({
          authors: [
            { name: 'Ada Lovelace' },
            { name: ' ada lovelace ' },
            { name: '' },
            { name: null },
            { name: 'Alan Turing' },
          ],
        }),
      );

      expect(paper.authors).toEqual(['Ada Lovelace', 'Alan Turing']);
    });

    it('normalises DOIs given as URLs and encodes the DOI link', () => {
      const paper = toPaper(work({ doi: '  https://doi.org/10.1000/a#b ' }));

      expect(paper.doi).toBe('10.1000/a#b');
      expect(paper.doiUrl).toBe('https://doi.org/10.1000/a%23b');
    });

    it('ignores values that are not DOIs', () => {
      expect(toPaper(work({ doi: 'not-a-doi' })).doi).toBeNull();
    });

    it('prefers the landing page, then the reader, then the DOI for sourceUrl', () => {
      const reader = { type: 'reader', url: 'https://core.ac.uk/reader/1' };
      const display = { type: 'display', url: 'https://core.ac.uk/works/1' };

      expect(toPaper(work({ links: [reader, display] })).sourceUrl).toBe(display.url);
      expect(toPaper(work({ links: [reader] })).sourceUrl).toBe(reader.url);
      expect(toPaper(work({ doi: '10.1/x', links: [] })).sourceUrl).toBe('https://doi.org/10.1/x');
    });

    it('rejects download links that are not http(s)', () => {
      expect(toPaper(work({ downloadUrl: 'javascript:alert(1)' })).downloadUrl).toBeNull();
    });
  });

  describe('toSearchResult', () => {
    it('maps totals, paging and papers', () => {
      const result = toSearchResult({
        totalHits: 71213,
        limit: 10,
        offset: 20,
        results: [work({ title: 'A' }), work({ id: 43, title: 'B' })],
      });

      expect(result.total).toBe(71213);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(20);
      expect(result.papers.map((paper) => paper.title)).toEqual(['A', 'B']);
    });
  });

  describe('toYearCounts', () => {
    it('sorts the years and drops keys and counts that are not whole numbers', () => {
      const yearPublished = { '2021': 464, '2019': 252, '2020': 354, unknown: 3, '2018': 0 };

      expect(toYearCounts({ aggregations: { yearPublished } })).toEqual({
        counts: [
          { year: 2019, count: 252 },
          { year: 2020, count: 354 },
          { year: 2021, count: 464 },
        ],
        truncated: false,
      });
    });

    it('reads the empty array CORE sends when nothing matches', () => {
      expect(toYearCounts({ aggregations: { yearPublished: [] } })).toEqual({
        counts: [],
        truncated: false,
      });
      expect(toYearCounts({})).toEqual({ counts: [], truncated: false });
    });

    it('flags an answer that hit the 100-year cap', () => {
      const yearPublished = Object.fromEntries(
        Array.from({ length: 100 }, (_, i) => [String(1927 + i), i + 1]),
      );

      expect(toYearCounts({ aggregations: { yearPublished } }).truncated).toBeTrue();
    });
  });
});
