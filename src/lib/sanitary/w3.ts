// Pipe sizing after SVGW W3 (Ausgabe 2013), chapter 2 – values from Berechnungsvorlagen/Sanitär/SVGW Richtlinie W3.pdf:
//   Tabelle 3              Belastungswerte (LU) of the outlets, 1 LU = 0.1 l/s
//   Diagramm 1             Spitzendurchfluss Q_D from the Summendurchfluss Q_T = ΣLU · 0.1 l/s
//   Tabellen 4.1 / 4.2     Apparategruppe / Stockwerkverteilung (Ausstossleitung PE-X / T-Stücke rostbeständiger Stahl)
//   Tabelle 4.3            Verteilleitung (T-Stücke, rostbeständiger Stahl)
//   Tabelle 5              Hausanschlussleitung (materialunabhängig, DN)
//   2.1.3                  zulässige Fliessgeschwindigkeiten
// W3 publishes these tables as examples (the SVGW certifies system-specific ones); the steel tables use the
// dimensions of Optipress (15×1 … 35×1.5), the PE-X table those of Optiflex 16×2.2 / 20×2.8.

/** Outlets of Tabelle 3: LU cold / warm and the flow of the single connection [l/s]. */
export const appliances = {
  wc: { cold: 1, warm: 0, q: 0.1 },
  basin: { cold: 1, warm: 1, q: 0.1 },
  dishwasher: { cold: 1, warm: 0, q: 0.1 },
  washer: { cold: 2, warm: 0, q: 0.2 },
  balcony: { cold: 2, warm: 0, q: 0.2 },
  shower: { cold: 2, warm: 2, q: 0.2 },
  urinal: { cold: 3, warm: 0, q: 0.3 },
  bathtub: { cold: 3, warm: 3, q: 0.3 },
  garden: { cold: 5, warm: 0, q: 0.5 },
} as const;

export type ApplianceKey = keyof typeof appliances;
export const applianceKeys = Object.keys(appliances) as ApplianceKey[];
export type Appliances = Partial<Record<ApplianceKey, number>>;

/**
 * Diagramm 1: peak flow Q_D [l/s] from the sum flow Q_T [l/s] and the largest single connection [l/s].
 * Up to the largest connection (at least 0.3 l/s) Q_D = Q_T; then Q_D = 0.459 · Q_T^0.353 (0.3 … 300 l/s), with a
 * 0.5 l/s connection (garden valve) Q_D = 0.598 · Q_T^0.257 up to 15 l/s. Q_D is never below the largest connection.
 */
export function peakFlow(sum: number, largest: number): number {
  if (sum <= 0) return 0;
  const knee = Math.max(0.3, largest);
  if (sum <= knee) return sum;
  const q = largest >= 0.5 && sum <= 15 ? 0.598 * sum ** 0.257 : 0.459 * sum ** 0.353;
  return Math.max(q, largest);
}

/** 2.1.3: calculated velocity limits [m/s]. */
export const velocityLimits = { outlet: 4, floor: 3, distribution: 2, house: 2 } as const;

type LuTable = { lengths: number[]; rows: { lu: number; sizes: (string | null)[] }[] };

/** Tabelle 4.2 (T-Stücke, steel), columns 5 / 10 / 15 m without / with water meter. */
const table42: LuTable = {
  lengths: [5, 5, 10, 10, 15, 15],
  rows: [
    { lu: 1, sizes: ["15", "15", "15", "15", "15", "15"] },
    { lu: 2, sizes: ["15", "15", "15", "15", "15", "15"] },
    { lu: 3, sizes: ["15", "15", "15", "15", "15", "15"] },
    { lu: 4, sizes: ["15", "15", "15", "15", "18", "18"] },
    { lu: 5, sizes: ["15", "15", "15", "18", "18", "18"] },
    { lu: 6, sizes: ["15", "15", "18", "18", "18", "18"] },
    { lu: 8, sizes: ["15", "15", "18", "18", "18", "22"] },
    { lu: 10, sizes: ["18", "18", "18", "18", "22", "22"] },
    { lu: 12, sizes: ["18", "18", "18", "22", "22", "22"] },
    { lu: 15, sizes: ["18", "18", "22", "22", "22", "22"] },
  ],
};

/** Tabelle 4.1 (Ausstossleitung, PE-X), columns 5 / 10 / 15 m without / with water meter; null = «kein Zähler». */
const table41: LuTable = {
  lengths: [5, 5, 10, 10, 15, 15],
  rows: [
    { lu: 1, sizes: ["16", "16", "16", "16", "16", "16"] },
    { lu: 2, sizes: ["16", "16", "16", "16", "16", "20"] },
    { lu: 3, sizes: ["16", "16", "20", "20", "20", "20"] },
    { lu: 4, sizes: ["16", "16", "20", "20", "20", "20"] },
    { lu: 5, sizes: ["20", null, "20", null, null, null] },
  ],
};

/** Tabelle 4.3 (Verteilleitung, T-Stücke, steel), columns 5 / 10 / 15 / 20 / 35 m. */
const table43: LuTable = {
  lengths: [5, 10, 15, 20, 35],
  rows: [
    { lu: 1, sizes: ["15", "15", "15", "15", "15"] },
    { lu: 2, sizes: ["15", "18", "18", "18", "22"] },
    { lu: 3, sizes: ["18", "22", "22", "22", "22"] },
    { lu: 4, sizes: ["22", "22", "22", "22", "22"] },
    { lu: 6, sizes: ["22", "22", "22", "22", "22"] },
    { lu: 8, sizes: ["22", "22", "22", "22", "22"] },
    { lu: 10, sizes: ["22", "22", "22", "22", "28"] },
    { lu: 15, sizes: ["22", "22", "22", "22", "28"] },
    { lu: 20, sizes: ["22", "22", "28", "28", "28"] },
    { lu: 30, sizes: ["28", "28", "28", "28", "28"] },
    { lu: 50, sizes: ["28", "28", "28", "28", "35"] },
    { lu: 70, sizes: ["28", "28", "35", "35", "35"] },
    { lu: 90, sizes: ["28", "35", "35", "35", "35"] },
    { lu: 120, sizes: ["35", "35", "35", "35", "35"] },
    { lu: 150, sizes: ["35", "35", "35", "35", "35"] },
  ],
};

/** Tabelle 5 (Hausanschlussleitung, DN), columns 10 / 20 / 30 / 40 / 50 m. */
const table5: LuTable = {
  lengths: [10, 20, 30, 40, 50],
  rows: [
    { lu: 60, sizes: ["25", "32", "32", "32", "40"] },
    { lu: 90, sizes: ["25", "32", "32", "40", "40"] },
    { lu: 120, sizes: ["32", "32", "32", "40", "40"] },
    { lu: 150, sizes: ["32", "32", "40", "40", "40"] },
    { lu: 300, sizes: ["32", "40", "40", "40", "50"] },
    { lu: 600, sizes: ["40", "40", "50", "50", "50"] },
  ],
};

export type W3Table = "4.1" | "4.2" | "4.3" | "5";
const tables: Record<W3Table, LuTable> = { "4.1": table41, "4.2": table42, "4.3": table43, "5": table5 };

/**
 * Size from a Belastungswerttabelle: first row with LU ≥ the sum, first length column ≥ the developed length
 * (tables 4.1 / 4.2: the «mit Wasserzähler» column when a group meter is installed). Null when the table does not
 * cover the case (then the pipe is sized by velocity).
 */
export function tableSize(table: W3Table, lu: number, length: number, meter = false): string | null {
  const t = tables[table];
  const row = t.rows.find((r) => r.lu >= lu - 1e-9);
  if (!row || lu <= 0) return null;
  const paired = table === "4.1" || table === "4.2";
  const col = t.lengths.findIndex((l, i) => l >= length - 1e-9 && (!paired || i % 2 === (meter ? 1 : 0)));
  return col >= 0 ? row.sizes[col] : null;
}

/** Largest developed length [m] a table covers. */
export const tableMaxLength = (table: W3Table) => Math.max(...tables[table].lengths);
