import { makePaper } from '../../../../testing/paper.fixture';
import { citationKey, text, toBibtex } from './bibtex';

describe('toBibtex', () => {
  it('writes an article for a paper in a journal', () => {
    const bib = toBibtex([
      makePaper({
        id: '7',
        title: 'Drone delivery',
        authors: ['Doe, Jane', 'Rick Roe'],
        year: 2020,
        journal: 'Journal of Drones',
        publisher: 'Elsevier',
        doi: '10.1000/xyz_1',
        abstract: 'Short\n  abstract.',
      }),
    ]);

    expect(bib).toBe(
      [
        '@article{doe2020,',
        '  title = {Drone delivery},',
        '  author = {Doe, Jane and Rick Roe},',
        '  year = {2020},',
        '  journal = {Journal of Drones},',
        '  publisher = {Elsevier},',
        '  doi = {10.1000/xyz_1},',
        '  url = {https://core.ac.uk/works/7},',
        '  abstract = {Short abstract.}',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('writes misc for anything else, prefers the full text link and skips empty fields', () => {
    const bib = toBibtex([makePaper({ title: 'Notes', downloadUrl: 'https://x.org/a.pdf' })]);

    expect(bib).toBe('@misc{anonnd,\n  title = {Notes},\n  url = {https://x.org/a.pdf}\n}\n');
  });

  it('makes repeated keys unique', () => {
    const paper = makePaper({ authors: ['Smith, A'], year: 2020 });
    const keys = toBibtex([paper, paper, paper, makePaper({ authors: ['Jones'], year: 2020 })])
      .match(/^@\w+\{[^,]+/gm)
      ?.map((line) => line.split('{')[1]);

    expect(keys).toEqual(['smith2020', 'smith2020a', 'smith2020b', 'jones2020']);
  });

  it('escapes special characters in text fields', () => {
    const bib = toBibtex([makePaper({ title: '50% of {drones} & R_2' })]);

    expect(bib).toContain('title = {50\\% of \\{drones\\} \\& R\\_2}');
  });
});

describe('citationKey', () => {
  it('uses the family name from either name order, in plain letters', () => {
    expect(citationKey(makePaper({ authors: ['Müller, Anna'], year: 2019 }))).toBe('muller2019');
    expect(citationKey(makePaper({ authors: ['Anna van der Berg'], year: 2019 }))).toBe('berg2019');
    expect(citationKey(makePaper({ authors: ["O'Brien, Pat"], year: null }))).toBe('obriennd');
    expect(citationKey(makePaper({ authors: ['Xiao Liu (13082469)'], year: 2025 }))).toBe(
      'liu2025',
    );
    expect(citationKey(makePaper({ authors: ['王伟'], year: 2021 }))).toBe('anon2021');
  });
});

describe('text', () => {
  it('escapes every BibTeX special character', () => {
    expect(text('\\ { } & % $ # _ ^ ~')).toBe(
      '\\textbackslash{} \\{ \\} \\& \\% \\$ \\# \\_ \\textasciicircum{} \\textasciitilde{}',
    );
  });
});
