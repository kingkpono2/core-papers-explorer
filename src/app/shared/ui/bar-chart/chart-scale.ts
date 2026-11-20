/**
 * Evenly spaced axis ticks from zero, at a step of 1, 2 or 5 times a power of ten, with about
 * `target` intervals and the last tick at or above `max`.
 */
export function niceTicks(max: number, target = 4): number[] {
  if (!(max > 0)) {
    return [0, 1];
  }
  const rough = max / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, ([1, 2, 5, 10].find((m) => m * magnitude >= rough) ?? 10) * magnitude);
  const ticks: number[] = [];
  for (let value = 0; value < max + step; value += step) {
    ticks.push(value);
  }
  return ticks;
}

/**
 * Show every nth label so that labels `labelWidth` wide fit in `available` pixels, with n from a
 * small set of round numbers so years land on 2020, 2025 and so on.
 */
export function labelStep(count: number, available: number, labelWidth: number): number {
  const fits = Math.max(1, Math.floor(available / labelWidth));
  return [1, 2, 5, 10, 20, 50, 100].find((step) => Math.ceil(count / step) <= fits) ?? count;
}

/** A bar growing up from the baseline, with rounded top corners and a square base. */
export function barPath(x: number, y: number, width: number, height: number, radius = 4): string {
  if (height <= 0 || width <= 0) {
    return '';
  }
  const r = Math.min(radius, width / 2, height);
  const bottom = y + height;
  return [
    `M${x},${bottom}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + width - r}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `V${bottom}`,
    'Z',
  ].join('');
}
