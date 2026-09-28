// Duct insulation of a ventilation system: the temperature difference medium – surroundings (ΔT) is set on an element
// and holds for the elements after it (away from the unit) until one sets its own. Leitungen, Reduktionen, T-Stücke
// and Absperrklappen get the thickness of EN-105 Table 1 (= SIA 382/1 Table 23): < 5 K none, 5 … < 10 K 30 mm,
// 10 … < 15 K 60 mm, ≥ 15 K 100 mm. A fire protection insulation EI30 / EI60 is set by hand and replaces it.

import { insulationRequirement } from "./calc";
import type { NetNode, SystemData } from "./network";
import { findProduct } from "./products";

export const fireClasses = ["EI30", "EI60"] as const;
export type FireClass = (typeof fireClasses)[number];

export const insulationClasses = ["30", "60", "100", "EI30", "EI60"] as const;
export type InsulationClass = (typeof insulationClasses)[number];

/**
 * Highlighter band in the Prinzipschema: fill, dotted edge lines and band width (grows with the thickness).
 * Light highlighter tones: 30 mm green, 60 mm orange, 100 mm red, EI30 blue, EI60 violet.
 */
export const insulationStyles: Record<InsulationClass, { fill: string; edge: string; width: number }> = {
  "30": { fill: "#c4f2b4", edge: "#3f9a2a", width: 9 },
  "60": { fill: "#ffd2a0", edge: "#c4782a", width: 12 },
  "100": { fill: "#ffb8b8", edge: "#c43c3c", width: 15 },
  EI30: { fill: "#b8d4ff", edge: "#3a6cc4", width: 12 },
  EI60: { fill: "#dcc0f5", edge: "#8a4cc4", width: 15 },
};

/** Leitungen, Reduktionen, T-Stücke and Absperrklappen are insulated; other components never automatically. */
export function isInsulatable(node: NetNode): boolean {
  if (node.type === "duct" || node.type === "bend" || node.type === "reducer" || node.type === "tee") return true;
  return node.type === "component" && findProduct(node.product)?.family === "Absperrklappen";
}

export type NodeInsulation = {
  /** Effective ΔT [K]: own or inherited from the element before it; null when none is set. */
  deltaT: number | null;
  inherited: boolean;
  /** Thermal thickness from ΔT [mm] (0 = none). */
  thickness: number;
  /** What the element gets: thermal thickness or fire protection; null when not insulated. */
  cls: InsulationClass | null;
};

export const thicknessFor = (deltaT: number) => insulationRequirement("supplyExtract", "inside", deltaT);

/** Insulation of every element of a system, by node id. */
export function systemInsulation(data: SystemData): Map<string, NodeInsulation> {
  const out = new Map<string, NodeInsulation>();
  const visit = (n: NetNode, before: number | null) => {
    const deltaT = n.deltaT ?? before;
    const thickness = deltaT !== null ? thicknessFor(deltaT) : 0;
    const cls: InsulationClass | null = !isInsulatable(n) ? null : n.fire ? n.fire : thickness > 0 ? (String(thickness) as InsulationClass) : null;
    out.set(n.id, { deltaT, inherited: n.deltaT === null && deltaT !== null, thickness, cls });
    return deltaT;
  };
  const tree = (n: NetNode, before: number | null) => {
    const own = visit(n, before);
    n.children.forEach((c) => tree(c, own));
  };
  // Chains are stored unit side first, so each element inherits from the one before it.
  const chain = (list: NetNode[]) => list.reduce<number | null>((before, n) => visit(n, before), null);
  chain(data.outdoor);
  chain(data.exhaust);
  data.supply.forEach((n) => tree(n, null));
  data.extract.forEach((n) => tree(n, null));
  return out;
}

/** Name of the insulation in the LV: «Dämmung 30 mm» or «Brandschutzdämmung EI30». */
export const insulationName = (cls: InsulationClass) => (cls === "EI30" || cls === "EI60" ? `Brandschutzdämmung ${cls}` : `Dämmung ${cls} mm`);
