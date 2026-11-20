import { makePaper } from '../../../testing/paper.fixture';
import { mergeDuplicates } from './merge-duplicates';

describe('mergeDuplicates', () => {
  it('keeps the first of papers with the same title, filling in what it lacks', () => {
    const papers = [
      makePaper({ id: '1', title: 'Drone-as-a-Service for last-mile delivery', year: null }),
      makePaper({ id: '2', title: 'Truck routing with drones', year: 2021 }),
      makePaper({
        id: '3',
        title: 'Drone-as-a-service for Last Mile Delivery.',
        year: 2022,
        abstract: 'An abstract.',
        authors: ['Ada Lovelace'],
      }),
    ];

    const { papers: merged, merged: count } = mergeDuplicates(papers);

    expect(count).toBe(1);
    expect(merged.map((p) => p.id)).toEqual(['1', '2']);
    expect(merged[0]).toEqual(
      jasmine.objectContaining({ year: 2022, abstract: 'An abstract.', authors: ['Ada Lovelace'] }),
    );
  });

  it('never merges short, generic titles', () => {
    const papers = [
      makePaper({ id: '1', title: 'Editorial' }),
      makePaper({ id: '2', title: 'Editorial' }),
    ];

    expect(mergeDuplicates(papers).merged).toBe(0);
  });
});
