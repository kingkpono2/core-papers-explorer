export interface LayoutInput {
  /** Cosine similarity of every pair of papers, `i * n + j`. */
  similarity: Float64Array;
  /** Topic of each paper, from 0 to k − 1. */
  topicOf: readonly number[];
  k: number;
  /** Cosine similarity of every pair of topic centroids, `a * k + b`. */
  topicSimilarity: Float64Array;
  /** Drawn radius of each star, so stars never overlap. */
  radii: readonly number[];
  width: number;
  height: number;
  random: () => number;
}

export interface GalaxyLayout {
  x: number[];
  y: number[];
  /** Topics in their order around the galaxy. */
  ring: number[];
  /** Constellation lines: the strongest links that join each topic's papers into one tree. */
  edges: [number, number][];
}

export const MIN_STAR_RADIUS = 4;
export const MAX_STAR_RADIUS = 7;
/** Neighbours each paper is linked to by similarity. */
export const NEIGHBOURS = 5;
const TICKS = 240;
const MARGIN = 28;
const MAX_SCALE = 2.5;
const MAX_STRETCH = 1.35;

/**
 * Pairs of topic colours (by index, so slots 1 to 8 minus one) that fail the colour-blindness or
 * normal-vision checks against each other on the night sky. They are never placed side by side.
 * Worked out with the dataviz palette validator for the dark categorical palette on #0b1222.
 */
export const CONFUSABLE_TOPICS: readonly (readonly [number, number])[] = [
  [0, 6],
  [1, 3],
  [1, 4],
  [1, 5],
  [1, 7],
  [2, 4],
  [2, 5],
  [2, 7],
  [3, 5],
  [3, 7],
  [4, 7],
];

/** Newer papers are bigger stars: from 4 px for the oldest (or undated) to 7 px for the newest. */
export function starRadius(year: number | null, first: number, last: number): number {
  if (year === null || last <= first) {
    return year === null ? MIN_STAR_RADIUS : MAX_STAR_RADIUS;
  }
  const t = Math.min(1, Math.max(0, (year - first) / (last - first)));
  return MIN_STAR_RADIUS + (MAX_STAR_RADIUS - MIN_STAR_RADIUS) * t ** 1.5;
}

/**
 * The order of topics around the galaxy: of all the circular orders in which no two neighbouring
 * topics have colours that are hard to tell apart, the one that puts the most similar topics next
 * to each other. With at most eight topics every order can be tried.
 */
export function ringOrder(k: number, topicSimilarity: Float64Array): number[] {
  const confusable = new Set(CONFUSABLE_TOPICS.map(([a, b]) => `${a},${b}`));
  const clash = (a: number, b: number) =>
    k > 3 && confusable.has(`${Math.min(a, b)},${Math.max(a, b)}`);
  const identity = Array.from({ length: k }, (_, i) => i);
  let best: number[] | null = null;
  let bestScore = -Infinity;
  for (const rest of permutations(identity.slice(1))) {
    const order = [0, ...rest];
    let score = 0;
    let valid = true;
    for (let i = 0; i < k && valid; i++) {
      const a = order[i];
      const b = order[(i + 1) % k];
      valid = !clash(a, b);
      score += topicSimilarity[a * k + b];
    }
    if (valid && score > bestScore + 1e-12) {
      best = order;
      bestScore = score;
    }
  }
  return best ?? identity;
}

function* permutations(items: number[]): Generator<number[]> {
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) {
      yield [items[i], ...tail];
    }
  }
}

/**
 * Places the papers like stars in a galaxy with a small, seeded force simulation (in the manner of
 * d3-force, without the dependency): each topic is pulled towards its own point on an ellipse,
 * every paper is linked by a spring to its five most similar papers, stars repel each other and
 * never overlap. The same input and seed always give the same picture.
 */
export function layoutGalaxy(input: LayoutInput): GalaxyLayout {
  const { similarity, topicOf, k, radii, width, height, random } = input;
  const n = topicOf.length;
  const ring = ringOrder(k, input.topicSimilarity);
  const anchors = anchorPoints(ring, topicOf, k, width, height);
  const cell = Math.sqrt((width * height) / Math.max(n, 1));
  const spread = Math.min(width, height) * 0.06;

  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const anchor = anchors[topicOf[i]];
    const [gx, gy] = gaussianPair(random);
    x[i] = anchor.x + gx * spread;
    y[i] = anchor.y + gy * spread;
  }

  const links = neighbourLinks(similarity, n, topicOf);
  const degree = new Float64Array(n);
  for (const link of links) {
    degree[link.a]++;
    degree[link.b]++;
  }

  const charge = -cell * 0.9;
  const alphaMin = 0.001;
  const alphaDecay = 1 - alphaMin ** (1 / TICKS);
  const velocityDecay = 0.45;
  let alpha = 1;

  for (let tick = 0; tick < TICKS; tick++) {
    alpha += -alpha * alphaDecay;

    for (const { a, b, strength, length } of links) {
      let dx = x[b] + vx[b] - x[a] - vx[a];
      let dy = y[b] + vy[b] - y[a] - vy[a];
      const distance = Math.sqrt(dx * dx + dy * dy) || 1e-6;
      const pull = ((distance - length) / distance) * alpha * strength;
      dx *= pull;
      dy *= pull;
      const share = degree[a] / (degree[a] + degree[b]);
      vx[b] -= dx * share;
      vy[b] -= dy * share;
      vx[a] += dx * (1 - share);
      vy[a] += dy * (1 - share);
    }

    for (let i = 0; i < n; i++) {
      const anchor = anchors[topicOf[i]];
      vx[i] += (anchor.x - x[i]) * 0.06 * alpha;
      vy[i] += (anchor.y - y[i]) * 0.06 * alpha;
    }

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = x[j] - x[i];
        const dy = y[j] - y[i];
        const d2 = Math.max(dx * dx + dy * dy, 1);
        const push = (charge * alpha) / d2;
        vx[i] += dx * push;
        vy[i] += dy * push;
        vx[j] -= dx * push;
        vy[j] -= dy * push;
      }
    }

    for (let i = 0; i < n; i++) {
      vx[i] *= 1 - velocityDecay;
      vy[i] *= 1 - velocityDecay;
      x[i] += vx[i];
      y[i] += vy[i];
    }
    // Overlaps only matter once the stars settle, so they are resolved every third tick until then.
    if (tick % 3 === 0 || tick >= TICKS - 40) {
      separate(x, y, radii);
    }
  }

  fit(x, y, radii, width, height);
  for (let pass = 0; pass < 4; pass++) {
    separate(x, y, radii);
    clamp(x, y, radii, width, height);
  }
  return {
    x: Array.from(x, round),
    y: Array.from(y, round),
    ring,
    edges: constellations(similarity, topicOf, k),
  };
}

interface Link {
  a: number;
  b: number;
  strength: number;
  length: number;
}

/** Springs to each paper's most similar papers; weaker, and longer, between topics. */
function neighbourLinks(similarity: Float64Array, n: number, topicOf: readonly number[]): Link[] {
  const seen = new Set<number>();
  const links: Link[] = [];
  for (let i = 0; i < n; i++) {
    const nearest = Array.from({ length: n }, (_, j) => j)
      .filter((j) => j !== i && similarity[i * n + j] > 0)
      .sort((a, b) => similarity[i * n + b] - similarity[i * n + a] || a - b)
      .slice(0, NEIGHBOURS);
    for (const j of nearest) {
      const key = Math.min(i, j) * n + Math.max(i, j);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const s = similarity[i * n + j];
      const same = topicOf[i] === topicOf[j];
      links.push({
        a: i,
        b: j,
        strength: (same ? 0.5 : 0.12) * (0.3 + s),
        length: (same ? 22 : 48) * (1.4 - s),
      });
    }
  }
  return links;
}

/** One point per topic on an ellipse, with more of the circle for bigger topics. */
function anchorPoints(
  ring: readonly number[],
  topicOf: readonly number[],
  k: number,
  width: number,
  height: number,
): { x: number; y: number }[] {
  const sizes = new Array<number>(k).fill(0);
  for (const topic of topicOf) {
    sizes[topic]++;
  }
  const weights = ring.map((topic) => Math.sqrt(sizes[topic]));
  const total = weights.reduce((sum, w) => sum + w, 0) || 1;
  const anchors = new Array<{ x: number; y: number }>(k);
  let start = 0;
  ring.forEach((topic, position) => {
    const angle = -Math.PI / 2 + 2 * Math.PI * ((start + weights[position] / 2) / total);
    start += weights[position];
    anchors[topic] =
      k === 1
        ? { x: width / 2, y: height / 2 }
        : {
            x: width / 2 + Math.cos(angle) * width * 0.3,
            y: height / 2 + Math.sin(angle) * height * 0.28,
          };
  });
  return anchors;
}

/** Pushes overlapping stars apart, keeping a small gap between them. */
function separate(x: Float64Array, y: Float64Array, radii: readonly number[]): void {
  const n = x.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const min = radii[i] + radii[j] + 3;
      let dx = x[j] - x[i];
      let dy = y[j] - y[i];
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) {
        continue;
      }
      let distance = Math.sqrt(d2);
      if (distance < 1e-6) {
        // Exactly on top of each other: part them along a fixed direction per pair.
        dx = Math.cos(i * 2.4 + j);
        dy = Math.sin(i * 2.4 + j);
        distance = 1;
      }
      const shift = (min - distance) / distance / 2;
      x[i] -= dx * shift;
      y[i] -= dy * shift;
      x[j] += dx * shift;
      y[j] += dy * shift;
    }
  }
}

/**
 * Scales and centres the stars to fill the box. The two axes may stretch a little differently
 * (up to `MAX_STRETCH`), so a round galaxy still fills a tall phone screen.
 */
function fit(
  x: Float64Array,
  y: Float64Array,
  radii: readonly number[],
  width: number,
  height: number,
): void {
  if (!x.length) {
    return;
  }
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  x.forEach((value, i) => {
    left = Math.min(left, value - radii[i]);
    right = Math.max(right, value + radii[i]);
    top = Math.min(top, y[i] - radii[i]);
    bottom = Math.max(bottom, y[i] + radii[i]);
  });
  const fitX = Math.min((width - 2 * MARGIN) / Math.max(right - left, 1), MAX_SCALE);
  const fitY = Math.min((height - 2 * MARGIN) / Math.max(bottom - top, 1), MAX_SCALE);
  const scaleX = Math.min(fitX, fitY * MAX_STRETCH);
  const scaleY = Math.min(fitY, fitX * MAX_STRETCH);
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  for (let i = 0; i < x.length; i++) {
    x[i] = width / 2 + (x[i] - cx) * scaleX;
    y[i] = height / 2 + (y[i] - cy) * scaleY;
  }
}

function clamp(
  x: Float64Array,
  y: Float64Array,
  radii: readonly number[],
  width: number,
  height: number,
): void {
  for (let i = 0; i < x.length; i++) {
    const r = radii[i] + 2;
    x[i] = Math.min(Math.max(x[i], r), width - r);
    y[i] = Math.min(Math.max(y[i], r), height - r);
  }
}

/**
 * Each topic's maximum spanning tree on similarity (Prim's algorithm): the strongest links that
 * join all its papers, drawn as constellation lines.
 */
export function constellations(
  similarity: Float64Array,
  topicOf: readonly number[],
  k: number,
): [number, number][] {
  const n = topicOf.length;
  const edges: [number, number][] = [];
  for (let topic = 0; topic < k; topic++) {
    const members = topicOf.flatMap((t, i) => (t === topic ? [i] : []));
    if (members.length < 2) {
      continue;
    }
    const best = new Map(
      members.slice(1).map((m) => [m, { from: members[0], s: similarity[members[0] * n + m] }]),
    );
    while (best.size) {
      let next = -1;
      let link = { from: -1, s: -Infinity };
      for (const [member, candidate] of best) {
        if (candidate.s > link.s) {
          next = member;
          link = candidate;
        }
      }
      best.delete(next);
      edges.push([link.from, next]);
      for (const [member, candidate] of best) {
        const s = similarity[next * n + member];
        if (s > candidate.s) {
          best.set(member, { from: next, s });
        }
      }
    }
  }
  return edges;
}

/** Two independent standard normal numbers (Box–Muller). */
function gaussianPair(random: () => number): [number, number] {
  const u = Math.max(random(), 1e-12);
  const v = random();
  const r = Math.sqrt(-2 * Math.log(u));
  return [r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)];
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
