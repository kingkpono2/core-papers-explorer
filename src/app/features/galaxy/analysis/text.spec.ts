import { STOP_WORDS } from './stop-words';
import { TITLE_WEIGHT, Token, extractTerms, queryTerms, stem, tokenise } from './text';

/** The words kept, in order. */
const kept = (tokens: (Token | null)[]) => tokens.flatMap((token) => (token ? [token.word] : []));

describe('stem', () => {
  const cases: [string, string][] = [
    ['drones', 'drone'],
    ['deliveries', 'delivery'],
    ['addresses', 'address'],
    ['routing', 'rout'],
    ['planning', 'plan'],
    ['delivering', 'deliver'],
    ['planned', 'plan'],
    ['embedded', 'embed'],
    ['buildings', 'build'],
    ['installing', 'install'],
    ['analysis', 'analysis'],
    ['status', 'status'],
    ['speed', 'speed'],
    ['string', 'string'],
    ['uavs', 'uav'],
    ['gas', 'gas'],
  ];
  for (const [word, expected] of cases) {
    it(`stems ${word} to ${expected}`, () => {
      expect(stem(word)).toBe(expected);
    });
  }
});

describe('tokenise', () => {
  it('lowercases and drops accents, HTML tags, entities and punctuation', () => {
    const tokens = tokenise('<p>Naïve UAV routing:</p> faster &amp; greener <i>Parcels</i>!');

    expect(kept(tokens)).toEqual(['naive', 'uav', 'routing', 'faster', 'greener', 'parcels']);
    expect(tokens.find((t) => t?.word === 'parcels')?.stem).toBe('parcel');
  });

  it('marks a break wherever a phrase ends or a word was dropped', () => {
    const tokens = tokenise('Truck routing, drone swarms and parcel lockers');
    const neighbours = tokens.flatMap((token, i) =>
      token && tokens[i - 1] ? [`${tokens[i - 1]!.word} ${token.word}`] : [],
    );

    expect(neighbours).toEqual(['truck routing', 'drone swarms', 'parcel lockers']);
  });

  it('keeps hyphenated and en-dashed words as neighbours', () => {
    const tokens = tokenise('Last-mile and truck–drone and vehicle&ndash;drone delivery');

    expect(kept(tokens)).toEqual([
      'last',
      'mile',
      'truck',
      'drone',
      'vehicle',
      'drone',
      'delivery',
    ]);
    expect(tokens.indexOf(null, 1)).toBe(3);
  });

  it('drops stop words, academic filler and bare numbers, but keeps 5g and ai', () => {
    const tokens = tokenise('This paper proposes a novel approach based on 5G and AI in 2023');

    expect(kept(tokens)).toEqual(['5g', 'ai']);
    for (const filler of ['study', 'paper', 'results', 'method', 'approach', 'proposed', 'based']) {
      expect(STOP_WORDS.has(filler)).withContext(filler).toBeTrue();
    }
    expect(STOP_WORDS.has('last')).toBeFalse();
  });

  it('drops the words of the query in every form, and words matching a wildcard', () => {
    const query = queryTerms('(drone AND (package OR delivery)) AND rout*');
    const tokens = tokenise(
      'Drones delivering packages, parcel deliveries, routing and routes',
      query,
    );

    expect(kept(tokens)).toEqual(['parcel']);
  });

  it('ignores negated words and fields other than the title and abstract in the query', () => {
    const query = queryTerms('drone NOT military AND authors:smith');

    expect([...query.stems]).toEqual(['drone']);
    expect(kept(tokenise('Military drones by Smith', query))).toEqual(['military', 'smith']);
  });
});

describe('extractTerms', () => {
  const papers = [
    { title: 'Last-mile parcel lockers', abstract: 'Parcel lockers cut last mile costs.' },
    { title: 'Parcel routing', abstract: null },
  ];

  it('counts title words twice, abstract words once', () => {
    const { counts } = extractTerms(papers);

    expect(counts[0].get('parcel')).toBe(TITLE_WEIGHT + 1);
    expect(counts[0].get('cost')).toBe(1);
    expect(counts[1].get('rout')).toBe(TITLE_WEIGHT);
  });

  it('pairs words only where they stood next to each other in the same phrase', () => {
    const { counts } = extractTerms([
      { title: 'Last mile', abstract: 'Last, mile. Delivery of parcel lockers' },
    ]);

    expect(counts[0].get('last mile')).toBe(TITLE_WEIGHT);
    expect(counts[0].get('parcel locker')).toBe(1);
    // "delivery of parcel": "of" was dropped, so they were not neighbours.
    expect(counts[0].has('delivery parcel')).toBeFalse();
  });

  it('remembers how each stem is most often written', () => {
    const { forms } = extractTerms([
      { title: 'Routing', abstract: 'routing routing routed' },
      { title: 'Lockers', abstract: 'last mile lockers' },
    ]);

    expect(forms.get('rout')).toBe('routing');
    expect(forms.get('last mile')).toBe('last mile');
    expect(forms.get('locker')).toBe('lockers');
  });
});
