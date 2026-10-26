import { bearingDeg, distance, type Point, pointInPolygon, polygonCentroid } from "./geometry";
import {
  type BuildingEnvelope,
  type BuildingFloor,
  type BuildingRoom,
  DEFAULT_DOOR_HEIGHT,
  DEFAULT_WALL_THICKNESS,
  DEFAULT_WINDOW_HEIGHT,
  type EnvelopeVertex,
  type Opening,
  type PlanInfo,
} from "./schema";

// Thermal envelope of a Geschoss: the outer polygon drawn along the external face. Each segment is matched to the rooms
// whose inner wall faces run parallel behind it within the wall thickness (option B of the plan). The matches give the
// external wall areas per room (SIA 380 Aussenmasse) for SIA 384/2 and, later, SIA 380/1.

/** The eight orientations of SIA 384/2 (clockwise from north). */
export const orientations8 = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"] as const;

export const orientationOf = (bearing: number) => orientations8[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];

/** Part of a segment that lies in front of a room (fractions of the segment length). */
export type SegmentMatch = { roomId: string; fromT: number; toT: number; length: number | null };

export type OpeningEval = {
  opening: Opening;
  /** Room behind the opening (by its centre), if matched. */
  roomId: string | null;
  height: number;
  /** Area of all leaves [m²] (null without width). */
  area: number | null;
  /** Extent along the segment as fractions (for drawing). */
  fromT: number;
  toT: number;
};

export type SegmentEval = {
  vertex: EnvelopeVertex;
  index: number;
  from: Point;
  to: Point;
  lengthPx: number;
  /** Length [m]; null without a calibrated plan. */
  length: number | null;
  /** Outward normal (unit vector in plan coordinates). */
  outward: Point;
  /** Compass bearing of the outward normal, null without north. */
  bearing: number | null;
  /** Orientation used for the elements (override or from the bearing); null when neither is known. */
  orientation: string | null;
  matches: SegmentMatch[];
  /** Length not in front of any room [m]. */
  uncovered: number | null;
  openings: OpeningEval[];
};

const PARALLEL_SIN = Math.sin((12 * Math.PI) / 180);
const MIN_OVERLAP_M = 0.1;

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];

/** Union length of [from, to] intervals (fractions). */
function coveredFraction(parts: { fromT: number; toT: number }[]): number {
  const sorted = parts.map((p) => [Math.min(p.fromT, p.toT), Math.max(p.fromT, p.toT)] as const).sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const [a, b] of sorted) {
    if (!cur || a > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [a, b];
    } else cur[1] = Math.max(cur[1], b);
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}

/**
 * Edges of the rooms that run parallel behind the segment A→B within `tolPx` (measured along the inward normal), as
 * fractions of the segment they cover.
 */
function matchRooms(a: Point, b: Point, inward: Point, lenPx: number, rooms: BuildingRoom[], tolPx: number, scale: number | null): SegmentMatch[] {
  const dir: Point = [(b[0] - a[0]) / lenPx, (b[1] - a[1]) / lenPx];
  const matches: SegmentMatch[] = [];
  for (const room of rooms) {
    const poly = room.polygon;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const edgeLen = distance(p, q);
      if (edgeLen < 1e-6) continue;
      const e: Point = [(q[0] - p[0]) / edgeLen, (q[1] - p[1]) / edgeLen];
      const cross = Math.abs(dir[0] * e[1] - dir[1] * e[0]);
      if (cross > PARALLEL_SIN) continue;
      const dP = dot(sub(p, a), inward);
      const dQ = dot(sub(q, a), inward);
      // Behind the facade (inside), not further than the wall thickness. Vertices slightly outside are tolerated.
      if (Math.min(dP, dQ) < -tolPx * 0.25 || Math.max(dP, dQ) > tolPx * 1.1) continue;
      const tP = dot(sub(p, a), dir) / lenPx;
      const tQ = dot(sub(q, a), dir) / lenPx;
      const fromT = Math.max(0, Math.min(tP, tQ));
      const toT = Math.min(1, Math.max(tP, tQ));
      if (toT <= fromT) continue;
      const lengthM = scale ? (toT - fromT) * lenPx * scale : null;
      if (lengthM !== null && lengthM < MIN_OVERLAP_M) continue;
      matches.push({ roomId: room.id, fromT, toT, length: lengthM });
    }
  }
  return matches;
}

/**
 * Aussenmasse (SIA 380): the inner wall faces stop short of the facade corners and leave a gap at interior partitions.
 * Gaps up to `maxGapT` (two wall thicknesses, as fractions) are given to the adjacent rooms – corners to the room
 * beside them, partitions half / half. Larger gaps stay uncovered (e.g. an undrawn room).
 */
function extendToExternal(matches: SegmentMatch[], maxGapT: number, lengthM: number): SegmentMatch[] {
  if (!matches.length) return matches;
  const sorted = matches.map((m) => ({ ...m })).sort((a, b) => a.fromT - b.fromT);
  if (sorted[0].fromT <= maxGapT) sorted[0].fromT = 0;
  const last = sorted[sorted.length - 1];
  if (1 - last.toT <= maxGapT) last.toT = 1;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const gap = b.fromT - a.toT;
    if (gap > 0 && gap <= maxGapT) {
      const mid = (a.toT + b.fromT) / 2;
      a.toT = mid;
      b.fromT = mid;
    }
  }
  return sorted.map((m) => ({ ...m, length: (m.toT - m.fromT) * lengthM }));
}

export function openingHeight(opening: Opening, floor: BuildingFloor | null): number {
  if (opening.height !== null) return opening.height;
  return opening.kind === "door" ? DEFAULT_DOOR_HEIGHT : (floor?.windowHeight ?? DEFAULT_WINDOW_HEIGHT);
}

export function evaluateEnvelope(envelope: BuildingEnvelope | null, rooms: BuildingRoom[], floor: BuildingFloor | null, plan: PlanInfo | null): SegmentEval[] {
  if (!envelope || envelope.vertices.length < 3) return [];
  const polygon = envelope.vertices.map((v) => v.p);
  const scale = plan?.scale ?? null;
  const floorRooms = rooms.filter((r) => r.floor === envelope.floor);
  return envelope.vertices.map((vertex, index) => {
    const from = vertex.p;
    const to = envelope.vertices[(index + 1) % envelope.vertices.length].p;
    const lengthPx = distance(from, to);
    const length = scale ? lengthPx * scale : null;
    // Inward normal: the candidate pointing into the polygon at the segment's midpoint.
    const mid: Point = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
    const cand: Point = lengthPx > 0 ? [-(to[1] - from[1]) / lengthPx, (to[0] - from[0]) / lengthPx] : [0, 0];
    const probe: Point = [mid[0] + cand[0] * Math.max(lengthPx * 0.01, 0.5), mid[1] + cand[1] * Math.max(lengthPx * 0.01, 0.5)];
    const inward: Point = pointInPolygon(probe, polygon) ? cand : [-cand[0], -cand[1]];
    const outward: Point = [-inward[0], -inward[1]];
    const bearing = plan?.north === null || plan?.north === undefined || lengthPx === 0 ? null : bearingDeg([0, 0], outward, plan.north);
    const orientation = vertex.orientation ?? (bearing === null ? null : orientationOf(bearing));
    const tolM = vertex.tolerance ?? floor?.wallThickness ?? DEFAULT_WALL_THICKNESS;
    const matches = scale && lengthPx > 0 ? extendToExternal(matchRooms(from, to, inward, lengthPx, floorRooms, tolM / scale, scale), (2 * tolM) / (lengthPx * scale), lengthPx * scale) : [];
    const uncovered = length === null ? null : Math.max(0, length * (1 - coveredFraction(matches)));
    const openings: OpeningEval[] = vertex.openings.map((o) => {
      const extent = length && o.width ? o.width / length : 0;
      const fromT = Math.min(1, Math.max(0, o.at));
      const toT = Math.min(1, fromT + extent);
      const centre = (fromT + toT) / 2;
      const match = matches.find((m) => centre >= m.fromT && centre <= m.toT) ?? null;
      const height = openingHeight(o, floor);
      return { opening: o, roomId: match?.roomId ?? null, height, area: o.width === null ? null : o.width * height * (o.count ?? 1), fromT, toT };
    });
    return { vertex, index, from, to, lengthPx, length, outward, bearing, orientation, matches, uncovered, openings };
  });
}

/** Nearest segment to `p` within `radiusPx`, with the fraction along it. */
export function nearestSegment(segments: SegmentEval[], p: Point, radiusPx: number): { segment: SegmentEval; t: number } | null {
  let best: { segment: SegmentEval; t: number; d: number } | null = null;
  for (const s of segments) {
    if (s.lengthPx === 0) continue;
    const dir: Point = [(s.to[0] - s.from[0]) / s.lengthPx, (s.to[1] - s.from[1]) / s.lengthPx];
    const t = Math.min(1, Math.max(0, dot(sub(p, s.from), dir) / s.lengthPx));
    const q: Point = [s.from[0] + dir[0] * t * s.lengthPx, s.from[1] + dir[1] * t * s.lengthPx];
    const d = distance(p, q);
    if (d <= radiusPx && (!best || d < best.d)) best = { segment: s, t, d };
  }
  return best ? { segment: best.segment, t: best.t } : null;
}

/** Point on a segment at fraction t. */
export const pointAt = (s: SegmentEval, t: number): Point => [s.from[0] + (s.to[0] - s.from[0]) * t, s.from[1] + (s.to[1] - s.from[1]) * t];

/** Interior partition: coincident parallel edges of two rooms (within `tolM`), as length [m]. */
export type Partition = { roomA: string; roomB: string; edgeA: number; length: number; bearing: number | null };

export function findPartitions(rooms: BuildingRoom[], plan: PlanInfo | null, tolM = 0.4): Partition[] {
  const scale = plan?.scale ?? null;
  if (!scale) return [];
  const tolPx = tolM / scale;
  const out: Partition[] = [];
  for (let ia = 0; ia < rooms.length; ia++) {
    const ra = rooms[ia];
    for (let i = 0; i < ra.polygon.length; i++) {
      const a = ra.polygon[i];
      const b = ra.polygon[(i + 1) % ra.polygon.length];
      const lenPx = distance(a, b);
      if (lenPx < 1e-6) continue;
      const dir: Point = [(b[0] - a[0]) / lenPx, (b[1] - a[1]) / lenPx];
      // Normal pointing out of room A (away from its centroid), so the bearing is the facing of A's partition.
      const cand: Point = [-dir[1], dir[0]];
      const centroid = polygonCentroid(ra.polygon);
      const normal: Point = dot(sub(centroid, a), cand) > 0 ? [-cand[0], -cand[1]] : cand;
      for (let ib = 0; ib < rooms.length; ib++) {
        if (ib === ia) continue;
        const rb = rooms[ib];
        for (let j = 0; j < rb.polygon.length; j++) {
          const p = rb.polygon[j];
          const q = rb.polygon[(j + 1) % rb.polygon.length];
          const el = distance(p, q);
          if (el < 1e-6) continue;
          const e: Point = [(q[0] - p[0]) / el, (q[1] - p[1]) / el];
          if (Math.abs(dir[0] * e[1] - dir[1] * e[0]) > PARALLEL_SIN) continue;
          const dP = Math.abs(dot(sub(p, a), normal));
          const dQ = Math.abs(dot(sub(q, a), normal));
          if (Math.max(dP, dQ) > tolPx) continue;
          const tP = dot(sub(p, a), dir) / lenPx;
          const tQ = dot(sub(q, a), dir) / lenPx;
          const fromT = Math.max(0, Math.min(tP, tQ));
          const toT = Math.min(1, Math.max(tP, tQ));
          const length = (toT - fromT) * lenPx * scale;
          if (length < MIN_OVERLAP_M) continue;
          // Each pair once: keep the half where A's edge is the reference; B's own edge finds the same partition later,
          // so only report when A sorts before B or A is listed first.
          if (ia > ib) continue;
          const bearing = plan?.north === null || plan?.north === undefined ? null : bearingDeg([0, 0], normal, plan.north);
          out.push({ roomA: ra.id, roomB: rb.id, edgeA: i, length, bearing });
        }
      }
    }
  }
  return out;
}
