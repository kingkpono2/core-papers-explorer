import {
  CONFUSABLE_TOPICS,
  MAX_STAR_RADIUS,
  MIN_STAR_RADIUS,
  constellations,
  layoutGalaxy,
  ringOrder,
  starRadius,
} from './galaxy-layout';
import { seededRandom } from './kmeans';

/** `perTopic` papers in each of `k` topics: similar within a topic, unrelated across. */
function clusteredInput(k: number, perTopic: number, width = 800, height = 450) {
  const n = k * perTopic;
  const topicOf = Array.from({ length: n }, (_, i) => Math.floor(i / perTopic));
  const similarity = new Float64Array(n * n).map((_, cell) => {
    const [i, j] = [Math.floor(cell / n), cell % n];
    if (i === j) {
      return 1;
    }
    return topicOf[i] === topicOf[j] ? 0.5 + ((i * 7 + j * 7) % 10) / 40 : 0.02;
  });
  const topicSimilarity = new Float64Array(k * k).map((_, cell) =>
    Math.floor(cell / k) === cell % k ? 1 : 0.1,
  );
  return {
    similarity,
    topicOf,
    k,
    topicSimilarity,
    radii: topicOf.map((_, i) => 4 + (i % 4)),
    width,
    height,
  };
}

describe('starRadius', () => {
  it('grows with recency, from the smallest for the oldest or undated to the largest', () => {
    expect(starRadius(2016, 2016, 2026)).toBe(MIN_STAR_RADIUS);
    expect(starRadius(2026, 2016, 2026)).toBe(MAX_STAR_RADIUS);
    expect(starRadius(2021, 2016, 2026)).toBeGreaterThan(MIN_STAR_RADIUS);
    expect(starRadius(2021, 2016, 2026)).toBeLessThan(starRadius(2024, 2016, 2026));
    expect(starRadius(null, 2016, 2026)).toBe(MIN_STAR_RADIUS);
  });
});

describe('ringOrder', () => {
  const confusable = new Set(CONFUSABLE_TOPICS.map(([a, b]) => `${a},${b}`));

  it('never places topics with colours that are hard to tell apart side by side', () => {
    for (let k = 4; k <= 8; k++) {
      const order = ringOrder(k, new Float64Array(k * k));
      expect([...order].sort())
        .withContext(`k = ${k}`)
        .toEqual(order.map((_, i) => i));
      order.forEach((a, i) => {
        const b = order[(i + 1) % k];
        expect(confusable.has(`${Math.min(a, b)},${Math.max(a, b)}`))
          .withContext(`k = ${k}: ${a} next to ${b}`)
          .toBeFalse();
      });
    }
  });

  it('puts similar topics next to each other when the colours allow it', () => {
    // With seven topics the first and last colours clash, so the plain order cannot close the
    // ring; of the orders that can, the one linking the most similar topics wins.
    const cycle = [0, 1, 6, 2, 3, 4, 5];
    const similarity = new Float64Array(49);
    cycle.forEach((a, i) => {
      const b = cycle[(i + 1) % 7];
      similarity[a * 7 + b] = similarity[b * 7 + a] = 0.9;
    });
    const order = ringOrder(7, similarity);
    const mirror = [cycle[0], ...cycle.slice(1).reverse()];

    expect([cycle, mirror]).toContain(order);
  });
});

describe('layoutGalaxy', () => {
  it('gives the same picture for the same input and seed', () => {
    const input = clusteredInput(4, 8);
    const first = layoutGalaxy({ ...input, random: seededRandom(11) });
    const second = layoutGalaxy({ ...input, random: seededRandom(11) });

    expect(second).toEqual(first);
  });

  it('keeps every star inside the box without overlaps', () => {
    const input = clusteredInput(5, 12, 326, 408);
    const { x, y } = layoutGalaxy({ ...input, random: seededRandom(3) });

    for (let i = 0; i < x.length; i++) {
      const r = input.radii[i];
      expect(x[i] - r).toBeGreaterThanOrEqual(0);
      expect(x[i] + r).toBeLessThanOrEqual(input.width);
      expect(y[i] - r).toBeGreaterThanOrEqual(0);
      expect(y[i] + r).toBeLessThanOrEqual(input.height);
      for (let j = i + 1; j < x.length; j++) {
        const gap = Math.hypot(x[i] - x[j], y[i] - y[j]) - r - input.radii[j];
        expect(gap).withContext(`stars ${i} and ${j}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps each topic together and apart from the others', () => {
    const input = clusteredInput(4, 10);
    const { x, y } = layoutGalaxy({ ...input, random: seededRandom(5) });
    let within = 0;
    let across = 0;
    let withinPairs = 0;
    let acrossPairs = 0;
    for (let i = 0; i < x.length; i++) {
      for (let j = i + 1; j < x.length; j++) {
        const d = Math.hypot(x[i] - x[j], y[i] - y[j]);
        if (input.topicOf[i] === input.topicOf[j]) {
          within += d;
          withinPairs++;
        } else {
          across += d;
          acrossPairs++;
        }
      }
    }

    expect(within / withinPairs).toBeLessThan((across / acrossPairs) * 0.5);
  });
});

describe('constellations', () => {
  it('joins each topic’s papers into one tree along their strongest links', () => {
    // Papers 0–2 form a topic where 0–1 and 1–2 are strong and 0–2 weak; paper 3 is alone.
    const similarity = Float64Array.from([
      1, 0.9, 0.2, 0, 0.9, 1, 0.8, 0, 0.2, 0.8, 1, 0, 0, 0, 0, 1,
    ]);

    expect(constellations(similarity, [0, 0, 0, 1], 2)).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });
});
