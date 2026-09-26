// Kontrollierte Wohnungslüftung (KWL): calculations of the LUPI dimensioning workbook
// (Berechnungsvorlagen/Lüftung KWL/2026-XXX_L_DimTool-Lupi.xlsm), as pure functions, corrected where the
// workbook conflicts with SIA 382/5:2021 or the EnDK aid EN-105 (2018).
// Air flows in m³/h, pressures in Pa, areas in m², lengths in mm unless noted.


// ---------------------------------------------------------------------------
// Room types and design air flows (SIA 382/5, Tabellen 2 + 3)
// ---------------------------------------------------------------------------

export const roomTypes = [
  // norm = design flow in continuous operation per SIA 382/5; lupi = value LUPI plans with (comfort).
  { key: "room", code: "1.1", side: "supply", norm: 30, lupi: 30 },
  { key: "passage", code: "1.2", side: "supply", norm: 0, lupi: 0 },
  { key: "kitchenOpen", code: "2.1", side: "extract", norm: 0, lupi: 40 },
  { key: "kitchenClosed", code: "2.2", side: "extract", norm: 20, lupi: 40 },
  { key: "bath", code: "2.3", side: "extract", norm: 30, lupi: 30 },
  { key: "wc", code: "2.4", side: "extract", norm: 15, lupi: 15 },
  { key: "shortUse", code: "2.5", side: "extract", norm: 10, lupi: 10 },
  { key: "dwelling", code: "2.6", side: "extract", norm: 50, lupi: 50 },
] as const;

export type RoomTypeKey = (typeof roomTypes)[number]["key"];
export const roomTypeKeys = roomTypes.map((r) => r.key) as [RoomTypeKey, ...RoomTypeKey[]];
export const findRoomType = (key: string | null | undefined) => roomTypes.find((r) => r.key === key) ?? null;

export type KwlRoom = {
  id: string;
  number: string;
  name: string;
  type: RoomTypeKey | null;
  /** Storey, e.g. UG, EG, OG, DG. */
  floor: string;
  area: number | null;
  /** Nominal air flows chosen by the planner ("eingesetzt"). */
  supply: number | null;
  extract: number | null;
};

/** SIA 382/5 5.2.3.1: base ventilation at least 0.1 h⁻¹ (≈ 0.25 m³/h per m² net floor area). */
export const baseAirChangeRate = 0.1;

/**
 * Minimum (base ventilation) flows per SIA 382/5 5.2.3.1 / 5.2.3.3: 0.1 h⁻¹ in every room with supply air and as
 * the average over the whole dwelling. Supply rooms get their own 0.1 h⁻¹, raised proportionally when the dwelling
 * average is higher; the extract side is balanced to the same total, split like the nominal extract flows.
 * (The workbook used 0.25 m³/h per m² for the whole dwelling, at least 50 m³/h – the 50 m³/h is the Table 3 extract
 * value for a whole dwelling unit, not a minimum stage.)
 */
export function baseVentilation(rooms: KwlRoom[], heightM: number) {
  const area = sum(rooms.map((r) => r.area));
  const dwelling = area * heightM * baseAirChangeRate;
  const supplyRooms = rooms.filter((r) => (r.supply ?? 0) > 0);
  const roomMin = new Map(supplyRooms.map((r) => [r.id, (r.area ?? 0) * heightM * baseAirChangeRate]));
  const roomSum = sum([...roomMin.values()]);
  const total = Math.max(roomSum, dwelling);
  const supplyTotal = sum(supplyRooms.map((r) => r.supply));
  const perRoom = (r: KwlRoom) =>
    !r.supply ? null : roomSum > 0 ? (roomMin.get(r.id)! * total) / roomSum : supplyTotal ? (total * r.supply) / supplyTotal : null;
  return { dwelling, total, perRoom };
}

export const sum = (values: (number | null | undefined)[]) => values.reduce<number>((s, v) => s + (v ?? 0), 0);

export type RoomRow = KwlRoom & {
  recommendedSupply: number | null;
  recommendedExtract: number | null;
  minSupply: number | null;
  minExtract: number | null;
  partySupply: number | null;
  partyExtract: number | null;
};

export type AirFlowSummary = {
  area: number;
  recommendedSupply: number;
  recommendedExtract: number;
  supply: number;
  extract: number;
  minSupply: number;
  minExtract: number;
  /** Supply minus extract; the smaller side should be raised to the larger one. */
  imbalance: number;
};

/**
 * Per-room recommended, minimum (base ventilation) and party flows. Party flows are distributed in proportion
 * to the nominal flow of each room (like the workbook).
 */
export function airFlows(rooms: KwlRoom[], partyFlow: number | null, heightM = 2.5): { rows: RoomRow[]; summary: AirFlowSummary } {
  const area = sum(rooms.map((r) => r.area));
  const supply = sum(rooms.map((r) => r.supply));
  const extract = sum(rooms.map((r) => r.extract));
  const base = baseVentilation(rooms, heightM);
  const minTotal = base.total;
  const share = (total: number | null, own: number | null, all: number) =>
    total !== null && own && all ? (total / all) * own : null;

  const rows = rooms.map((room): RoomRow => {
    const type = findRoomType(room.type);
    return {
      ...room,
      recommendedSupply: type ? (type.side === "supply" ? type.norm : 0) : null,
      recommendedExtract: type ? (type.side === "extract" ? type.norm : 0) : null,
      minSupply: base.perRoom(room),
      minExtract: share(minTotal, room.extract, extract),
      partySupply: share(partyFlow, room.supply, supply),
      partyExtract: share(partyFlow, room.extract, extract),
    };
  });

  return {
    rows,
    summary: {
      area,
      recommendedSupply: sum(rows.map((r) => r.recommendedSupply)),
      recommendedExtract: sum(rows.map((r) => r.recommendedExtract)),
      supply,
      extract,
      minSupply: minTotal,
      minExtract: minTotal,
      imbalance: supply - extract,
    },
  };
}

// ---------------------------------------------------------------------------
// Device: SPI limits (operating points: device-operation.ts, Zehnder datasheets)
// ---------------------------------------------------------------------------

/** SIA 382/1 Absatz 5.7.5.1 – specific power of dwelling ventilation units [W per m³/h]. */
export const spiLimit = 0.35;
export const spiTarget = 0.28;



// ---------------------------------------------------------------------------
// Filters (SIA 382/1:2014, Tabellen 4 + 8; ISO 16890)
// ---------------------------------------------------------------------------

export const trafficOptions = [
  { key: "airport", points: 4 },
  { key: "motorway", points: 3 },
  { key: "mainRoad", points: 2 },
  { key: "moderate", points: 2 },
  { key: "none", points: 1 },
] as const;

export const settlementOptions = [
  { key: "city", points: 4 },
  { key: "town", points: 3 },
  { key: "village", points: 2 },
  { key: "hamlet", points: 1 },
  { key: "rural", points: 1 },
] as const;

export type TrafficKey = (typeof trafficOptions)[number]["key"];
export type SettlementKey = (typeof settlementOptions)[number]["key"];

export const odaClasses = ["ODA 1", "ODA 2", "ODA 3"] as const;
export const idaClasses = ["IDA 1", "IDA 2", "IDA 3", "IDA 4"] as const;
export type OdaClass = (typeof odaClasses)[number];
export type IdaClass = (typeof idaClasses)[number];

/** Outdoor air class from the points for traffic and settlement: < 3 ODA 1, < 5 ODA 2, else ODA 3. */
export function outdoorAirClass(traffic: TrafficKey | null, settlement: SettlementKey | null): OdaClass | null {
  const points =
    (trafficOptions.find((o) => o.key === traffic)?.points ?? 0) + (settlementOptions.find((o) => o.key === settlement)?.points ?? 0);
  if (points === 0) return null;
  return points < 3 ? "ODA 1" : points < 5 ? "ODA 2" : "ODA 3";
}

const coarse = "ISO ePM10 50% + ISO ePM1 50%";
/** Filter stages outdoor air → supply air, by ODA (rows) and IDA (columns). */
export const supplyFilterMatrix: Record<OdaClass, Record<IdaClass, string>> = {
  "ODA 1": { "IDA 1": coarse, "IDA 2": "ISO ePM1 50%", "IDA 3": "ISO ePM1 50%", "IDA 4": "ISO ePM1 50%" },
  "ODA 2": { "IDA 1": "ISO ePM2.5 65% + ISO ePM1 50%", "IDA 2": coarse, "IDA 3": coarse, "IDA 4": coarse },
  "ODA 3": { "IDA 1": "ISO ePM1 50% + ISO ePM1 80%", "IDA 2": "ISO ePM2.5 65% + ISO ePM1 50%", "IDA 3": coarse, "IDA 4": coarse },
};

/** Extract air: at least ISO coarse 80% (G4) per SIA 382/5 5.3.6.5.2; ISO ePM10 50% recommended. */
export const extractFilterMinimum = "ISO coarse 80%";
export const extractFilterRecommended = "ISO ePM10 50%";

/** Former EN 779 classes and their approximate ISO 16890 equivalent. */
export const formerFilterClasses: [string, string][] = [
  ["G1", "ISO coarse <35%"],
  ["G2", "ISO coarse 35-50%"],
  ["G3", "ISO coarse 45-65%"],
  ["G4", "ISO coarse 60-95%"],
  ["M5", "ISO ePM10 50-70%"],
  ["M6", "ISO ePM2.5 50-60%"],
  ["F7", "ISO ePM1 50-65%"],
  ["F8", "ISO ePM1 70-90%"],
  ["F9", "ISO ePM1 80-95%"],
];

// ---------------------------------------------------------------------------
// Ducts: velocities and diameters
// ---------------------------------------------------------------------------

export type BuildingStandard = "standard" | "minergie";

/**
 * EN-105 5.1 (= SIA 382/1 5.7.2.6/7): maximum air velocity [m/s] in the duct run with the largest pressure drop,
 * by air flow ("bis" = up to and including). In devices at most 2 m/s on the net area.
 */
export const velocityLimits: [upTo: number, velocity: number][] = [
  [1000, 3],
  [2000, 4],
  [4000, 5],
  [10000, 6],
  [Infinity, 7],
];
export const deviceMaxVelocity = 2;

/**
 * Lower design velocities of the LUPI workbook (not in SIA 382/5 / EN-105): 2.5 m/s in connection ducts up to
 * 40 m³/h, and 2.5 m/s up to 1'000 m³/h for Minergie.
 */
export const recommendedVelocities: Record<BuildingStandard, [upTo: number, velocity: number][]> = {
  standard: [[40, 2.5]],
  minergie: [[1000, 2.5]],
};

/** Legal maximum per EN-105. */
export const maxVelocity = (flow: number) => velocityLimits.find(([upTo]) => flow <= upTo)![1];

/** Design velocity: the workbook recommendation where lower, else the EN-105 maximum. */
export function designVelocity(flow: number, standard: BuildingStandard): number {
  const recommended = recommendedVelocities[standard].find(([upTo]) => flow <= upTo)?.[1];
  return Math.min(maxVelocity(flow), recommended ?? Infinity);
}

/** Inner diameter [mm] needed for a flow at a velocity. */
export const requiredDiameter = (flow: number, velocity: number) => Math.sqrt((flow / 3600) * 4 / (velocity * Math.PI)) * 1000;

/** Flow [m³/h] through an inner diameter [mm] at a velocity. */
export const ductFlow = (innerDiameter: number, velocity: number) => ((innerDiameter / 1000) ** 2 * Math.PI) / 4 * velocity * 3600;

export const ductSystems = [
  {
    key: "comfoTube",
    name: "ComfoTube",
    sizes: [
      [50, 40],
      [75, 61],
      [90, 74],
      [110, 93],
      [125, 110],
      [140, 122],
      [160, 142],
    ],
  },
  {
    key: "comfoPipe",
    name: "ComfoPipe",
    sizes: [
      [180, 150],
      [210, 180],
    ],
  },
  {
    key: "spiro",
    name: "Spiro",
    sizes: [80, 100, 125, 150, 160, 180, 200, 224, 250].map((d) => [d, d]),
  },
] as const satisfies { key: string; name: string; sizes: (readonly [outer: number, inner: number])[] }[];

/** Suggested air terminal and ducts per room (Luftverteilung sketch of the workbook); null above 60 m³/h. */
export function roomDistribution(flow: number | null, side: "supply" | "extract"): { terminal: string; ducts: string } | null {
  if (!flow || flow <= 0 || flow > 60) return null;
  if (flow < 38) return { terminal: side === "supply" ? "CLD breit" : "CSB-P 400", ducts: "1× ComfoTube 90" };
  return { terminal: side === "supply" ? "CLD" : "CSB-P 600", ducts: "2× ComfoTube 90 / 1× ComfoTube 110" };
}

// ---------------------------------------------------------------------------
// Overflow through doors (air velocity 2 m/s in the gap)
// ---------------------------------------------------------------------------

export const doorWidths = [80, 85, 90, 95, 100] as const;
export const grilleHeights = [100, 200] as const;

const ceil = (value: number) => Math.ceil(value - 1e-9);
const ceilTo100 = (value: number) => ceil(value / 100) * 100;

/** Free cross-section [cm²] for an overflow flow at 2 m/s. */
export const overflowArea = (flow: number) => ceil((flow / 3600 / 2) * 10000);

/** Width [mm] of an overflow grille (e.g. Trox Hesco DG13, 55 % free area) of the given height, at least 200 mm. */
export const grilleWidth = (area: number, heightMm: number) => Math.max(200, ceilTo100((area * 100) / 0.55 / heightMm));

/** Maximum pressure drop of overflow air terminals [Pa]. */
export const overflowPressureLimits = [
  { key: "balanced", pa: 3 },
  { key: "extractOnly", pa: 1 },
  { key: "singleRoomClassified", pa: 3 },
  { key: "singleRoomUnclassified", pa: 2 },
] as const;

// ---------------------------------------------------------------------------
// Distance between outdoor air intake (AUL) and exhaust air outlet (FOL)
// ---------------------------------------------------------------------------

/** Up to this flow the diagram applies; above it SIA 382/1 Fig. 9. */
export const exhaustDiagramMaxFlow = 1800;

/**
 * Minimum horizontal distance [m] at vertical distance 0, read off the diagram (d = 3.45 m at 1'800 m³/h,
 * proportional to √V). With the outlet above the intake, every metre of height saves one metre; below,
 * two metres of height save one metre.
 */
export const exhaustBaseDistance = (flow: number) => (3.45 / Math.sqrt(exhaustDiagramMaxFlow)) * Math.sqrt(Math.max(flow, 0));

export function exhaustDistance(flow: number, position: "above" | "below", verticalM: number) {
  const base = exhaustBaseDistance(flow);
  const h = Math.abs(verticalM);
  const horizontal = Math.max(0, base - (position === "above" ? h : h / 2));
  // Vertical distance that alone would be enough (horizontal 0).
  const verticalOnly = position === "above" ? base : base * 2;
  return { base, horizontal, verticalOnly };
}

// ---------------------------------------------------------------------------
// Duct insulation: EN-105 Table 1 (= SIA 382/1:2014 Table 23) and Figure 1 (small systems)
// ---------------------------------------------------------------------------

export const ductAirs = ["outdoorExhaust", "supplyExtract"] as const;
export type DuctAir = (typeof ductAirs)[number];
export const ductLocations = ["inside", "closedOutside", "open"] as const;
export type DuctLocation = (typeof ductLocations)[number];

/**
 * Minimum insulation [mm] for λ 0.03 … 0.05 W/(m·K). AUL/FOL inside the thermal envelope 100 mm (60 mm with ground
 * heat exchanger or other preheating before the heat recovery); ZUL/ABL inside by temperature difference medium –
 * surroundings in the design case: < 5 K 0, 5 … < 10 K 30, 10 … < 15 K 60, ≥ 15 K 100 mm.
 */
export function insulationRequirement(air: DuctAir, location: DuctLocation, deltaK: number, preheated = false): number {
  if (air === "outdoorExhaust") return location === "inside" ? (preheated ? 60 : 100) : location === "closedOutside" ? 30 : 0;
  if (location === "closedOutside") return 60;
  if (location === "open") return 100;
  return deltaK < 5 ? 0 : deltaK < 10 ? 30 : deltaK < 15 ? 60 : 100;
}

/** EN-105 Figure 1: small systems may reduce the thickness for ducts shorter than 6 m. */
export const smallSystemLimits = { maxFlow: 220, maxLengthM: 6, minTemp: 15, maxTemp: 30 };

/** Reduced thickness [mm] by duct length (Figure 1): 100 → 30 mm up to 2.5 m, 60 → 30 mm up to 3 m, linear to 6 m. */
export function reducedInsulation(requiredMm: number, lengthM: number): number {
  if (lengthM >= smallSystemLimits.maxLengthM || requiredMm <= 30) return requiredMm;
  const from = requiredMm >= 100 ? 2.5 : 3;
  return lengthM <= from ? 30 : 30 + ((requiredMm - 30) * (lengthM - from)) / (smallSystemLimits.maxLengthM - from);
}

/**
 * Heat recovery targets of the LUPI workbook (temperature ratio). Not in SIA 382/5 / EN-105: those require heat
 * recovery for systems with outdoor and exhaust air, efficiency per EnEV (VO (EU) 1253/2014) or SIA 382/1 5.10.
 */
export const heatRecoveryMinimum = { standard: 0.7, minergie: 0.8 };
