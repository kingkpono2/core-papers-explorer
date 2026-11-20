/**
 * A small in-memory cache that forgets the least recently used entry beyond `maxEntries`, and
 * entries older than `ttlMs`.
 */
export class LruCache<K, V> {
  // Map keeps insertion order, so the first key is always the least recently used.
  private readonly entries = new Map<K, { value: V; storedAt: number }>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs = Infinity,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get size(): number {
    return this.entries.size;
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    this.entries.delete(key);
    if (this.now() - entry.storedAt >= this.ttlMs) {
      return undefined;
    }
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, { value, storedAt: this.now() });
    if (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value!);
    }
  }
}
