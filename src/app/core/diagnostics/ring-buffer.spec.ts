import { RingBuffer } from './ring-buffer';

describe('RingBuffer', () => {
  const filled = (capacity: number, count: number) => {
    const buffer = new RingBuffer<string>(capacity);
    const seqs = Array.from({ length: count }, (_, i) => buffer.push(`item ${i + 1}`));
    return { buffer, seqs };
  };

  it('keeps the last items up to its capacity, newest first', () => {
    const { buffer } = filled(3, 5);

    expect(buffer.size).toBe(3);
    expect(buffer.toArray()).toEqual(['item 5', 'item 4', 'item 3']);
  });

  it('lists fewer items than its capacity in the same order', () => {
    const { buffer } = filled(3, 2);

    expect(buffer.size).toBe(2);
    expect(buffer.toArray()).toEqual(['item 2', 'item 1']);
  });

  it('numbers items from 1 and finds them for as long as they are kept', () => {
    const { buffer, seqs } = filled(3, 4);

    expect(seqs).toEqual([1, 2, 3, 4]);
    expect(buffer.nextSequence).toBe(5);
    expect(buffer.get(1)).toBeUndefined();
    expect(buffer.get(2)).toBe('item 2');
    expect(buffer.get(4)).toBe('item 4');
    expect(buffer.get(5)).toBeUndefined();
    expect(buffer.get(0)).toBeUndefined();
    expect(buffer.get(2.5)).toBeUndefined();
  });

  it('replaces a kept item, but not one that was pushed out', () => {
    const { buffer } = filled(2, 3);

    expect(buffer.replace(3, 'third, updated')).toBeTrue();
    expect(buffer.replace(1, 'first, updated')).toBeFalse();
    expect(buffer.toArray()).toEqual(['third, updated', 'item 2']);
  });

  it('forgets everything on clear without numbering new items as old ones', () => {
    const { buffer } = filled(3, 2);

    buffer.clear();
    expect(buffer.size).toBe(0);
    expect(buffer.toArray()).toEqual([]);
    expect(buffer.get(2)).toBeUndefined();

    expect(buffer.push('after')).toBe(3);
    expect(buffer.toArray()).toEqual(['after']);
  });

  it('needs a capacity of at least 1', () => {
    expect(() => new RingBuffer(0)).toThrowError(RangeError);
    expect(() => new RingBuffer(1.5)).toThrowError(RangeError);
  });
});
