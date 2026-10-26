import type { HeatLoadData, HeatRoom, RoomElement } from "@/lib/heating/heat-load";

import { evaluateEnvelope, findPartitions, orientationOf } from "./envelope";
import type { RoomMetrics } from "./model";
import { type BuildingModel, type PlanInfo, storeyHeightOf } from "./schema";

// Link between the Gebäudemodell and the SIA 384/2 heat load: rooms of a calculation can be taken from the model
// (HeatRoom.modelRoomId). Geometry wins – number, name, Geschoss, area, height, kind and θi of linked rooms follow the
// model, and their derived elements (external walls, openings, partitions; RoomElement.sourceId) are regenerated from
// the envelope on every load. Elements entered by hand (sourceId null) and the other heat load fields are kept.

/** Element derived from the model, before it knows the heat load ids of neighbouring rooms. */
export type DerivedElement = {
  sourceId: string;
  kind: "wall" | "window" | "door" | "partition";
  constructionId: string | null;
  adjacency: RoomElement["adjacency"];
  orientation: string;
  /** Width [m] (wall / partition length, opening width) and height [m]. */
  width: number;
  height: number;
  count: number;
  /** Area of the openings in a wall [m²]. */
  deduction: number;
  /** Partition: the model room on the other side. */
  neighbourModelRoomId: string | null;
};

/** Room of the model as the heat load editor needs it (serialisable). */
export type ModelRoomInfo = {
  id: string;
  number: string;
  name: string;
  floorName: string;
  kind: "heated" | "passive";
  thetaInt: number | null;
  area: number | null;
  height: number | null;
  elements: DerivedElement[];
};

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Derived elements of all rooms of the model, keyed by room id. */
export function deriveElements(model: BuildingModel, plans: PlanInfo[]): Map<string, DerivedElement[]> {
  const out = new Map<string, DerivedElement[]>();
  const add = (roomId: string, e: DerivedElement) => out.set(roomId, [...(out.get(roomId) ?? []), e]);
  const roomsById = new Map(model.rooms.map((r) => [r.id, r]));

  for (const floor of model.floors) {
    const plan = plans.find((p) => p.floor === floor.key) ?? null;
    const storey = storeyHeightOf(floor);
    const rooms = model.rooms.filter((r) => r.floor === floor.key);
    const envelope = model.envelopes.find((e) => e.floor === floor.key) ?? null;
    if (!plan?.scale || storey === null) continue;

    for (const s of evaluateEnvelope(envelope, rooms, floor, plan)) {
      const orientation = s.orientation ?? "";
      s.matches.forEach((m, i) => {
        if (m.length === null) return;
        const openings = s.openings.filter((o) => o.roomId === m.roomId);
        add(m.roomId, {
          sourceId: `w:${s.vertex.id}:${m.roomId}:${i}`,
          kind: "wall",
          constructionId: s.vertex.constructionId,
          adjacency: s.vertex.adjacency,
          orientation,
          width: r2(m.length),
          height: r2(storey),
          count: 1,
          deduction: r2(openings.reduce((sum, o) => sum + (o.area ?? 0), 0)),
          neighbourModelRoomId: null,
        });
      });
      for (const o of s.openings) {
        if (!o.roomId || o.opening.width === null) continue;
        add(o.roomId, {
          sourceId: `o:${o.opening.id}`,
          kind: o.opening.kind,
          constructionId: o.opening.constructionId,
          adjacency: s.vertex.adjacency,
          orientation,
          width: r2(o.opening.width),
          height: r2(o.height),
          count: o.opening.count ?? 1,
          deduction: 0,
          neighbourModelRoomId: null,
        });
      }
    }

    // Partitions: only where heat flows – towards passive rooms or heated rooms at another temperature.
    for (const p of findPartitions(rooms, plan, floor.wallThickness ?? 0.4)) {
      const a = roomsById.get(p.roomA);
      const b = roomsById.get(p.roomB);
      if (!a || !b) continue;
      const differs = a.kind !== b.kind || (a.thetaInt ?? 20) !== (b.thetaInt ?? 20);
      if (!differs) continue;
      for (const [room, other, flip] of [
        [a, b, false],
        [b, a, true],
      ] as const) {
        add(room.id, {
          sourceId: `p:${p.roomA}:${p.roomB}:${p.edgeA}:${flip ? "b" : "a"}`,
          kind: "partition",
          constructionId: null,
          adjacency: "heated",
          orientation: p.bearing === null ? "" : orientationOf(flip ? p.bearing + 180 : p.bearing),
          width: r2(p.length),
          height: r2(storey),
          count: 1,
          deduction: 0,
          neighbourModelRoomId: other.id,
        });
      }
    }
  }
  return out;
}

export const modelRoomInfos = (rooms: RoomMetrics[], derived: Map<string, DerivedElement[]>): ModelRoomInfo[] =>
  rooms.map((m) => ({
    id: m.room.id,
    number: m.room.number,
    name: m.room.name,
    floorName: m.floor?.name ?? m.room.floor,
    kind: m.room.kind,
    thetaInt: m.room.thetaInt,
    area: m.area === null ? null : r2(m.area),
    height: m.height === null ? null : r2(m.height),
    elements: derived.get(m.room.id) ?? [],
  }));

const emptyDerived = (sourceId: string): RoomElement => ({
  id: crypto.randomUUID(),
  constructionId: null,
  orientation: "",
  adjacency: "outside",
  width: null,
  length: null,
  count: null,
  deduction: null,
  areaOverride: null,
  neighbourMode: "temperature",
  neighbourTemp: null,
  neighbourRoomId: null,
  table4: "side1",
  table4HighAirChange: false,
  height: null,
  heatedSurface: false,
  sourceId,
});

/** Derived elements of a room as RoomElements; ids and the few editable flags of existing ones are kept. */
function applyElements(room: HeatRoom, m: ModelRoomInfo, heatRoomByModel: Map<string, HeatRoom>, modelById: Map<string, ModelRoomInfo>): RoomElement[] {
  const existing = new Map(room.elements.filter((e) => e.sourceId).map((e) => [e.sourceId!, e]));
  const derived = m.elements.map((d): RoomElement => {
    const old = existing.get(d.sourceId) ?? emptyDerived(d.sourceId);
    const neighbour = d.neighbourModelRoomId ? heatRoomByModel.get(d.neighbourModelRoomId) : undefined;
    const neighbourModel = d.neighbourModelRoomId ? modelById.get(d.neighbourModelRoomId) : undefined;
    return {
      ...old,
      constructionId: d.constructionId,
      orientation: d.orientation,
      adjacency: d.adjacency,
      width: d.width,
      length: d.height,
      count: d.count === 1 ? null : d.count,
      deduction: d.deduction || null,
      areaOverride: null,
      neighbourMode: d.kind === "partition" ? (neighbour ? "room" : "temperature") : d.adjacency === "unheated" ? (old.neighbourMode === "temperature" && old.neighbourTemp === null ? "table4" : old.neighbourMode) : old.neighbourMode,
      neighbourRoomId: neighbour?.id ?? null,
      neighbourTemp: d.kind === "partition" && !neighbour ? (neighbourModel?.kind === "heated" ? neighbourModel.thetaInt : null) : old.neighbourTemp,
    };
  });
  return [...derived, ...room.elements.filter((e) => !e.sourceId)];
}

const applyModel = (room: HeatRoom, m: ModelRoomInfo): HeatRoom => ({
  ...room,
  number: m.number,
  name: m.name,
  floor: m.floorName,
  kind: m.kind,
  thetaInt: m.kind === "heated" ? (m.thetaInt ?? room.thetaInt) : room.thetaInt,
  area: m.area,
  height: m.height,
  volume: null,
});

/** Updates the linked rooms (fields and derived elements) from the model. Rooms whose model room disappeared are unlinked. */
export function syncLinkedRooms(data: HeatLoadData, model: ModelRoomInfo[]): { data: HeatLoadData; changed: boolean } {
  const byId = new Map(model.map((m) => [m.id, m]));
  const heatRoomByModel = new Map(data.rooms.filter((r) => r.modelRoomId).map((r) => [r.modelRoomId!, r]));
  let changed = false;
  const rooms = data.rooms.map((room) => {
    if (!room.modelRoomId) return room;
    const m = byId.get(room.modelRoomId);
    const next = m ? { ...applyModel(room, m), elements: applyElements(room, m, heatRoomByModel, byId) } : { ...room, modelRoomId: null, elements: room.elements.map((e) => ({ ...e, sourceId: null })) };
    if (JSON.stringify(next) !== JSON.stringify(room)) changed = true;
    return next;
  });
  return { data: changed ? { ...data, rooms } : data, changed };
}

/** Adds every model room that is not linked yet (with `template` for the heat load fields), then syncs all linked rooms. */
export function importModelRooms(data: HeatLoadData, model: ModelRoomInfo[], template: (m: ModelRoomInfo) => HeatRoom): { data: HeatLoadData; added: number } {
  const linked = new Set(data.rooms.map((r) => r.modelRoomId).filter(Boolean));
  const missing = model.filter((m) => !linked.has(m.id));
  if (!missing.length) return { data, added: 0 };
  const rooms = [...data.rooms, ...missing.map((m) => ({ ...template(m), modelRoomId: m.id }))];
  return { data: syncLinkedRooms({ ...data, rooms }, model).data, added: missing.length };
}
