import { LruCache } from './lru-cache';

describe('LruCache', () => {
  let time: number;
  const now = () => time;

  beforeEach(() => (time = 0));

  it('returns stored values and nothing for unknown keys', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
  });

  it('forgets the least recently used entry beyond its size', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);

    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBe(2);
  });

  it('replaces the value for a key that is set again', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('a', 2);

    expect(cache.get('a')).toBe(2);
    expect(cache.size).toBe(1);
  });

  it('expires entries once they reach their time to live', () => {
    const cache = new LruCache<string, number>(2, 1000, now);
    cache.set('a', 1);

    time = 999;
    expect(cache.get('a')).toBe(1);

    time = 1000;
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('counts the time to live from when the value was stored, not read', () => {
    const cache = new LruCache<string, number>(2, 1000, now);
    cache.set('a', 1);
    time = 600;
    cache.get('a');
    time = 1200;

    expect(cache.get('a')).toBeUndefined();

    cache.set('a', 2);
    time = 2100;
    expect(cache.get('a')).toBe(2);
  });
});
