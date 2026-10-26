// Plane geometry of the building model. Points are [x, y] in the pixel coordinates of a plan snapshot (y down);
// the plan's scale [m/px] turns lengths into metres and areas into square metres.

export type Point = readonly [number, number];

/** Polygon area in px² (shoelace). */
export function polygonArea(points: readonly Point[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

export function polygonPerimeter(points: readonly Point[]): number {
  if (points.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) sum += distance(points[i], points[(i + 1) % points.length]);
  return sum;
}

export const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Centroid of a polygon (the vertex mean for degenerate ones). */
export function polygonCentroid(points: readonly Point[]): Point {
  const mean = (): Point => {
    const n = points.length || 1;
    return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
  };
  if (points.length < 3) return mean();
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    const cross = x1 * y2 - x2 * y1;
    a += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(a) < 1e-9) return mean();
  return [cx / (3 * a), cy / (3 * a)];
}

export function pointInPolygon([x, y]: Point, points: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Bounding box [minX, minY, maxX, maxY]. */
export function bounds(points: readonly Point[]): [number, number, number, number] | null {
  if (!points.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return [minX, minY, maxX, maxY];
}

/** Nearest of the candidate points within `radius`, or null. */
export function snapToPoints(p: Point, candidates: readonly Point[], radius: number): Point | null {
  let best: Point | null = null;
  let bestD = radius;
  for (const c of candidates) {
    const d = distance(p, c);
    if (d <= bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Constrains `p` to the horizontal or vertical through `from` (whichever is closer). */
export function snapOrthogonal(from: Point, p: Point): Point {
  return Math.abs(p[0] - from[0]) >= Math.abs(p[1] - from[1]) ? [p[0], from[1]] : [from[0], p[1]];
}

/** Angle of a plan vector in degrees, clockwise from +x of the snapshot (y down). */
export const angleDeg = (from: Point, to: Point) => (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;

/** Compass bearing (0 = N, 90 = E) of a plan vector given the plan's north angle (angleDeg of a vector pointing north). */
export function bearingDeg(from: Point, to: Point, northDeg: number): number {
  return ((((angleDeg(from, to) - northDeg) % 360) + 360) % 360);
}

export const round = (value: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};
