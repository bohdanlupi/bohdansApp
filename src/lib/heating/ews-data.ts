// Tables and charts of SIA 384/6:2021 (Erdwärmesonden) for the simplified method of Anhang D.4. The figures were
// digitised from the norm PDF (Berechnungsvorlagen/Heizung, licensed – not in the repo): Figur 9 by pixel analysis,
// Figuren 3, 12 and 13–21 read off at their grid lines. They are Richtwerte with an accuracy of about ±1 % (Figur 9
// gives 37.7 W/m for example D.4.8.1, the norm reads 37.9 W/m).

/** Figur 9: specific Normleistung of a Duplex-EWS De 32 mm [W/m] by λ (1.0 … 4.0 W/mK) for ρ·c 1.5 / 2.0 / 2.5 MJ/m³K. */
export const normPower32: { lambda: number; c15: number; c20: number; c25: number }[] = [
  { lambda: 1.0, c15: 19.0, c20: 19.6, c25: 20.27 },
  { lambda: 1.25, c15: 22.08, c20: 22.75, c25: 23.55 },
  { lambda: 1.5, c15: 25.1, c20: 25.94, c25: 26.83 },
  { lambda: 1.75, c15: 28.3, c20: 29.18, c25: 30.11 },
  { lambda: 2.0, c15: 31.47, c20: 32.38, c25: 33.42 },
  { lambda: 2.25, c15: 34.1, c20: 35.08, c25: 36.08 },
  { lambda: 2.5, c15: 36.81, c20: 37.77, c25: 38.76 },
  { lambda: 2.75, c15: 39.5, c20: 40.45, c25: 41.47 },
  { lambda: 3.0, c15: 42.0, c20: 43.09, c25: 44.13 },
  { lambda: 3.25, c15: 44.3, c20: 45.31, c25: 46.46 },
  { lambda: 3.5, c15: 46.66, c20: 47.61, c25: 48.72 },
  { lambda: 3.75, c15: 48.9, c20: 49.88, c25: 50.99 },
  { lambda: 4.0, c15: 51.0, c20: 52.05, c25: 53.11 },
];
/** D.4.3: a Duplex-EWS De 40 mm yields 5 % more than one with 32 mm (Figur 10). */
export const DIAMETER_40_FACTOR = 1.05;

/** Figur 12: increase of the Norm-Volllaststunden [%] over 1850 h by altitude [m ü. M.]. */
export const loadHoursIncrease: Record<"north" | "south", [number, number][]> = {
  north: [
    [300, -3], [400, -2.3], [500, -1.3], [600, 0], [700, 1.6], [800, 3.6], [900, 6], [1000, 8.5], [1100, 11.2],
    [1200, 14.3], [1300, 17.5], [1400, 21.3], [1500, 25.5], [1600, 30.5], [1700, 35.5], [1800, 41], [1900, 46.8],
    [2000, 53], [2100, 59],
  ],
  south: [
    [250, -6], [400, -5], [500, -4], [600, -3], [700, -2], [800, -1], [900, 1], [1000, 3], [1100, 5.3], [1200, 8],
    [1300, 11], [1400, 14.5], [1500, 18.5], [1600, 22.5], [1700, 27], [1800, 32], [1900, 38], [2000, 44.5],
    [2100, 51], [2200, 58],
  ],
};

export const arrangements = ["1", "2", "3", "4", "2x2"] as const;
export type Arrangement = (typeof arrangements)[number];

/**
 * Figuren 13–21: Zuschlag zur EWS-Länge [%] by λ (2 / 2.5 / 3 W/mK), spacing (5 / 7.5 / 10 m) and arrangement, at
 * 1830 / 2200 / 2750 / 3300 Volllaststunden (the curves are piecewise straight between these points).
 */
export const LOAD_HOURS_POINTS = [1830, 2200, 2750, 3300];
export const lengthSurcharge: Record<string, Record<Arrangement, number[]>> = {
  "2|5": { "1": [0, 2, 11.3, 19], "2": [3.8, 13, 26.5, 37.5], "3": [11, 24.3, 39, 52], "4": [17, 30.5, 48.5, 63.5], "2x2": [22, 36, 55.5, 71.5] },
  "2|7.5": { "1": [0, 2, 11.5, 19.3], "2": [1.8, 11.3, 24, 34], "3": [7.7, 18.7, 32.5, 44.5], "4": [12.2, 23.8, 40, 53.8], "2x2": [16, 28.5, 46, 61] },
  "2|10": { "1": [0, 2, 10.8, 19.2], "2": [0.5, 9.5, 21.5, 31.5], "3": [4.8, 15.8, 28.5, 39.5], "4": [8.5, 19.5, 34, 47], "2x2": [12.3, 24.3, 40, 54] },
  "2.5|5": { "1": [0, 4.3, 13, 20.8], "2": [5.8, 16, 27.5, 38], "3": [12.5, 25, 40, 52.5], "4": [17, 31.5, 49, 64], "2x2": [20.5, 37, 56, 71.5] },
  "2.5|7.5": { "1": [0, 4.5, 13.3, 21], "2": [3.7, 13, 25, 34.8], "3": [9.3, 20, 33.5, 45], "4": [13.5, 25.2, 40.5, 53.5], "2x2": [17.2, 29.5, 46, 61] },
  "2.5|10": { "1": [0, 4.5, 12.8, 20.8], "2": [2.5, 11, 22.5, 32.5], "3": [6.5, 17, 29.5, 40.3], "4": [10.3, 20.3, 35, 47.2], "2x2": [13.5, 25.3, 40.5, 54.5] },
  "3|5": { "1": [0, 6.7, 15, 22.2], "2": [7.8, 19, 28.8, 38.5], "3": [13.5, 25.5, 41, 53.7], "4": [16.5, 32, 49, 63.7], "2x2": [19, 37, 57, 71.8] },
  "3|7.5": { "1": [0, 6.8, 15, 22.3], "2": [5.5, 14, 25.8, 35], "3": [10.7, 20.5, 33.8, 45.3], "4": [14.7, 25.3, 41, 53.2], "2x2": [18, 30, 46.5, 60.3] },
  "3|10": { "1": [0, 6.8, 15, 22.2], "2": [4.3, 12.7, 24.5, 33.8], "3": [8.2, 18.8, 30.5, 40.8], "4": [11.5, 21.5, 35.2, 47.3], "2x2": [14.2, 26.3, 41, 55] },
};

/** Figur 3: Temperaturabkühlung [K] by future neighbour probes after 50 years by P_GSF [kWh/m²]. */
export const neighbourCooling: [number, number][] = [
  [0, 0], [4, 0.5], [8, 1.05], [10.8, 1.5], [16, 2.2], [22, 3.05], [26, 3.6], [30, 4.25], [34, 5.05], [38, 5.85], [42, 6.7],
];

/** Tabelle 2: minimum Wärmeträgertemperatur θBHE,50 [°C] by requirement class and regeneration rate f_BHE. */
export const regenerationRates = ["none", "r20", "r40", "r60", "r80"] as const;
export type RegenerationRate = (typeof regenerationRates)[number];
export const requirementClasses = ["R1", "R2", "R3", "R4"] as const;
export type RequirementClass = (typeof requirementClasses)[number];
export const designTemperature: Record<RegenerationRate, Record<RequirementClass, number | null>> = {
  none: { R1: -1.5, R2: 0, R3: 1.5, R4: null },
  r20: { R1: -1.5, R2: -0.5, R3: 0.8, R4: null },
  r40: { R1: -1.5, R2: -1.0, R3: 0, R4: 1.5 },
  r60: { R1: -1.5, R2: -1.5, R3: -1, R4: 0 },
  r80: { R1: -1.5, R2: -1.5, R3: -1.5, R4: -1.5 },
};

/** Tabelle 5: Gebäudehüllzahl A_th / A_E by building category (for Q_H,li after SIA 380/1). */
export const envelopeFactors = {
  mfh: 1.25, efh: 2, admin: 1.5, school: 1.5, retail: 2, restaurant: 1.5, assembly: 1.5, hospital: 1.5, industry: 2, storage: 2, sport: 1.5, pool: 1.5,
} as const;
export type BuildingCategory = keyof typeof envelopeFactors;

/** Tabelle 11 / 12: Gesteinstypen with the recommended Rechenwerte λ [W/mK] and ρ·c [MJ/m³K]. */
export const rockTypes = {
  clayDry: [0.6, 1.5], claySat: [1.4, 2.3], sandDry: [0.5, 1.4], sandSat: [2.3, 2.4], gravelDry: [0.4, 1.4], gravelSat: [1.7, 2.3],
  moraine: [1.8, 2.0], peat: [0.4, 1.6], alsaceMolasse: [1.9, 2.2], septarianClay: [1.9, 2.2], claystone: [1.9, 2.2], sandstone: [2.3, 2.1],
  conglomerate: [2.6, 2.1], marl: [2.1, 2.2], limestone: [2.8, 2.2], gypsum: [1.6, 2.0], granite: [2.8, 2.4], diorite: [2.3, 2.7],
  gabbro: [2.0, 2.6], slate: [1.9, 2.3], marble: [1.9, 2.0], quartzite: [5.3, 2.1], micaSchist: [2.0, 2.3], gneiss: [2.6, 2.0],
  amphibolite: [2.6, 2.1],
  // Tabelle 12, Schweizer Molasse (ρ·c 2.1 after Tabelle 11)
  osmClaySilt: [2.3, 2.1], osmSilt: [2.3, 2.1], osmFineSand: [2.3, 2.1], osmMedSand: [2.6, 2.1], osmCoarse: [2.6, 2.1],
  ommClaySilt: [2.7, 2.1], ommSilt: [2.7, 2.1], ommFineSand: [2.9, 2.1], ommMedSand: [2.8, 2.1], ommCoarse: [2.7, 2.1],
  usmClaySilt: [2.3, 2.1], usmSilt: [2.4, 2.1], usmFineSand: [2.5, 2.1], usmMedSand: [2.9, 2.1], usmCoarse: [2.4, 2.1],
} as const satisfies Record<string, readonly [number, number]>;
export type RockType = keyof typeof rockTypes;

/**
 * Tabelle 14: Wärmeträger (density and kinematic viscosity at 0 °C, ΔV/V0 from 0 to 20 °C). The specific heat
 * capacity is not in the norm: typical manufacturer values at 0 °C (Clariant), editable in the input.
 */
export const brineMedia = {
  eg20: { rho: 1037, nu: 3.49, frost: -10.6, expansion: 0.0045, cp: 3.85 },
  eg25: { rho: 1046, nu: 4.05, frost: -13.6, expansion: 0.0051, cp: 3.78 },
  eg30: { rho: 1056, nu: 4.72, frost: -16.9, expansion: 0.0058, cp: 3.7 },
  pg25: { rho: 1032, nu: 5.97, frost: -10.1, expansion: 0.0076, cp: 3.95 },
  pg30: { rho: 1038, nu: 7.58, frost: -13.5, expansion: 0.0083, cp: 3.89 },
  pg35: { rho: 1044, nu: 9.65, frost: -18.5, expansion: 0.009, cp: 3.83 },
  water: { rho: 1000, nu: 1.5, frost: 0, expansion: 0.0016, cp: 4.2 },
  eth20: { rho: 978, nu: 4.64, frost: -7.8, expansion: 0.007, cp: 4.25 },
  eth25: { rho: 976, nu: 5.57, frost: -10.7, expansion: 0.0113, cp: 4.18 },
  eth30: { rho: 975, nu: 5.59, frost: -14.3, expansion: 0.0167, cp: 4.1 },
} as const;
export type BrineMedium = keyof typeof brineMedia;

/** PE pipes SDR 11 (outer × inner diameter [mm]) for the Zuleitungen and the Solekreisleitung (Figur 27). */
export const pePipes = [
  [32, 26], [40, 32.6], [50, 40.8], [63, 51.4], [75, 61.4], [90, 73.6], [110, 90], [125, 102.2],
] as const;
/** Inner diameter of the Duplex-EWS pipes (SDR 11) by nominal diameter (Figur 24). */
export const probeInner: Record<32 | 40, number> = { 32: 26, 40: 32.6 };
