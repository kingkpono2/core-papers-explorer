/**
 * Keeps the last `capacity` items pushed into it. Each push returns a sequence number that finds
 * the item again for as long as it is kept, so replacing one is O(1) and leaves the others alone.
 */
export class RingBuffer<T> {
  private readonly slots: (T | undefined)[];
  /** The sequence number of the next push. Starts at 1, so no item is ever numbered 0. */
  private next = 1;
  /** The oldest sequence number still kept. */
  private first = 1;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`A ring buffer needs a capacity of at least 1, not ${capacity}.`);
    }
    this.slots = new Array<T | undefined>(capacity);
  }

  get size(): number {
    return this.next - this.first;
  }

  /** The sequence number the next push will get. */
  get nextSequence(): number {
    return this.next;
  }

  /** Adds an item, dropping the oldest once full, and returns the item's sequence number. */
  push(item: T): number {
    const seq = this.next++;
    this.slots[seq % this.capacity] = item;
    this.first = Math.max(this.first, this.next - this.capacity);
    return seq;
  }

  get(seq: number): T | undefined {
    return this.holds(seq) ? this.slots[seq % this.capacity] : undefined;
  }

  /** Replaces a kept item. Returns false, changing nothing, once it has been pushed out. */
  replace(seq: number, item: T): boolean {
    if (!this.holds(seq)) {
      return false;
    }
    this.slots[seq % this.capacity] = item;
    return true;
  }

  /** The kept items, newest first. */
  toArray(): T[] {
    const items: T[] = [];
    for (let seq = this.next - 1; seq >= this.first; seq--) {
      items.push(this.slots[seq % this.capacity]!);
    }
    return items;
  }

  /** Forgets every item. Sequence numbers keep counting, so old ones never find a new item. */
  clear(): void {
    this.slots.fill(undefined);
    this.first = this.next;
  }

  private holds(seq: number): boolean {
    return Number.isInteger(seq) && seq >= this.first && seq < this.next;
  }
}
