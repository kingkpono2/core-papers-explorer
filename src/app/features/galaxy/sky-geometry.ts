export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LabelRequest {
  /** The stars of the topic. */
  members: readonly Point[];
  width: number;
  height: number;
}

export interface PlacedLabel {
  /** Centre of the label. */
  x: number;
  y: number;
  /** False when there was no free space for it; the legend still names the topic. */
  shown: boolean;
}

export type Direction = 'left' | 'right' | 'up' | 'down';

const LABEL_GAP = 6;
const RINGS = [0, 16, 32, 48, 64, 80];
const DIRECTIONS = 12;

/**
 * Puts each topic's name at its centre or, if that would cover stars or another name, at the
 * nearest place around it that covers as few stars as possible, inside the sky and clear of
 * `obstacles` (such as the year counter). Bigger topics are placed first. A name that fits
 * nowhere is not shown: names never overlap.
 */
export function placeLabels(
  labels: readonly LabelRequest[],
  stars: readonly (Point & { r: number })[],
  sky: { width: number; height: number },
  obstacles: readonly Box[] = [],
): PlacedLabel[] {
  const taken: Box[] = [...obstacles];
  const placed = new Array<PlacedLabel>(labels.length);
  const order = labels
    .map((_, i) => i)
    .sort((a, b) => labels[b].members.length - labels[a].members.length || a - b);

  for (const index of order) {
    const { members, width, height } = labels[index];
    const centre = centroid(members);
    let best: { box: Box; cost: number } | null = null;
    for (const ring of RINGS) {
      for (let d = 0; d < (ring ? DIRECTIONS : 1); d++) {
        const angle = -Math.PI / 2 + (d * 2 * Math.PI) / DIRECTIONS;
        const x = centre.x + Math.cos(angle) * ring * 1.6;
        const y = centre.y + Math.sin(angle) * ring;
        const box = { x: x - width / 2, y: y - height / 2, width, height };
        if (!inside(box, sky) || taken.some((other) => overlaps(box, other, LABEL_GAP))) {
          continue;
        }
        const covered = stars.filter((star) => touches(box, star)).length;
        const cost = covered * 40 + Math.hypot(x - centre.x, y - centre.y);
        if (!best || cost < best.cost) {
          best = { box, cost };
        }
      }
    }
    if (best) {
      taken.push(best.box);
      placed[index] = {
        x: best.box.x + width / 2,
        y: best.box.y + height / 2,
        shown: true,
      };
    } else {
      placed[index] = { x: centre.x, y: centre.y, shown: false };
    }
  }
  return placed;
}

export function centroid(points: readonly Point[]): Point {
  if (!points.length) {
    return { x: 0, y: 0 };
  }
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
}

function inside(box: Box, sky: { width: number; height: number }): boolean {
  return (
    box.x >= 4 &&
    box.y >= 4 &&
    box.x + box.width <= sky.width - 4 &&
    box.y + box.height <= sky.height - 4
  );
}

function overlaps(a: Box, b: Box, gap = 0): boolean {
  return (
    a.x < b.x + b.width + gap &&
    b.x < a.x + a.width + gap &&
    a.y < b.y + b.height + gap &&
    b.y < a.y + a.height + gap
  );
}

function touches(box: Box, star: Point & { r: number }): boolean {
  const nearestX = Math.min(Math.max(star.x, box.x), box.x + box.width);
  const nearestY = Math.min(Math.max(star.y, box.y), box.y + box.height);
  return Math.hypot(star.x - nearestX, star.y - nearestY) < star.r + 2;
}

/**
 * The star to move to with an arrow key: the closest one in that direction, preferring those
 * straight ahead (within about 60° of it) and otherwise anything on that side. Null when there is
 * nothing that way.
 */
export function nearestInDirection(
  points: readonly Point[],
  from: number,
  direction: Direction,
  allowed: (index: number) => boolean = () => true,
): number | null {
  const origin = points[from];
  let best: number | null = null;
  let bestScore = Infinity;
  let fallback: number | null = null;
  let fallbackScore = Infinity;
  points.forEach((point, i) => {
    if (i === from || !allowed(i)) {
      return;
    }
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const [ahead, across] =
      direction === 'right'
        ? [dx, dy]
        : direction === 'left'
          ? [-dx, dy]
          : direction === 'down'
            ? [dy, dx]
            : [-dy, dx];
    if (ahead <= 0) {
      return;
    }
    const score = ahead + Math.abs(across) * 2;
    if (Math.abs(across) <= ahead * 1.75) {
      if (score < bestScore) {
        best = i;
        bestScore = score;
      }
    } else if (score < fallbackScore) {
      fallback = i;
      fallbackScore = score;
    }
  });
  return best ?? fallback;
}
