import { topicSearch } from './topic-search';

describe('topicSearch', () => {
  it('narrows the query, as CORE reads it, to papers mentioning the topic’s name terms', () => {
    expect(
      topicSearch('(drone AND (package OR delivery))', { labelTerms: ['truck', 'last mile'] }),
    ).toBe('drone AND (package OR delivery) AND (truck OR "last mile")');
  });

  it('has nothing to search for a topic without terms, or a query it cannot narrow safely', () => {
    expect(topicSearch('drone', { labelTerms: [] })).toBeNull();
    expect(topicSearch('drone OR (package OR delivery)', { labelTerms: ['truck'] })).toBeNull();
  });
});
