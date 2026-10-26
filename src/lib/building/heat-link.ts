import type { HeatLoadData, HeatRoom } from "@/lib/heating/heat-load";

import type { RoomMetrics } from "./model";

// Link between the Gebäudemodell and the SIA 384/2 heat load: rooms of a calculation can be taken from the model
// (HeatRoom.modelRoomId). Geometry wins – number, name, Geschoss, area, height, kind and θi of linked rooms follow the
// model; the heat load keeps everything else (room type, emission, elements …).

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
};

export const modelRoomInfos = (rooms: RoomMetrics[]): ModelRoomInfo[] =>
  rooms.map((m) => ({
    id: m.room.id,
    number: m.room.number,
    name: m.room.name,
    floorName: m.floor?.name ?? m.room.floor,
    kind: m.room.kind,
    thetaInt: m.room.thetaInt,
    area: m.area === null ? null : Math.round(m.area * 100) / 100,
    height: m.height === null ? null : Math.round(m.height * 100) / 100,
  }));

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

/** Updates the linked rooms from the model. Rooms whose model room disappeared are unlinked and kept. */
export function syncLinkedRooms(data: HeatLoadData, model: ModelRoomInfo[]): { data: HeatLoadData; changed: boolean } {
  const byId = new Map(model.map((m) => [m.id, m]));
  let changed = false;
  const rooms = data.rooms.map((room) => {
    if (!room.modelRoomId) return room;
    const m = byId.get(room.modelRoomId);
    const next = m ? applyModel(room, m) : { ...room, modelRoomId: null };
    if (JSON.stringify(next) !== JSON.stringify(room)) changed = true;
    return next;
  });
  return { data: changed ? { ...data, rooms } : data, changed };
}

/** Adds every model room that is not linked yet, with `template` for the heat load fields. */
export function importModelRooms(data: HeatLoadData, model: ModelRoomInfo[], template: (m: ModelRoomInfo) => HeatRoom): { data: HeatLoadData; added: number } {
  const linked = new Set(data.rooms.map((r) => r.modelRoomId).filter(Boolean));
  const missing = model.filter((m) => !linked.has(m.id));
  if (!missing.length) return { data, added: 0 };
  const rooms = [...data.rooms, ...missing.map((m) => applyModel({ ...template(m), modelRoomId: m.id }, m))];
  return { data: { ...data, rooms }, added: missing.length };
}
