import { polygonArea, polygonCentroid, polygonPerimeter } from "./geometry";
import type { BuildingFloor, BuildingModel, BuildingRoom, PlanInfo } from "./schema";

// Derived values of the building model: room metrics in metres from the polygon and the plan scale.

export type RoomMetrics = {
  room: BuildingRoom;
  floor: BuildingFloor | null;
  /** Net floor area [m²]; null without a calibrated plan. */
  area: number | null;
  perimeter: number | null;
  /** Lichte Höhe [m]: the room's own or the Geschoss default. */
  height: number | null;
  volume: number | null;
  centroid: [number, number];
};

export function roomMetrics(room: BuildingRoom, floor: BuildingFloor | null, plan: PlanInfo | null): RoomMetrics {
  const scale = plan?.scale ?? null;
  const area = scale && room.polygon.length >= 3 ? polygonArea(room.polygon) * scale * scale : null;
  const perimeter = scale && room.polygon.length >= 2 ? polygonPerimeter(room.polygon) * scale : null;
  const height = room.height ?? floor?.height ?? null;
  const volume = area !== null && height !== null ? area * height : null;
  const c = polygonCentroid(room.polygon);
  return { room, floor, area, perimeter, height, volume, centroid: [c[0], c[1]] };
}

export type FloorSummary = {
  floor: BuildingFloor;
  plan: PlanInfo | null;
  rooms: RoomMetrics[];
  /** Σ area of the heated rooms [m²] (null when a room is not measurable). */
  heatedArea: number | null;
  roomCount: number;
};

export function summarizeFloors(model: BuildingModel, plans: PlanInfo[]): FloorSummary[] {
  return [...model.floors]
    .sort((a, b) => b.level - a.level)
    .map((floor) => {
      const plan = plans.find((p) => p.floor === floor.key) ?? null;
      const rooms = model.rooms.filter((r) => r.floor === floor.key).map((r) => roomMetrics(r, floor, plan));
      const heated = rooms.filter((r) => r.room.kind === "heated");
      const heatedArea = heated.length && heated.every((r) => r.area !== null) ? heated.reduce((s, r) => s + (r.area ?? 0), 0) : heated.length ? null : 0;
      return { floor, plan, rooms, heatedArea, roomCount: rooms.length };
    });
}

/** Rooms of the whole model with their metrics, in floor order (top down) then by number. */
export function allRoomMetrics(model: BuildingModel, plans: PlanInfo[]): RoomMetrics[] {
  return summarizeFloors(model, plans).flatMap((f) => [...f.rooms].sort((a, b) => a.room.number.localeCompare(b.room.number, "de-CH", { numeric: true })));
}

/** Next room number on a Geschoss: increments the trailing digits of the last number (E09 → E10). */
export function nextRoomNumber(rooms: readonly BuildingRoom[], floor: BuildingFloor | null): string {
  const own = rooms.filter((r) => r.floor === floor?.key);
  const last = own.at(-1)?.number ?? "";
  const match = /^(.*?)(\d+)$/.exec(last);
  if (match) return match[1] + String(Number(match[2]) + 1).padStart(match[2].length, "0");
  // No numbered room yet: <level><nn>, e.g. 001 (EG), 101 (1. OG), U01 (UG).
  const prefix = !floor ? "" : floor.level < 0 ? "U" : String(floor.level);
  return `${prefix}${String(own.length + 1).padStart(2, "0")}`;
}
