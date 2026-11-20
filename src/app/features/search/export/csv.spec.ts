import { makePaper } from '../../../../testing/paper.fixture';
import { csvCell, toCsv } from './csv';

describe('toCsv', () => {
  it('writes a header row and one row per paper with CRLF line endings', () => {
    const csv = toCsv([
      makePaper({
        id: '42',
        title: 'Drone delivery',
        authors: ['Doe, Jane', 'Roe, Rick'],
        year: 2020,
        doi: '10.1/abc',
        citationCount: 3,
      }),
    ]);
    const [header, row, end] = csv.split('\r\n');

    expect(header).toBe(
      'Title,Authors,Year,Published,Journal,Publisher,Document type,Language,Citations,DOI,' +
        'Full text,CORE page,Abstract',
    );
    expect(row).toBe(
      'Drone delivery,"Doe, Jane; Roe, Rick",2020,,,,,,3,10.1/abc,,https://core.ac.uk/works/42,',
    );
    expect(end).toBe('');
  });

  it('writes only the header for no papers', () => {
    expect(toCsv([]).split('\r\n')).toEqual([jasmine.stringContaining('Title,'), '']);
  });
});

describe('csvCell', () => {
  it('leaves plain values alone and empties missing ones', () => {
    expect(csvCell('Drones')).toBe('Drones');
    expect(csvCell(2020)).toBe('2020');
    expect(csvCell(null)).toBe('');
  });

  it('quotes commas, quotes, line breaks and edge spaces', () => {
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('the "best" drone')).toBe('"the ""best"" drone"');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(csvCell('cr\rlf')).toBe('"cr\rlf"');
    expect(csvCell(' padded ')).toBe('" padded "');
  });

  it('stops spreadsheets reading text as a formula', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\t=1')).toBe("'\t=1");
    expect(csvCell('a=b')).toBe('a=b');
  });
});
