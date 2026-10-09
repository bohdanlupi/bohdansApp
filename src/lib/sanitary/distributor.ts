// Wohnungsverteiler of an Apparategruppe: where the Pex-Verteiler sits and the parts in front of it, per line.
//   «im Kasten»  Verteilerkasten 86044 (size by the outlets), the parts as single articles inside
//   «Aufputz»    the parts as single articles on the wall
//   «hinter WT»  Unterputz box behind the Waschtisch when the parts of both lines fit one:
//                  only Absperrung + Wasserzähler / Passstück → 70120 Unterputz-Waschtischbox (meter housing with
//                  Blinddeckel; the Waschtisch is fed directly from the box), Messkapsel 67016 per Wasserzähler
//                  only Absperrung + Druckreduzierung       → 70112 Unterputz-Armaturenbox, Reduzierpatrone 11050
//                anything more: single articles (user decision 2026-10-09).
// Single articles: Absperrventil (Schrägsitzventil), Druckreduzierventil 11000 (2–6 bar), Wasserzähler = Rohbauset
// 67100 + Messkapsel Koax 67016, Passstück (meter to follow) = Rohbauset 67100 with its Verschlusszapfen.

import type { Outlet } from "./network";
import { appliances } from "./w3";

export type DistributorType = "cabinet" | "surface" | "basin";
/** Wasserzähler slot of a line: nothing, Passstück (meter to follow) or the meter. */
export type MeterSlot = "none" | "spacer" | "meter";
export type LineParts = { shutoff: boolean; reducer: boolean; meter: MeterSlot };
export type Distributor = { type: DistributorType; pwc: LineParts; pwh: LineParts };
export type SupplyLine = "pwc" | "pwh";

export const distributorTypes: DistributorType[] = ["cabinet", "surface", "basin"];
export const meterSlots: MeterSlot[] = ["none", "spacer", "meter"];

const lineParts = (shutoff: boolean): LineParts => ({ shutoff, reducer: false, meter: "none" });
/** New Apparategruppen: Aufputz with Absperrungen on both lines. */
export const defaultDistributor = (shutoff = true): Distributor => ({ type: "surface", pwc: lineParts(shutoff), pwh: lineParts(shutoff) });

export type DistributorPlan = {
  /** Lines the group carries (only they get parts). */
  lines: SupplyLine[];
  /** Unterputz box behind the Waschtisch, null: single articles. */
  box: "70120" | "70112" | null;
  /** Apparat fed directly from the 70120 box (its first Waschtisch). */
  fromBox: string | null;
  /** Verteilerkasten article for «im Kasten» and its width [mm]. */
  cabinet: string | null;
  cabinetSize: number | null;
  /** Kinds of parts present on any line, in the order along the line. */
  kinds: ("shutoff" | "reducer" | "meter")[];
};

/** Verteilerkasten 86044 by the outlets of the Verteiler: 400 / 600 / 750 / 900 mm (planning value). */
const CABINETS: [number, string, number][] = [
  [4, "86044.21", 400],
  [7, "86044.22", 600],
  [10, "86044.23", 750],
  [Infinity, "86044.24", 900],
];

export function distributorPlan(d: Distributor, outlets: Outlet[]): DistributorPlan {
  const lines: SupplyLine[] = [];
  if (outlets.some((o) => appliances[o.type].cold > 0)) lines.push("pwc");
  if (outlets.some((o) => appliances[o.type].warm > 0)) lines.push("pwh");
  const parts = lines.map((m) => d[m]);
  const reducer = parts.some((p) => p.reducer);
  const meter = parts.some((p) => p.meter !== "none");
  const box = d.type !== "basin" ? null : !reducer ? "70120" : !meter ? "70112" : null;
  const cabinet = d.type === "cabinet" ? CABINETS.find(([max]) => outlets.length <= max)! : null;
  const kinds = (["shutoff", "reducer", "meter"] as const).filter((k) => parts.some((p) => (k === "meter" ? p.meter !== "none" : p[k])));
  return {
    lines,
    box,
    fromBox: box === "70120" ? (outlets.find((o) => o.type === "basin")?.id ?? null) : null,
    cabinet: cabinet?.[1] ?? null,
    cabinetSize: cabinet?.[2] ?? null,
    kinds,
  };
}
