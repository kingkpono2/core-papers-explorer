/**
 * Topic colours: the app's categorical palette in its dark steps, in its fixed order, because the
 * galaxy is a night sky in both themes. Checked with the dataviz palette validator against the sky
 * (#0b1222 and its lighter centre, #152038): every colour is at least 3:1 against it and within
 * the lightness band, and neighbouring slots pass the colour-blindness (ΔE ≥ 8.4) and
 * normal-vision (ΔE ≥ 19.3) checks.
 *
 * No eight colours can all be told apart from each other, so colour is never the only cue: each
 * topic also has its own star shape, its name on the map and in the legend, and topics whose
 * colours are close are never placed side by side (see `CONFUSABLE_TOPICS`).
 */
export const TOPIC_COLOURS = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
] as const;

/** Names of the shapes, for the legend's accessible text. */
export const TOPIC_SHAPES = [
  'circle',
  'square',
  'triangle',
  'diamond',
  'four-pointed star',
  'inverted triangle',
  'cross',
  'five-pointed star',
] as const;

export function topicColour(topic: number): string {
  return TOPIC_COLOURS[topic % TOPIC_COLOURS.length];
}

/**
 * The outline of a topic's star, centred on 0,0, with about the area of a circle of radius `r`, so
 * no shape looks heavier than another.
 */
export function starPath(topic: number, r: number): string {
  switch (topic % TOPIC_SHAPES.length) {
    case 0:
      return `M${f(r)},0A${f(r)},${f(r)} 0 1,1 ${f(-r)},0A${f(r)},${f(r)} 0 1,1 ${f(r)},0Z`;
    case 1: {
      const h = 0.886 * r;
      return `M${f(-h)},${f(-h)}H${f(h)}V${f(h)}H${f(-h)}Z`;
    }
    case 2:
      return polygon([
        [0, -1.555 * r],
        [1.347 * r, 0.778 * r],
        [-1.347 * r, 0.778 * r],
      ]);
    case 3: {
      const d = 1.253 * r;
      return polygon([
        [0, -d],
        [d, 0],
        [0, d],
        [-d, 0],
      ]);
    }
    case 4:
      return star(4, 1.626 * r, 0.42);
    case 5:
      return polygon([
        [0, 1.555 * r],
        [1.347 * r, -0.778 * r],
        [-1.347 * r, -0.778 * r],
      ]);
    case 6: {
      const l = 1.153 * r;
      const w = 0.415 * r;
      return polygon([
        [-w, -l],
        [w, -l],
        [w, -w],
        [l, -w],
        [l, w],
        [w, w],
        [w, l],
        [-w, l],
        [-w, w],
        [-l, w],
        [-l, -w],
        [-w, -w],
      ]);
    }
    default:
      return star(5, 1.462 * r, 0.5);
  }
}

function star(points: number, outer: number, innerRatio: number): string {
  const corners: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 ? outer * innerRatio : outer;
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    corners.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return polygon(corners);
}

function polygon(corners: [number, number][]): string {
  return `M${corners.map(([x, y]) => `${f(x)},${f(y)}`).join('L')}Z`;
}

function f(value: number): string {
  return String(Math.round(value * 100) / 100);
}
