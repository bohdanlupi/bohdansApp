import { bounds, type Point, pointInPolygon, polygonArea } from "./geometry";
import type { BuildingFloor, BuildingModel, BuildingRoom, PlanInfo } from "./schema";

// Storeys on top of each other: every plan has its own pixel frame, so rooms are brought into a common building frame
// (metres, north up, origin = the reference point of the plan) before the rooms above and below are found by polygon
// overlap. Slab areas follow the external dimensions: the room areas of a Geschoss are scaled so that their sum equals
// the envelope area (SIA 380 Aussenmasse); without an envelope the inner areas are used as they are.

/** Snapshot px → building metres (x east, y south), rotated so that north points up. */
export function toBuilding(plan: PlanInfo, p: Point): Point {
  const scale = plan.scale ?? 1;
  const dx = (p[0] - plan.originX) * scale;
  const dy = (p[1] - plan.originY) * scale;
  // angleDeg of «north» on the snapshot is plan.north; rotate so that it becomes -90° (up).
  const rot = ((-90 - (plan.north ?? -90)) * Math.PI) / 180;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [dx * c - dy * s, dx * s + dy * c];
}

export const buildingPolygon = (room: BuildingRoom, plan: PlanInfo): Point[] => room.polygon.map((p) => toBuilding(plan, p));

/** Overlap area [m²] of two polygons in building metres, by grid sampling (≤ ~20 000 cells, ≥ 5 cm). */
export function overlapArea(a: Point[], b: Point[]): number {
  const ba = bounds(a);
  const bb = bounds(b);
  if (!ba || !bb) return 0;
  const x0 = Math.max(ba[0], bb[0]);
  const y0 = Math.max(ba[1], bb[1]);
  const x1 = Math.min(ba[2], bb[2]);
  const y1 = Math.min(ba[3], bb[3]);
  if (x1 <= x0 || y1 <= y0) return 0;
  const cell = Math.max(0.05, Math.sqrt(((x1 - x0) * (y1 - y0)) / 20000));
  let hits = 0;
  for (let y = y0 + cell / 2; y < y1; y += cell) {
    for (let x = x0 + cell / 2; x < x1; x += cell) {
      const p: Point = [x, y];
      if (pointInPolygon(p, a) && pointInPolygon(p, b)) hits++;
    }
  }
  return hits * cell * cell;
}

export type SlabPart = {
  /** Room on the other side, or null for the remainder (nothing drawn there). */
  otherRoomId: string | null;
  /** Area [m²], external dimensions. */
  area: number;
};

export type RoomStack = {
  room: BuildingRoom;
  floor: BuildingFloor;
  /** Net area [m²] from the polygon and the external-dimension area (× factor of the Geschoss). */
  area: number;
  areaExt: number;
  below: SlabPart[];
  above: SlabPart[];
};

export type FloorStack = {
  floor: BuildingFloor;
  plan: PlanInfo | null;
  /** Σ room areas and the envelope area [m²]; factor = envelope / rooms (1 without envelope). */
  roomsArea: number;
  envelopeArea: number | null;
  factor: number;
};

/** Rooms of every Geschoss with the rooms below and above them (by overlap in the building frame). */
export function stackRooms(model: BuildingModel, plans: PlanInfo[]): { rooms: Map<string, RoomStack>; floors: FloorStack[] } {
  const sorted = [...model.floors].sort((a, b) => a.level - b.level);
  const planOf = (floor: BuildingFloor) => plans.find((p) => p.floor === floor.key) ?? null;
  const floors: FloorStack[] = sorted.map((floor) => {
    const plan = planOf(floor);
    const scale = plan?.scale ?? null;
    const rooms = model.rooms.filter((r) => r.floor === floor.key);
    const roomsArea = scale ? rooms.reduce((s, r) => s + polygonArea(r.polygon) * scale * scale, 0) : 0;
    const envelope = model.envelopes.find((e) => e.floor === floor.key);
    const envelopeArea = scale && envelope && envelope.vertices.length >= 3 ? polygonArea(envelope.vertices.map((v) => v.p)) * scale * scale : null;
    const factor = envelopeArea && roomsArea > 0 ? Math.max(1, envelopeArea / roomsArea) : 1;
    return { floor, plan, roomsArea, envelopeArea, factor };
  });

  const result = new Map<string, RoomStack>();
  const polygons = new Map<string, Point[]>();
  for (const f of floors) {
    if (!f.plan?.scale) continue;
    for (const room of model.rooms.filter((r) => r.floor === f.floor.key)) polygons.set(room.id, buildingPolygon(room, f.plan));
  }

  floors.forEach((f, index) => {
    if (!f.plan?.scale) return;
    const scale = f.plan.scale;
    const lower = floors[index - 1];
    const upper = floors[index + 1];
    for (const room of model.rooms.filter((r) => r.floor === f.floor.key)) {
      const area = polygonArea(room.polygon) * scale * scale;
      const areaExt = area * f.factor;
      const poly = polygons.get(room.id)!;
      const parts = (neighbour: FloorStack | undefined): SlabPart[] => {
        if (!neighbour?.plan?.scale) return [{ otherRoomId: null, area: areaExt }];
        const found: SlabPart[] = [];
        let covered = 0;
        for (const other of model.rooms.filter((r) => r.floor === neighbour.floor.key)) {
          const ov = overlapArea(poly, polygons.get(other.id)!);
          if (ov < 0.05) continue;
          const a = Math.min(ov * f.factor, areaExt - covered);
          if (a <= 0) break;
          found.push({ otherRoomId: other.id, area: a });
          covered += a;
        }
        // Sampling residue (< 1 % or 0.5 m²) goes to the largest overlap instead of becoming a sliver «remainder».
        const rest = areaExt - covered;
        if (rest > 0.05) {
          const largest = found.reduce<SlabPart | null>((best, p) => (best && best.area >= p.area ? best : p), null);
          if (largest && rest <= Math.max(0.5, areaExt * 0.01)) largest.area += rest;
          else found.push({ otherRoomId: null, area: rest });
        }
        return found;
      };
      result.set(room.id, { room, floor: f.floor, area, areaExt, below: parts(lower), above: parts(upper) });
    }
  });
  return { rooms: result, floors };
}
