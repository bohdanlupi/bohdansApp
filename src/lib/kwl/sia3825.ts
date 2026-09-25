// Calculations and limit values of SIA 382/5:2021 "Mechanische Lüftung in Wohngebäuden".
// Clause numbers in the comments refer to that norm. Air flows in m³/h, pressures in Pa.

import { findRoomType, type KwlRoom, sum } from "./calc";

// ---------------------------------------------------------------------------
// System types and project design criteria
// ---------------------------------------------------------------------------

export const systemTypes = ["balanced", "extract", "singleRoom", "compound", "reversing"] as const;
export type SystemType = (typeof systemTypes)[number];

export const fireplaceTypes = ["none", "roomAirDependent", "roomAirIndependent"] as const;
export type FireplaceType = (typeof fireplaceTypes)[number];

export const kitchenConcepts = ["window", "recirculationHood", "exhaustHood", "connectedHood"] as const;
export type KitchenConcept = (typeof kitchenConcepts)[number];

export const airtightnessClasses = ["newTarget", "renovationTarget", "limit"] as const;
export type AirtightnessClass = (typeof airtightnessClasses)[number];

// ---------------------------------------------------------------------------
// 5.2.4 / 5.2.5 Design air flows, 5.4.3 four-step method
// ---------------------------------------------------------------------------

/** Table 3: extract air flows when demand-controlled on/off (continuous values are in roomTypes). */
export const demandExtractFlows: Partial<Record<NonNullable<KwlRoom["type"]>, number>> = {
  kitchenClosed: 30,
  bath: 50,
  wc: 25,
  shortUse: 15,
};

export type FourSteps = {
  /** Step 1: minimum supply = 30 m³/h per room (Table 2). */
  supplyMin: number;
  supplyRooms: number;
  /** Step 2: minimum extract per Table 3. */
  extractMin: number;
  /** Step 3: the larger one, for both supply and extract. */
  governing: number;
  governingSide: "supply" | "extract";
  /** Step 4: equal supply per room with supply (without other agreement). */
  supplyPerRoom: number | null;
};

/** 5.4.3: design flows of a balanced system from the room types. */
export function fourSteps(rooms: KwlRoom[], demandControlled = false): FourSteps {
  const types = rooms.map((r) => findRoomType(r.type));
  const supplyRooms = types.filter((t) => t?.key === "room").length;
  const supplyMin = supplyRooms * 30;
  const extractMin = sum(
    types.map((t) => (t?.side === "extract" ? (demandControlled ? (demandExtractFlows[t.key] ?? t.norm) : t.norm) : 0)),
  );
  const governing = Math.max(supplyMin, extractMin);
  return {
    supplyMin,
    supplyRooms,
    extractMin,
    governing,
    governingSide: supplyMin >= extractMin ? "supply" : "extract",
    supplyPerRoom: supplyRooms ? governing / supplyRooms : null,
  };
}

/** Rough sizing (Vorprojekt) of a dwelling type from room counts. */
export function roughDwellingFlow(t: { rooms: number; baths: number; wcs: number; closedKitchen: boolean; shortUse: number }) {
  const supply = 30 * t.rooms;
  const extract = 30 * t.baths + 15 * t.wcs + (t.closedKitchen ? 20 : 0) + 10 * t.shortUse;
  return { supply, extract, governing: Math.max(supply, extract) };
}

/** 5.4.1.5: simultaneity for multi-dwelling units, 0.7 … 1.0 (1.0 within one dwelling, 5.4.1.4). */
export const simultaneityRange = [0.7, 1] as const;

// ---------------------------------------------------------------------------
// 5.2.3 Base ventilation, 5.2.6 ancillary rooms
// ---------------------------------------------------------------------------

/** 5.2.3.1: at least 0.1 h⁻¹ (≈ 0.25 m³/h per m²) in every room with supply and on average. */
export const baseAirChange = 0.1;
/** 5.2.3.2: first three months after completion of new buildings. */
export const newBuildingAirChange = 0.3;
/** 5.2.6.2: ancillary rooms without special requirements, 0.5 m³/h per m² (≥ 50 % operating time). */
export const ancillaryFlowPerArea = 0.5;

export const airChangeFlow = (areaM2: number, heightM: number, perHour: number) => areaM2 * heightM * perHour;

/** 5.2.5.2: run-on time after demand-controlled operation = room volume / supply flow [min]. */
export const runOnMinutes = (volumeM3: number, flow: number) => (flow > 0 ? (volumeM3 / flow) * 60 : null);

// ---------------------------------------------------------------------------
// 5.2.4.3–5 CO₂ check
// ---------------------------------------------------------------------------

/** CO₂ emission per person [l/h]: day 20, night 13.6; outdoor air 400 ppm. */
export const co2Emission = { day: 20, night: 13.6 };
export const co2Outdoor = 400;
/** 2.2.5.6: design target 1'000 … 1'400 ppm at normal occupancy. */
export const co2Target = [1000, 1400] as const;

/** Steady-state CO₂ concentration [ppm] in a room. */
export const co2Level = (persons: number, flow: number, period: "day" | "night") =>
  flow > 0 ? co2Outdoor + ((persons * co2Emission[period]) / 1000 / flow) * 1e6 : null;

// ---------------------------------------------------------------------------
// 5.4.2 Simple extract system
// ---------------------------------------------------------------------------

/** Table 5: infiltration factor f by airtightness class (q_a50 0.6 / 1.2 / 1.6 m³/(m²·h)). */
export const infiltrationFactors: Record<AirtightnessClass, { q50: number; f: number }> = {
  newTarget: { q50: 0.6, f: 1.3 },
  renovationTarget: { q50: 1.2, f: 1.5 },
  limit: { q50: 1.6, f: 1.7 },
};

/** 5.4.2.1.4/5: unknown airtightness – new buildings f = 1.3, renovations f = 1.5. */
export const defaultInfiltrationFactor = (renovation: boolean) => (renovation ? 1.5 : 1.3);

/** 5.4.2.3.2, formulas (2) and (3). */
export function extractSystem(supplyMin: number, extractMin: number, f: number) {
  const extract = Math.max(f * supplyMin, extractMin);
  return { extract, outdoorThroughAld: extract / f };
}

/** 5.4.2.2.1: design pressure drop of the outdoor air terminals (ALD), filter included. */
export const aldPressureDrop = { singleStorey: 4, twoStoreyUpper: 3, twoStoreyLower: 6 };

// ---------------------------------------------------------------------------
// 5.4.6 Compound ventilation, Table 6
// ---------------------------------------------------------------------------

/** [rooms (1 = "1 und 1½"), persons, supply x/y, transfer x/y]. */
export const compoundTable: [number, number, string, string][] = [
  [2, 1, "50/50", "50/60"],
  [2, 2, "72/60", "50/60"],
  [3, 2, "72/60", "50/60"],
  [3, 3, "108/90", "50/60"],
  [4, 3, "108/90", "50/60"],
  [4, 4, "144/120", "50/60"],
  [5, 4, "144/120", "50/60"],
  [5, 5, "180/150", "50/60"],
];

// ---------------------------------------------------------------------------
// 5.3.5 Transfer air terminals, door gaps (Figure 3)
// ---------------------------------------------------------------------------

/** Table 4: maximum pressure drop of transfer air terminals [Pa]. */
export const transferPressureLimit: Record<SystemType, number> = {
  balanced: 3,
  extract: 1,
  singleRoom: 3,
  compound: 3,
  reversing: 3,
};

/** 5.3.5.2.3: maximum velocity in the free gap cross-section. */
export const doorGapMaxVelocity = 1.5;
/** 5.3.5.2.4: above this gap height choose another transfer terminal. */
export const doorGapMaxHeight = 10;

// Figure 3 (smooth floor) is reproduced by an orifice with discharge coefficient 0.7:
// q = 0.7 · b · s · √(2·Δp/ρ), ρ = 1.2 kg/m³.
const doorCd = 0.7;
const rho = 1.2;

/** Air flow [m³/h] through a door gap of width [cm] and height [mm] at a pressure difference [Pa]. */
export const doorGapFlow = (widthCm: number, gapMm: number, dp: number) =>
  doorCd * (widthCm / 100) * (gapMm / 1000) * Math.sqrt((2 * dp) / rho) * 3600;

/** Gap height [mm] needed for a flow at a pressure difference. */
export const doorGapHeight = (flow: number, widthCm: number, dp: number) =>
  dp > 0 && widthCm > 0 ? (flow / 3600 / (doorCd * (widthCm / 100) * Math.sqrt((2 * dp) / rho))) * 1000 : null;

/** Velocity [m/s] in the gap. */
export const doorGapVelocity = (flow: number, widthCm: number, gapMm: number) =>
  widthCm > 0 && gapMm > 0 ? flow / 3600 / ((widthCm / 100) * (gapMm / 1000)) : null;

// ---------------------------------------------------------------------------
// 5.3.2 Outdoor / exhaust air terminals
// ---------------------------------------------------------------------------

/** 5.3.2.5: minimum height of outdoor air intakes [m]. */
export const intakeMinHeight = { public: 3, multiDwelling: 1.5 };
/** 5.3.2.6: grille 5 … 10 mm, face velocity ≤ 2 m/s (≤ 1.5 m/s in fog areas). */
export const intakeMaxVelocity = (fog: boolean) => (fog ? 1.5 : 2);
export const intakeVelocity = (flow: number, netAreaM2: number) => (netAreaM2 > 0 ? flow / 3600 / netAreaM2 : null);

/** 5.3.2.13: permitted leakage of closed dampers, q_v = 2.907 · Δp^0.57 [l/(s·m²)]. */
export const damperLeakageLimit = (dp: number) => 2.907 * dp ** 0.57;

// ---------------------------------------------------------------------------
// 5.5.1 Energy requirements of dwelling ventilation units (Table 7)
// ---------------------------------------------------------------------------

export const energyRequirements: Record<SystemType | "extractDemand", { energyClass: string; limit: number; target: number }> = {
  balanced: { energyClass: "A", limit: 150, target: 100 },
  singleRoom: { energyClass: "A", limit: 0, target: 0 },
  compound: { energyClass: "A", limit: 150, target: 100 },
  reversing: { energyClass: "A", limit: 0, target: 0 },
  extract: { energyClass: "C", limit: 70, target: 50 },
  extractDemand: { energyClass: "C", limit: 100, target: 70 },
};

export function externalPressureCheck(
  system: SystemType,
  demandControlled: boolean,
  totalDrop: number | null,
): { energyClass: string; limit: number; target: number; status: null | "target" | "limit" | "exceeded" } {
  const req = energyRequirements[system === "extract" && demandControlled ? "extractDemand" : system];
  if (totalDrop === null || req.limit === 0) return { ...req, status: null };
  return { ...req, status: totalDrop <= req.target ? "target" : totalDrop <= req.limit ? "limit" : "exceeded" };
}

/** Annex G: device under VO (EU) 1253/2014 and 1254/2014 (Wohnraumlüftungsanlage). */
export function euRegulation(nominalFlow: number, powerPerFan: number, declaredResidential: boolean) {
  const eco = powerPerFan >= 30;
  if (nominalFlow <= 250) return { ecodesign: eco, label: true };
  if (nominalFlow < 1000) return { ecodesign: eco, label: declaredResidential };
  return { ecodesign: eco, label: false };
}

// ---------------------------------------------------------------------------
// 2.2.6 Humidity, 2.4.2 / 4.4.5 pressure limits
// ---------------------------------------------------------------------------

/** 2.2.6.1: lower relative humidity limit [%] by altitude (30 % up to 800 m, −1 % per 100 m). */
export const humidityLimit = (altitude: number) => (altitude <= 800 ? 30 : Math.max(0, 30 - (altitude - 800) / 100));

/** Maximum under-pressure in the dwelling [Pa]. */
export const underPressureLimit: Record<FireplaceType, number | null> = {
  none: null,
  roomAirDependent: 4,
  roomAirIndependent: 8,
};
/** 4.3.4: frost protection may not cause more than 5 Pa (without fireplace); unknown envelope → max. 30 % supply reduction. */
export const frostImbalanceLimit = { pressure: 5, supplyReduction: 0.3 };
/** 4.4.4.5.2: extract from other terminals may be reduced by up to 70 % while the hood runs. */
export const hoodExtractReduction = 0.7;
/** Figure 1: pressure limits in the dwelling [Pa]. */
export const pressureProfile = {
  balanced: { overpressure: 3, underpressure: 3 },
  extract: [4, 5, 6],
};

// ---------------------------------------------------------------------------
// 2.2.7 Acoustics (Table 1, Annex C)
// ---------------------------------------------------------------------------

export const noiseLevels = ["minimum", "increased"] as const;
export type NoiseLevel = (typeof noiseLevels)[number];

/** Table 1 and 2.2.7.4: requirement L_H [dB] for continuous noise of ventilation. */
export function noiseRequirement(
  roomType: KwlRoom["type"],
  level: NoiseLevel,
  opts: { volumeM3?: number | null; demandControlled?: boolean } = {},
): number | null {
  const type = findRoomType(roomType);
  // Storage and similar rooms are not listed in Table 1.
  if (!type || type.key === "shortUse" || type.key === "dwelling") return null;
  const wet = type.key === "bath" || type.key === "wc";
  if (wet && opts.volumeM3 != null && opts.volumeM3 < 25) return opts.demandControlled ? 43 : 38;
  const low = wet || type.key === "kitchenClosed";
  const minimum = low ? 33 : 28;
  return level === "increased" ? Math.max(25, minimum - 4) : minimum;
}

/** Annex C formula (6): design value of the A-weighted level L_Aeq ≤ L_H − K1 − K2 − K3 − K_P. */
export const designNoiseLevel = (lh: number, k: { k1: number; k2: number; k3: number; kp: number }) => lh - k.k1 - k.k2 - k.k3 - k.kp;
/** Annex C formula (8): measured total L_H,tot = L_Aeq + K1 + K2 + K3. */
export const measuredNoiseTotal = (laeq: number, k: { k1: number; k2: number; k3: number }) => laeq + k.k1 + k.k2 + k.k3;
export const defaultNoiseCorrections = { k1: -2, k2: 2, k3: 0, kp: 2 };

// ---------------------------------------------------------------------------
// 4.3 / Annex D Frost protection of the heat recovery (Table 8)
// ---------------------------------------------------------------------------

export const frostVariants = [
  { code: "S", status: "suitable" },
  { code: "E1", status: "notAllowed" },
  { code: "E3", status: "suitable" },
  { code: "E4", status: "suitable" },
  { code: "L1a", status: "possible" },
  { code: "L1b", status: "notAllowed" },
  { code: "L2a", status: "possible" },
  { code: "L2b", status: "possible" },
  { code: "B2", status: "suitable" },
  { code: "XW2", status: "suitable" },
  { code: "XB1", status: "suitable" },
  { code: "XG", status: "suitable" },
  { code: "M", status: "possible" },
] as const;
export type FrostCode = (typeof frostVariants)[number]["code"];

// ---------------------------------------------------------------------------
// 5.3.6 Filters, 7 Operation
// ---------------------------------------------------------------------------

/** 5.3.6.6: maximum service life of supply filters [years]. */
export const filterLife = { firstStage: 1, secondStage: 2 };
/** 6.3.2: measured total supply and extract may differ by at most 10 %. */
export const balanceTolerance = 0.1;

export const balanceDeviation = (supply: number, extract: number) =>
  supply > 0 && extract > 0 ? Math.abs(supply - extract) / Math.max(supply, extract) : null;

/** Annual fan energy [kWh/a] from SPI [W per m³/h], flow and operating hours. */
export const fanEnergy = (spi: number, flow: number, hours = 8760) => (spi * flow * hours) / 1000;
