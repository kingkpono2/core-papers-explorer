import { distinctiveTerms, labelTerms, topicLabel } from './topic-labels';

describe('distinctiveTerms', () => {
  const vocabulary = ['battery', 'drone', 'last', 'last mile', 'mile', 'survey', 'swap', 'trust'];
  const id = (term: string) => vocabulary.indexOf(term);
  const paper = (entries: Record<string, number>) =>
    new Map(Object.entries(entries).map(([term, count]) => [id(term), count]));
  const names = (lists: number[][]) => lists.map((list) => list.map((i) => vocabulary[i]));

  // Topic 0 is about battery swaps, topic 1 about trust surveys; "drone" is everywhere.
  const counts = [
    paper({ battery: 3, swap: 1, drone: 2 }),
    paper({ battery: 2, swap: 2, drone: 2 }),
    paper({ battery: 1, drone: 1, trust: 1 }),
    paper({ survey: 2, trust: 2, drone: 2 }),
    paper({ survey: 1, trust: 2, drone: 2 }),
    paper({ survey: 3, drone: 1, battery: 1 }),
  ];
  const topics = [0, 0, 0, 1, 1, 1];

  it('ranks the terms concentrated in each topic first and leaves out those spread evenly', () => {
    expect(names(distinctiveTerms(counts, topics, 2, vocabulary))).toEqual([
      ['battery', 'swap'],
      ['survey', 'trust'],
    ]);
  });

  it('needs a term in at least two of the topic’s papers', () => {
    const lists = names(distinctiveTerms(counts, topics, 2, vocabulary));

    // "trust" is in one paper of topic 0, "battery" in one of topic 1.
    expect(lists[0]).not.toContain('trust');
    expect(lists[1]).not.toContain('battery');
  });

  it('prefers a pair of words to the single words in it', () => {
    const withPhrase = [
      paper({ last: 2, mile: 2, 'last mile': 2, swap: 1 }),
      paper({ last: 1, mile: 1, 'last mile': 1, swap: 1 }),
      paper({ survey: 2, trust: 1 }),
      paper({ survey: 1, trust: 2 }),
    ];

    const [first] = names(distinctiveTerms(withPhrase, [0, 0, 1, 1], 2, vocabulary));

    expect(first).toContain('last mile');
    expect(first).not.toContain('last');
    expect(first).not.toContain('mile');
  });
});

describe('labelTerms', () => {
  it('names a topic by its two leading terms', () => {
    expect(labelTerms([['parcel', 'last mile', 'locker']])).toEqual([['parcel', 'last mile']]);
  });

  it('never leads two topics with the same term', () => {
    expect(
      labelTerms([
        ['routing', 'truck'],
        ['routing', 'swarm', 'airspace'],
      ]),
    ).toEqual([
      ['routing', 'truck'],
      ['swarm', 'routing'],
    ]);
  });

  it('joins the terms into a label, with a fallback for a topic without any', () => {
    expect(topicLabel(['parcel', 'last mile'])).toBe('parcel · last mile');
    expect(topicLabel([])).toBe('Other papers');
  });
});
