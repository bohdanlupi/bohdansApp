import type { FloorRoom, LinkedRoom } from "./floor";
import { evaluateHeatLoad, type Construction, type HeatLoadData, type HeatSite } from "./heat-load";

/**
 * Rooms of the heat load calculations as input of the floor heating: Qh without the floor loss (the heated floor
 * elements are replaced by the downward loss of Tab. C), area, room temperature and the temperature below the floor.
 */
export function linkedRooms(calcs: { id: string; name: string; data: HeatLoadData }[], site: HeatSite, catalog: Construction[]) {
  const map = new Map<string, LinkedRoom>();
  for (const calc of calcs) {
    const result = evaluateHeatLoad(calc.data, site, catalog);
    calc.data.rooms.forEach((room, i) => {
      if (room.kind !== "heated") return;
      const r = result.rooms[i];
      let floorPhi = 0;
      let below: number | null = null;
      room.elements.forEach((e, k) => {
        if (!e.heatedSurface) return;
        const er = r.elements[k];
        floorPhi += er.phi;
        if (below === null && r.thetaInt !== null && result.site.thetaE0 !== null && er.f1 !== null)
          below = er.thetaX ?? r.thetaInt - er.f1 * (r.thetaInt - result.site.thetaE0);
      });
      map.set(`${calc.id}:${room.id}`, {
        name: [room.number, room.name].filter(Boolean).join(" "),
        load: Math.max(r.phiHL - floorPhi, 0),
        area: r.area,
        roomTemp: r.thetaInt ?? 20,
        belowTemp: below,
      });
    });
  }
  return (calcId: string, roomId: string) => map.get(`${calcId}:${roomId}`) ?? null;
}

/** Lookup of the linked heat load room of a floor heating room. */
export const roomLookup =
  (get: (calcId: string, roomId: string) => LinkedRoom | null) =>
  (room: FloorRoom): LinkedRoom | null =>
    room.calcId && room.roomId ? get(room.calcId, room.roomId) : null;
