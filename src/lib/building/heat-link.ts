import type { HeatLoadData, HeatRoom, RoomElement, Table4Case } from "@/lib/heating/heat-load";

import { evaluateEnvelope, findPartitions, orientationOf } from "./envelope";
import type { RoomMetrics } from "./model";
import { type BuildingModel, type EnvelopeAdjacency, type PlanInfo, storeyHeightOf, type UnheatedCase } from "./schema";
import { stackRooms } from "./stack";

// Link between the Gebäudemodell and the SIA 384/2 heat load: rooms of a calculation can be taken from the model
// (HeatRoom.modelRoomId). Geometry wins – number, name, Geschoss, area, height, kind and θi of linked rooms follow the
// model, and their derived elements (external walls, openings, partitions, floors, ceilings; RoomElement.sourceId) are
// regenerated from the envelope and the storey stack on every load. Elements entered by hand (sourceId null) and the
// other heat load fields are kept. The same derived elements feed the SIA 380/1 balance (sia3801.ts).

export type DerivedKind = "wall" | "window" | "door" | "partition" | "floor" | "ceiling";

/** Element derived from the model, before it knows the heat load ids of neighbouring rooms. */
export type DerivedElement = {
  sourceId: string;
  kind: DerivedKind;
  constructionId: string | null;
  adjacency: RoomElement["adjacency"];
  /** N, NO, … or H (horizontal); "" when unknown. */
  orientation: string;
  /** Area [m²] = width × height × count − deduction. Width = wall / partition length or opening width [m]. */
  width: number;
  height: number;
  count: number;
  /** Area of the openings in a wall [m²]. */
  deduction: number;
  /** Partition / slab: the model room on the other side. */
  neighbourModelRoomId: string | null;
  /** Unheated beyond: Tabelle 17 case for SIA 380/1. */
  unheatedCase: UnheatedCase;
  unheatedInsulated: boolean;
  /** Windows: shading angles [°]. */
  shading: { horizon: number; overhang: number; finLeft: number; finRight: number } | null;
};

export const derivedArea = (e: DerivedElement) => Math.max(0, e.width * e.height * e.count - e.deduction);

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
  const floorsByKey = new Map(model.floors.map((f) => [f.key, f]));
  const noShading = null;
  const differs = (a: { kind: string; thetaInt: number | null }, b: { kind: string; thetaInt: number | null }) => a.kind !== b.kind || (a.thetaInt ?? 20) !== (b.thetaInt ?? 20);

  for (const floor of model.floors) {
    const plan = plans.find((p) => p.floor === floor.key) ?? null;
    const storey = storeyHeightOf(floor);
    const rooms = model.rooms.filter((r) => r.floor === floor.key);
    const envelope = model.envelopes.find((e) => e.floor === floor.key) ?? null;
    if (!plan?.scale || storey === null) continue;

    for (const s of evaluateEnvelope(envelope, rooms, floor, plan)) {
      const orientation = s.orientation ?? "";
      const v = s.vertex;
      s.matches.forEach((m, i) => {
        if (m.length === null) return;
        const openings = s.openings.filter((o) => o.roomId === m.roomId);
        add(m.roomId, {
          sourceId: `w:${v.id}:${m.roomId}:${i}`,
          kind: "wall",
          constructionId: v.constructionId,
          adjacency: v.adjacency,
          orientation,
          width: r2(m.length),
          height: r2(storey),
          count: 1,
          deduction: r2(openings.reduce((sum, o) => sum + (o.area ?? 0), 0)),
          neighbourModelRoomId: null,
          unheatedCase: v.unheatedCase,
          unheatedInsulated: v.unheatedInsulated,
          shading: noShading,
        });
      });
      for (const o of s.openings) {
        if (!o.roomId || o.opening.width === null) continue;
        add(o.roomId, {
          sourceId: `o:${o.opening.id}`,
          kind: o.opening.kind,
          constructionId: o.opening.constructionId,
          adjacency: v.adjacency,
          orientation,
          width: r2(o.opening.width),
          height: r2(o.height),
          count: o.opening.count ?? 1,
          deduction: 0,
          neighbourModelRoomId: null,
          unheatedCase: v.unheatedCase,
          unheatedInsulated: v.unheatedInsulated,
          shading: o.opening.kind === "window" ? { horizon: o.opening.horizon ?? 0, overhang: o.opening.overhang ?? 0, finLeft: o.opening.finLeft ?? 0, finRight: o.opening.finRight ?? 0 } : null,
        });
      }
    }

    // Partitions: only where heat flows – towards passive rooms or heated rooms at another temperature.
    for (const p of findPartitions(rooms, plan, floor.wallThickness ?? 0.4)) {
      const a = roomsById.get(p.roomA);
      const b = roomsById.get(p.roomB);
      if (!a || !b || !differs(a, b)) continue;
      for (const [room, other, flip] of [
        [a, b, false],
        [b, a, true],
      ] as const) {
        add(room.id, {
          sourceId: `p:${p.roomA}:${p.roomB}:${p.edgeA}:${flip ? "b" : "a"}`,
          kind: "partition",
          constructionId: floor.partitionConstructionId,
          adjacency: "heated",
          orientation: p.bearing === null ? "" : orientationOf(flip ? p.bearing + 180 : p.bearing),
          width: r2(p.length),
          height: r2(storey),
          count: 1,
          deduction: 0,
          neighbourModelRoomId: other.id,
          unheatedCase: other.unheatedCase,
          unheatedInsulated: other.unheatedInsulated,
          shading: noShading,
        });
      }
    }
  }

  // Floors and ceilings from the storey stack: parts above other rooms (slab, only where heat flows) and the remainder.
  const stack = stackRooms(model, plans);
  for (const rs of stack.rooms.values()) {
    const floor = floorsByKey.get(rs.room.floor);
    if (!floor) continue;
    const slab = (side: "floor" | "ceiling", parts: typeof rs.below) => {
      const kind = side;
      for (const part of parts) {
        if (part.area < 0.05) continue;
        if (part.otherRoomId) {
          const other = roomsById.get(part.otherRoomId);
          if (!other || !differs(rs.room, other)) continue;
          add(rs.room.id, {
            sourceId: `${kind[0]}:${rs.room.id}:${other.id}`,
            kind,
            constructionId: floor.slabConstructionId,
            adjacency: "heated",
            orientation: "H",
            width: r2(part.area),
            height: 1,
            count: 1,
            deduction: 0,
            neighbourModelRoomId: other.id,
            unheatedCase: other.unheatedCase,
            unheatedInsulated: other.unheatedInsulated,
            shading: noShading,
          });
        } else {
          const adjacency: EnvelopeAdjacency = side === "floor" ? floor.floorAdjacency : floor.ceilingAdjacency;
          add(rs.room.id, {
            sourceId: `${kind[0]}:${rs.room.id}:ext`,
            kind,
            constructionId: side === "floor" ? floor.floorConstructionId : floor.ceilingConstructionId,
            adjacency,
            orientation: "H",
            width: r2(part.area),
            height: 1,
            count: 1,
            deduction: 0,
            neighbourModelRoomId: null,
            unheatedCase: side === "floor" ? floor.floorUnheatedCase : floor.ceilingUnheatedCase,
            unheatedInsulated: side === "floor" ? floor.floorUnheatedInsulated : floor.ceilingUnheatedInsulated,
            shading: noShading,
          });
        }
      }
    };
    slab("floor", rs.below);
    slab("ceiling", rs.above);
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

/** Tabelle 17 case of the model → Tabelle 4 case of SIA 384/2 for the default neighbour temperature. */
const table4Of: Record<UnheatedCase, Table4Case> = { attic: "attic", cellarBelow: "cellar1", cellarAbove: "cellar2", annex: "side1", glazed: "side1" };

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
    const toRoom = d.neighbourModelRoomId !== null;
    return {
      ...old,
      constructionId: d.constructionId,
      orientation: d.orientation,
      adjacency: d.adjacency,
      width: d.kind === "floor" || d.kind === "ceiling" ? null : d.width,
      length: d.kind === "floor" || d.kind === "ceiling" ? null : d.height,
      count: d.count === 1 ? null : d.count,
      deduction: d.deduction || null,
      areaOverride: d.kind === "floor" || d.kind === "ceiling" ? d.width : null,
      neighbourMode: toRoom ? (neighbour ? "room" : "temperature") : d.adjacency === "unheated" ? (old.neighbourMode === "temperature" && old.neighbourTemp === null ? "table4" : old.neighbourMode) : old.neighbourMode,
      table4: d.adjacency === "unheated" && !toRoom && old.neighbourMode !== "table4" ? table4Of[d.unheatedCase] : old.table4,
      neighbourRoomId: neighbour?.id ?? null,
      neighbourTemp: toRoom && !neighbour ? (neighbourModel?.kind === "heated" ? neighbourModel.thetaInt : null) : old.neighbourTemp,
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
