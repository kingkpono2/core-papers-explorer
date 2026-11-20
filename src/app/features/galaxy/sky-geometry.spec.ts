import { Point, centroid, nearestInDirection, placeLabels } from './sky-geometry';

describe('nearestInDirection', () => {
  //        1
  //   3    0    2
  //        4         5
  const points: Point[] = [
    { x: 100, y: 100 },
    { x: 100, y: 40 },
    { x: 180, y: 100 },
    { x: 20, y: 95 },
    { x: 105, y: 160 },
    { x: 260, y: 170 },
  ];

  it('moves to the closest star straight ahead in each direction', () => {
    expect(nearestInDirection(points, 0, 'up')).toBe(1);
    expect(nearestInDirection(points, 0, 'right')).toBe(2);
    expect(nearestInDirection(points, 0, 'left')).toBe(3);
    expect(nearestInDirection(points, 0, 'down')).toBe(4);
  });

  it('falls back to anything on that side, and stays put when there is nothing', () => {
    expect(nearestInDirection(points, 4, 'right')).toBe(5);
    expect(nearestInDirection(points, 1, 'up')).toBeNull();
  });

  it('only moves to stars that are allowed, such as those of the highlighted topic', () => {
    expect(nearestInDirection(points, 0, 'right', (i) => i !== 2)).toBe(5);
  });
});

describe('placeLabels', () => {
  const sky = { width: 400, height: 300 };
  const cluster = (cx: number, cy: number): Point[] => [
    { x: cx - 10, y: cy },
    { x: cx + 10, y: cy },
    { x: cx, y: cy + 10 },
  ];

  it('puts a name near its topic’s centre, off its stars', () => {
    const members = cluster(200, 150);
    const stars = members.map((p) => ({ ...p, r: 5 }));
    const [label] = placeLabels([{ members, width: 80, height: 20 }], stars, sky);

    expect(label.shown).toBeTrue();
    expect(Math.hypot(label.x - 200, label.y - 153)).toBeLessThan(70);
    for (const star of stars) {
      const inside =
        Math.abs(star.x - label.x) < 40 + star.r && Math.abs(star.y - label.y) < 10 + star.r;
      expect(inside).toBeFalse();
    }
  });

  it('never lets two names overlap, nor cover the year counter, and drops one with no room', () => {
    const requests = [
      { members: cluster(60, 40), width: 120, height: 20 },
      { members: cluster(70, 45), width: 120, height: 20 },
    ];
    const counter = { x: 0, y: 0, width: 132, height: 60 };
    const placed = placeLabels(requests, [], sky, [counter]);
    const [a, b] = placed;

    expect(a.shown && b.shown).toBeTrue();
    expect(Math.abs(a.y - b.y) >= 20 || Math.abs(a.x - b.x) >= 120).toBeTrue();
    for (const label of placed) {
      expect(label.y - 10 >= 60 || label.x - 60 >= 132).toBeTrue();
    }

    const tiny = placeLabels([{ members: cluster(20, 20), width: 300, height: 20 }], [], {
      width: 200,
      height: 40,
    });
    expect(tiny[0].shown).toBeFalse();
  });

  it('finds the centre of a set of points', () => {
    const centre = centroid(cluster(50, 20));

    expect(centre.x).toBe(50);
    expect(centre.y).toBeCloseTo(70 / 3, 10);
    expect(centroid([])).toEqual({ x: 0, y: 0 });
  });
});
