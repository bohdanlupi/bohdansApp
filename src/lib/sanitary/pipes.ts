// Nussbaum pipe systems of the Sanitär module and their hydraulics:
//   Optipress (Edelstahlrohr 1.4521 with Optipress-Aquaplus fittings) – PWC, PWH and the separate PWH-C
//   Optiflex (Flowpress formstabil, PE-RT for 1-LU outlets)              – floor pipes and the PWH-C «Rohr an Rohr»
// Inner diameters and roughness from the Nussbaum sheet «Dimensionen» of the Zirkulationsberechnung
// (Berechnungsvorlagen/Sanitär). Friction per metre with Darcy–Weisbach / Colebrook at the water temperature; at
// 60 °C this reproduces the Nussbaum R-value tables of that workbook (e.g. 22×1.2 at 430 l/h: 1.1 mbar/m).
// Insulation thickness after EnDK Vollzugshilfe EN-103 (2020) Tabelle 2.

import { type CatalogArticle, type NussbaumFamily, nussbaumArticles } from "./catalog-data";

export type PipeSystem = "optipress" | "optiflex";

export type PipeSize = {
  /** Key saved in the network, e.g. «op-22», «of-16», «of-16x3.8». */
  key: string;
  system: PipeSystem;
  /** Outer diameter × wall [mm] as printed, e.g. «22×1.2». */
  label: string;
  od: number;
  di: number;
  /** Nominal size DN for the insulation table. */
  dn: number;
  family: NussbaumFamily;
};

const op = (od: number, wall: number, di: number, dn: number): PipeSize => ({
  key: `op-${od}`,
  system: "optipress",
  label: `${od}×${wall}`,
  od,
  di,
  dn,
  family: "81082",
});
const of = (key: string, od: number, wall: number, di: number, dn: number, family: NussbaumFamily = "87153"): PipeSize => ({
  key,
  system: "optiflex",
  label: `${od}×${wall}`,
  od,
  di,
  dn,
  family,
});

/** Sizes in ascending order per system. */
export const pipeSizes: PipeSize[] = [
  op(15, 1, 13, 12),
  op(18, 1, 16, 15),
  op(22, 1.2, 19.6, 20),
  op(28, 1.2, 25.6, 25),
  op(35, 1.5, 32, 32),
  op(42, 1.5, 39, 40),
  op(54, 1.5, 51, 50),
  op(64, 2, 60, 65),
  op(76.1, 2, 72.1, 65),
  op(88.9, 2, 84.9, 80),
  op(108, 2, 104, 100),
  of("of-16x3.8", 16, 3.8, 8.4, 10, "87123"),
  of("of-16", 16, 2.2, 11.6, 12),
  of("of-20", 20, 2.8, 14.4, 15),
  of("of-25", 25, 2.7, 19.6, 20),
  of("of-32", 32, 3.2, 25.6, 25),
];

/** Pipes for PWC / PWH (the 1-LU PE-RT pipe only as Zirkulation «Rohr an Rohr»). */
export const supplySizes = (system: PipeSystem) => pipeSizes.filter((p) => p.system === system && p.key !== "of-16x3.8");
/** PWH-C «Rohr an Rohr»: Optiflex along the steel PWH. */
export const rarReturnSizes = () => pipeSizes.filter((p) => p.system === "optiflex");
export const findSize = (key: string | null | undefined) => pipeSizes.find((p) => p.key === key) ?? null;
/** Size of a system by its outer diameter as written in the W3 tables («15», «22», «16»). */
export const sizeByOd = (system: PipeSystem, od: string) => supplySizes(system).find((p) => String(p.od) === od) ?? null;

/** Roughness [mm]: stainless steel 0.0015, Optiflex 0.007 (Nussbaum). */
const roughness: Record<PipeSystem, number> = { optipress: 0.0015, optiflex: 0.007 };

/** Kinematic viscosity of water [m²/s] at t [°C] (fit, 0.5 % over 5 … 90 °C). */
export const viscosity = (t: number) => 1.792e-6 / (1 + 0.0337 * t + 0.000221 * t * t);

export const area = (p: PipeSize) => (Math.PI * (p.di / 1000) ** 2) / 4;

/** Velocity [m/s] at a flow [l/s]. */
export const velocity = (p: PipeSize, flow: number) => flow / 1000 / area(p);

/** Friction per metre [mbar/m] at a flow [l/h] and water temperature [°C]. */
export function frictionPerMetre(p: PipeSize, flowLh: number, t = 60): number {
  if (flowLh <= 0) return 0;
  const d = p.di / 1000;
  const v = flowLh / 3600 / 1000 / area(p);
  const re = (v * d) / viscosity(t);
  const eps = roughness[p.system] / p.di;
  let lambda: number;
  if (re < 2300) lambda = 64 / re;
  else {
    // Colebrook, fixed-point from the Swamee–Jain start value.
    lambda = 0.25 / Math.log10(eps / 3.7 + 5.74 / re ** 0.9) ** 2;
    for (let i = 0; i < 8; i++) lambda = (-2 * Math.log10(eps / 3.7 + 2.51 / (re * Math.sqrt(lambda)))) ** -2;
  }
  const rho = 1000;
  return ((lambda / d) * (rho * v * v)) / 2 / 100;
}

/** Smallest size of a list whose velocity at the flow [l/s] stays within the limit; else the largest. */
export function sizeForVelocity(list: PipeSize[], flow: number, limit: number): PipeSize | null {
  if (!list.length) return null;
  return list.find((p) => velocity(p, flow) <= limit + 1e-9) ?? list[list.length - 1];
}

/** Next larger Optipress size (the common insulation «Rohr an Rohr» is one dimension larger than the PWH). */
export function nextSize(p: PipeSize): PipeSize {
  return supplySizes("optipress").find((x) => x.od > p.od + 1e-9) ?? p;
}

// ---------------------------------------------------------------------------
// Insulation (EN-103 Tabelle 2)
// ---------------------------------------------------------------------------

/** λ of the insulation material: «low» ≤ 0.03 W/mK, «high» > 0.03 … 0.05 W/mK. */
export type InsulationLambda = "low" | "high";

const insulationRows: { maxDn: number; high: number; low: number }[] = [
  { maxDn: 15, high: 40, low: 30 },
  { maxDn: 32, high: 50, low: 40 },
  { maxDn: 50, high: 60, low: 50 },
  { maxDn: 80, high: 80, low: 60 },
  { maxDn: 150, high: 100, low: 80 },
  { maxDn: 200, high: 120, low: 80 },
];

/** Minimum insulation thickness [mm] of a PWH / PWH-C pipe. */
export function insulationThickness(p: PipeSize, lambda: InsulationLambda): number {
  const row = insulationRows.find((r) => p.dn <= r.maxDn) ?? insulationRows[insulationRows.length - 1];
  return row[lambda];
}

/** Highlighter band of an insulation thickness in the schema (fill, dotted edge). */
export function insulationStyle(mm: number): { fill: string; edge: string } {
  if (mm <= 20) return { fill: "#cfe8ff", edge: "#3a78c4" };
  if (mm <= 30) return { fill: "#c4f2b4", edge: "#3f9a2a" };
  if (mm <= 40) return { fill: "#b8eee6", edge: "#2a9a8a" };
  if (mm <= 50) return { fill: "#fff0a0", edge: "#b89a1a" };
  if (mm <= 60) return { fill: "#ffd2a0", edge: "#c4782a" };
  if (mm <= 80) return { fill: "#ffc4e4", edge: "#c43c8a" };
  return { fill: "#ffb8b8", edge: "#c43c3c" };
}

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

/** Thread of a pipe size for threaded valves (Regulierventile). */
const threadOf = (od: number) => (od <= 18 ? "½" : od <= 22 ? "¾" : od <= 28 ? "1" : od <= 35 ? "1¼" : od <= 42 ? "1½" : "2");

/**
 * Article of a Nussbaum family for a pipe size: exact size («22»), the first number («22 x ¾», «28 x 22») or the
 * thread («20 (¾)», «¾»); else the next larger one, else the largest.
 */
export function articleFor(family: NussbaumFamily, p: PipeSize | null): CatalogArticle | null {
  const list = nussbaumArticles[family] ?? [];
  if (!list.length) return null;
  if (!p) return list[0];
  const od = p.system === "optiflex" ? (pipeSizes.find((x) => x.system === "optipress" && x.dn >= p.dn)?.od ?? p.od) : p.od;
  const first = (s: string | null) => (s ? Number.parseFloat(s) : Number.NaN);
  const exact = list.find((a) => first(a.size) === od) ?? list.find((a) => (a.size ?? "").includes(`(${threadOf(od)})`) || a.size === threadOf(od));
  if (exact) return exact;
  const bigger = list.filter((a) => first(a.size) > od).sort((a, b) => first(a.size) - first(b.size));
  return bigger[0] ?? list[list.length - 1];
}

export const pipeArticle = (p: PipeSize) => articleFor(p.family, p);
