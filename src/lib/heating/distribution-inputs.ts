// Inputs of the Strangschema (243) prepared on the server: rooms of the Wärmebedarf and Fussbodenheizungs-Verteiler,
// and the lookups of evaluateDistribution built from them (shared by the editor and the plan PDF).

import type { FloorLoad, GroupInfo, RoomLoad } from "./distribution";
import type { HeatingGroup } from "./plant-schema";

/** Heat load calculation with its heated rooms (Heizkörper). */
export type CalcOption = { id: string; name: string; rooms: { id: string; label: string; floor: string; load: number; roomTemp: number }[] };
/** Fussbodenheizungs-Verteiler of the Anlage with the result of its calculation. */
export type FloorOption = { systemId: string; systemName: string; id: string; name: string; groupId: string | null; total: number; massFlow: number; maxPressure: number; rings: number };

/** Groups of the Anlage for the calculation (unnamed ones as «Gruppe n»). */
export const groupInfos = (groups: HeatingGroup[], groupWord: string): GroupInfo[] =>
  groups.map((g, i) => ({ id: g.id, name: g.name || `${groupWord} ${i + 1}`, supplyTemp: g.supplyTemp, returnTemp: g.returnTemp, power: g.power }));

/** Lookups of the calculation from the loaded inputs. */
export const inputLookups = (rooms: CalcOption[], floors: FloorOption[]) => {
  const roomMap = new Map(rooms.flatMap((c) => c.rooms.map((r) => [`${c.id}:${r.id}`, r] as const)));
  return {
    room: (calcId: string, roomId: string): RoomLoad | null => {
      const r = roomMap.get(`${calcId}:${roomId}`);
      return r ? { name: r.label, load: r.load, roomTemp: r.roomTemp } : null;
    },
    floor: (systemId: string, distributorId: string): FloorLoad | null => {
      const f = floors.find((x) => x.systemId === systemId && x.id === distributorId);
      return f ? { name: f.name, total: f.total, massFlow: f.massFlow, maxPressure: f.maxPressure, rings: f.rings } : null;
    },
  };
};
