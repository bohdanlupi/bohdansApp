// Inputs of the Strangschema (243) prepared on the server: rooms of the Wärmebedarf, configured Heizkörper and
// Fussbodenheizungs-Verteiler, and the lookups of evaluateDistribution built from them (shared by the editor and the
// plan PDF).

import { floorOrder } from "@/lib/kwl/schema-layout";

import { type FloorLoad, type GroupInfo, type HeatNode, newHeatNode, type RadiatorLoad, type RoomLoad } from "./distribution";
import type { HeatingGroup } from "./plant-schema";
import type { MtArticle } from "./radiator-data";
import { modelText, type PipeSource, type RadiatorConnection, type RadiatorPlanResult, type RadiatorSide } from "./radiators";

/** Heat load calculation with its heated rooms (Heizkörper). */
export type CalcOption = { id: string; name: string; rooms: { id: string; label: string; floor: string; load: number; roomTemp: number }[] };
/** Fussbodenheizungs-Verteiler of the Anlage with the result of its calculation. */
export type FloorOption = { systemId: string; systemName: string; id: string; name: string; groupId: string | null; total: number; massFlow: number; maxPressure: number; rings: number };
/** A configured Heizkörper of the Anlage (243 Heizkörper) with what the schema and the Materialauszug need. */
export type RadiatorOption = {
  id: string;
  label: string;
  roomName: string;
  floor: string;
  groupId: string | null;
  /** Required load (share of the room) and design output [W]. */
  load: number;
  output: number;
  /** «Charleston 3060-12 · L 578 mm». */
  model: string;
  connection: RadiatorConnection;
  side: RadiatorSide;
  pipeFrom: PipeSource;
  drain: "return" | "separate";
  vent: boolean;
  articles: {
    radiator: MtArticle | null;
    vlValve: MtArticle | null;
    rlValve: MtArticle | null;
    valveBlock: MtArticle | null;
    head: MtArticle | null;
    vent: MtArticle | null;
    drain: MtArticle | null;
  };
};
/** The Heizkörper of an Anlage and the Oventrop Entleerungswerkzeug when needed. */
export type RadiatorInputs = { list: RadiatorOption[]; drainTool: MtArticle | null };

/** Groups of the Anlage for the calculation (unnamed ones as «Gruppe n»). */
export const groupInfos = (groups: HeatingGroup[], groupWord: string): GroupInfo[] =>
  groups.map((g, i) => ({ id: g.id, name: g.name || `${groupWord} ${i + 1}`, supplyTemp: g.supplyTemp, returnTemp: g.returnTemp, power: g.power }));

/** Serializable Heizkörper from their evaluation. */
export function radiatorOptions(result: RadiatorPlanResult): RadiatorInputs {
  const strip = (a: MtArticle | null) => (a ? { number: a.number, text: a.text } : null);
  return {
    list: result.radiators.map((r) => ({
      id: r.id,
      label: r.label,
      roomName: r.roomName,
      floor: r.floor,
      groupId: r.groupId,
      load: r.load,
      output: r.output,
      model: [modelText(r.ref) + (r.ref?.series.unit === "element" && r.size !== null ? `-${r.size}` : ""), r.length !== null ? `L ${Math.round(r.length)} mm` : ""].filter(Boolean).join(" · "),
      connection: r.connection,
      side: r.side,
      pipeFrom: r.pipeFrom,
      drain: r.drain,
      vent: r.vent,
      articles: {
        radiator: strip(r.radiatorArticle),
        vlValve: strip(r.vlValve),
        rlValve: strip(r.rlValve),
        valveBlock: strip(r.valveBlock),
        head: strip(r.head),
        vent: strip(r.ventValve),
        drain: strip(r.drainCock),
      },
    })),
    drainTool: result.drainTool,
  };
}

/** Lookups of the calculation from the loaded inputs. */
export const inputLookups = (rooms: CalcOption[], floors: FloorOption[], radiators: RadiatorOption[] = []) => {
  const roomMap = new Map(rooms.flatMap((c) => c.rooms.map((r) => [`${c.id}:${r.id}`, r] as const)));
  const radiatorMap = new Map(radiators.map((r) => [r.id, r]));
  return {
    room: (calcId: string, roomId: string): RoomLoad | null => {
      const r = roomMap.get(`${calcId}:${roomId}`);
      return r ? { name: r.label, load: r.load, roomTemp: r.roomTemp } : null;
    },
    floor: (systemId: string, distributorId: string): FloorLoad | null => {
      const f = floors.find((x) => x.systemId === systemId && x.id === distributorId);
      return f ? { name: f.name, total: f.total, massFlow: f.massFlow, maxPressure: f.maxPressure, rings: f.rings } : null;
    },
    radiator: (id: string): RadiatorLoad | null => {
      const r = radiatorMap.get(id);
      return r ? { name: r.label, load: r.load } : null;
    },
    radiatorInfo: (id: string): RadiatorOption | null => radiatorMap.get(id) ?? null,
  };
};

/**
 * Starting network for configured Heizkörper of a Heizgruppe, to be edited afterwards: one storey → a Verteilleitung
 * with an Anschlussleitung (2 m) per Heizkörper; several storeys → a Strang with one riser section (3 m) per storey,
 * its Stockwerkverteilung (5 m) with the Anschlussleitungen, fed by a Verteilleitung (5 m) from the group.
 */
export function radiatorNetwork(list: RadiatorOption[]): HeatNode[] {
  if (!list.length) return [];
  const floors = [...new Set(list.map((r) => r.floor))].sort((a, b) => floorOrder(a) - floorOrder(b));
  const branch = (r: RadiatorOption) => newHeatNode("pipe", { floor: r.floor, length: 2, children: [newHeatNode("radiator", { radiatorId: r.id, floor: r.floor })] });
  const storey = (floor: string) => newHeatNode("pipe", { floor, length: 5, children: list.filter((r) => r.floor === floor).map(branch) });
  if (floors.length === 1) return [storey(floors[0])];
  // Riser sections from the top storey down: each carries its storey and the section above.
  let above: HeatNode | null = null;
  for (const floor of floors) above = newHeatNode("pipe", { riser: true, floor, length: 3, children: [storey(floor), ...(above ? [above] : [])] });
  return [newHeatNode("pipe", { length: 5, children: [above!] })];
}
