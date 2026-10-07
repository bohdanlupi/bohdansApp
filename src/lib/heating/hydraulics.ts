// Volumenströme and Nennweiten of the circuits of 242 Wärmeerzeugung, for the Materialauszug (valves, pumps).
// V̇ = Φ / (ρ · cp · ΔT); the DN is the smallest Optipress-Therm size whose velocity stays below a Richtwert
// (DN ≤ 20: 0.6 m/s, DN 25–32: 0.8 m/s, DN 40–50: 1.0 m/s, larger 1.5 m/s). Each DN can be overwritten (data.dn).

import type { EwsResult } from "./ews";
import { brineMedia } from "./ews-data";
import type { GeneratorType } from "./plan-schema";
import type { PlantData } from "./plant-schema";
import { CP_WATER } from "./water";

/** Optipress-Therm sizes: DN, outer diameter d and inner diameter di [mm], thread of the valves at this DN [inch]. */
export const pipeSizes = [
  { dn: 12, d: 15, di: 12.6, thread: 0.5 },
  { dn: 15, d: 18, di: 15.6, thread: 0.5 },
  { dn: 20, d: 22, di: 19, thread: 0.75 },
  { dn: 25, d: 28, di: 25, thread: 1 },
  { dn: 32, d: 35, di: 32, thread: 1.25 },
  { dn: 40, d: 42, di: 39, thread: 1.5 },
  { dn: 50, d: 54, di: 51, thread: 2 },
  { dn: 65, d: 76.1, di: 72.1, thread: 2.5 },
  { dn: 80, d: 88.9, di: 84.9, thread: 3 },
  { dn: 100, d: 108, di: 104, thread: 4 },
] as const;
export type PipeSize = (typeof pipeSizes)[number];

/** Richtwert of the velocity by DN [m/s]. */
export const maxVelocity = (dn: number) => (dn <= 20 ? 0.6 : dn <= 32 ? 0.8 : dn <= 50 ? 1.0 : 1.5);

/** Default Spreizung at a generator by type [K]. */
export const defaultDeltaT = (g: GeneratorType) => (g === "hpAir" || g === "hpBrine" || g === "hpWater" ? 5 : g === "district" ? 20 : 15);

/** Share of the Heizleistung taken from the source (Kälteleistung) when none is entered (COP ≈ 4). */
const SOURCE_SHARE = 0.75;

export type CircuitKind = "generator" | "source" | "hotWater" | "group" | "main";

export type Circuit = {
  /** Key of the DN override in data.dn. */
  key: string;
  kind: CircuitKind;
  /** Generator or group id (null for the WW connection and the mains). */
  id: string | null;
  power: number | null;
  deltaT: number | null;
  /** Volumenstrom [m³/h]. */
  flow: number | null;
  calculated: PipeSize | null;
  size: PipeSize | null;
  overridden: boolean;
  /** Single pipe length [m] and content of VL + RL [dm³]. */
  length: number | null;
  volume: number | null;
};

/** Content of VL + RL of a pipe of the size [dm³]. */
export const pipeContent = (size: PipeSize | null, length: number | null) =>
  size && length ? 2 * length * 10 * (Math.PI / 4) * (size.di / 100) ** 2 : null; // m → dm, mm → dm

const WATER = { rho: 990, cp: CP_WATER };

/** Volumenstrom [m³/h] of Φ [kW] at ΔT [K]. */
const flowOf = (power: number | null, deltaT: number | null, medium = WATER) =>
  power !== null && power > 0 && deltaT !== null && deltaT > 0 ? (power / (medium.rho * medium.cp * deltaT)) * 3600 : null;

/** Smallest size whose velocity at the flow stays below the Richtwert. */
export function sizeFor(flow: number | null): PipeSize | null {
  if (flow === null || flow <= 0) return null;
  const v = (s: PipeSize) => flow / 3600 / ((Math.PI / 4) * (s.di / 1000) ** 2);
  return pipeSizes.find((s) => v(s) <= maxVelocity(s.dn)) ?? pipeSizes[pipeSizes.length - 1];
}

export const sizeOfDn = (dn: number) => pipeSizes.find((s) => s.dn === dn) ?? null;

export function evaluateHydraulics(data: PlantData, ews: EwsResult | null): Circuit[] {
  const circuit = (key: string, kind: CircuitKind, id: string | null, power: number | null, deltaT: number | null, flow: number | null): Circuit => {
    const calculated = sizeFor(flow);
    const chosen = data.dn[key] !== undefined ? sizeOfDn(data.dn[key]) : null;
    const size = chosen ?? calculated;
    const length = data.lengths[key] ?? null;
    return { key, kind, id, power, deltaT, flow, calculated, size, overridden: chosen !== null, length, volume: pipeContent(size, length) };
  };
  const out: Circuit[] = [];
  const genFlows = new Map<string, number | null>();
  for (const u of data.generators) {
    const dt = u.deltaT ?? defaultDeltaT(u.type);
    const c = circuit(`gen:${u.id}`, "generator", u.id, u.power, dt, flowOf(u.power, dt));
    genFlows.set(u.id, c.flow);
    out.push(c);
    if (u.type === "hpBrine" || u.type === "hpWater") {
      // Sole- / Zwischenkreis: Kälteleistung (EWS input, else 75 % of the Heizleistung) at the ΔT of the evaporator.
      const medium = u.type === "hpBrine" ? brineMedia[data.ews.medium] : null;
      const cooling = u.type === "hpBrine" ? (data.ews.coolingCapacity ?? (u.power !== null ? u.power * SOURCE_SHARE : null)) : u.power !== null ? u.power * SOURCE_SHARE : null;
      const dt = data.ews.deltaT;
      const ewsFlow = u.type === "hpBrine" && ews?.hydraulics ? ews.hydraulics.flow / 1000 : null;
      const flow = ewsFlow ?? flowOf(cooling, dt, medium ? { rho: medium.rho, cp: data.ews.cp ?? medium.cp } : WATER);
      out.push(circuit(`source:${u.id}`, "source", u.id, cooling, dt, flow));
    }
  }
  const groupFlows = data.groups.map((g) => {
    const dt = g.supplyTemp !== null && g.returnTemp !== null ? g.supplyTemp - g.returnTemp : null;
    const c = circuit(`group:${g.id}`, "group", g.id, g.power, dt, flowOf(g.power, dt));
    out.push(c);
    return c.flow;
  });
  if (data.hotWater && data.hotWaterConnection !== "group") {
    // Umschaltventil in the main: the flow of all generators; separate connection: the flow of its generator.
    const unit = data.generators.find((u) => u.id === data.hotWaterGenerator) ?? data.generators[0];
    const flows = data.hotWaterConnection === "diverter" ? [...genFlows.values()] : unit ? [genFlows.get(unit.id) ?? null] : [];
    const flow = flows.some((f) => f !== null) ? flows.reduce<number>((s, f) => s + (f ?? 0), 0) : null;
    out.push(circuit("hotWater", "hotWater", null, null, null, flow));
  }
  if (data.distributor === "pressurized") {
    const flow = groupFlows.some((f) => f !== null) ? groupFlows.reduce<number>((s, f) => s + (f ?? 0), 0) : null;
    out.push(circuit("main", "main", null, null, null, flow));
  }
  return out;
}

/**
 * Energiespeicher at the highest VL of the Heizgruppen; Rücklauf to the Speicher mixed from the groups with their
 * primary flows at that temperature: V̇ = Φ / (ρ · cp · (T_Speicher − T_RL)), returning at their T_RL.
 */
export function storageTemperatures(data: PlantData): { storage: number | null; ret: number | null; flow: number | null } {
  const supplies = data.groups.flatMap((g) => (g.supplyTemp !== null ? [g.supplyTemp] : []));
  const ts = supplies.length ? Math.max(...supplies) : null;
  if (ts === null) return { storage: null, ret: null, flow: null };
  let flow = 0;
  let sum = 0;
  for (const g of data.groups) {
    if (g.power === null || g.power <= 0 || g.returnTemp === null || g.returnTemp >= ts) continue;
    const v = flowOf(g.power, ts - g.returnTemp)!;
    flow += v;
    sum += v * g.returnTemp;
  }
  return { storage: ts, ret: flow > 0 ? sum / flow : null, flow: flow > 0 ? flow : null };
}
