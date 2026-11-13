import type { FireParams, FireUsage } from "./plan-schema";

// Qualitätssicherungsstufe after VKF BSR 11-15 Ziffer 3.3.1 (Nutzungen) and 3.4.1 (brennbare Tragwerke).
// Columns: Gebäude geringer Höhe, mittlerer Höhe, Hochhaus.

type Row = readonly [number, number, number];

/** Wohnen, Büro, Schule, Parking bis 2. UG, Landwirtschaft, Industrie/Gewerbe q bis 1’000 MJ/m². */
const basic: Row = [1, 1, 2];
/** Beherbergung [b], [c], Räume mit mehr als 300 Personen, Verkauf, Parking ab 3. UG, Industrie q über 1’000 MJ/m². */
const raised: Row = [2, 2, 3];
/** Beherbergung [a], unbekannte Nutzung. */
const high: Row = [2, 3, 3];
/** Tragwerke oder brandabschnittsbildende Bauteile mit brennbaren Bauprodukten (3.4.1). */
const timberRow: Row = [1, 2, 3];

const usageRow: Record<FireUsage, Row> = {
  residential: basic,
  office: basic,
  school: basic,
  parking: basic,
  agriculture: basic,
  industry: basic,
  hospitalityB: raised,
  hospitalityC: raised,
  assembly: raised,
  retail: raised,
  hospitalityA: high,
};

const column = { low: 0, medium: 1, highRise: 2 } as const;

/** QSS the tables suggest for the criteria (the Brandschutzbehörde decides; the highest level governs). */
export function suggestedQss(p: FireParams): number {
  const c = column[p.height];
  const rows = p.usages.length ? p.usages.map((u) => usageRow[u]) : [high];
  return Math.max(...rows.map((r) => r[c]), p.timber ? timberRow[c] : 1);
}
