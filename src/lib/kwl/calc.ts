// Kontrollierte Wohnungslüftung (KWL): calculations of the LUPI dimensioning workbook
// (Berechnungsvorlagen/2026-XXX_L_DimTool-Lupi.xlsm), as pure functions.
// Air flows in m³/h, pressures in Pa, areas in m², lengths in mm unless noted.

import type { FanStage, KwlDevice } from "./devices";

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
  area: number | null;
  /** Nominal air flows chosen by the planner ("eingesetzt"). */
  supply: number | null;
  extract: number | null;
};

/** Excel MROUND for positive values. */
const mround = (value: number, multiple: number) => Math.round(value / multiple) * multiple;

/** Minimum air flow of a dwelling (stage I): 0.25 m³/h per m², rounded to 5, at least 50 m³/h. */
export const minimumFlow = (area: number) => Math.max(50, mround(area * 0.25, 5));

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
 * Per-room recommended, minimum and party flows. Minimum and party totals are distributed
 * in proportion to the nominal flow of each room (like the workbook).
 */
export function airFlows(rooms: KwlRoom[], partyFlow: number | null): { rows: RoomRow[]; summary: AirFlowSummary } {
  const area = sum(rooms.map((r) => r.area));
  const supply = sum(rooms.map((r) => r.supply));
  const extract = sum(rooms.map((r) => r.extract));
  const minTotal = minimumFlow(area);
  const share = (total: number | null, own: number | null, all: number) =>
    total !== null && own && all ? (total / all) * own : null;

  const rows = rooms.map((room): RoomRow => {
    const type = findRoomType(room.type);
    return {
      ...room,
      recommendedSupply: type ? (type.side === "supply" ? type.norm : 0) : null,
      recommendedExtract: type ? (type.side === "extract" ? type.norm : 0) : null,
      minSupply: share(minTotal, room.supply, supply),
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
// Device: operating points on the fan curves, stage for the nominal flow, SPI
// ---------------------------------------------------------------------------

export const fanPressure = (stage: FanStage, flow: number) => stage.a * flow * flow + stage.b * flow + stage.c;

/** Pressure of the system curve p = k·V², through the nominal point (flow, pressure drop). */
export const systemCoefficient = (nominalFlow: number, pressureDrop: number) => pressureDrop / (nominalFlow * nominalFlow);

/** Intersection of system curve k·V² and fan curve a·V² + b·V + c (the positive root), or 0. */
export function operatingFlow(stage: FanStage, k: number): number {
  const A = k - stage.a;
  if (stage.c <= 0) return 0;
  if (Math.abs(A) < 1e-12) return stage.b < 0 ? stage.c / -stage.b : 0;
  const disc = stage.b * stage.b + 4 * A * stage.c;
  if (disc < 0) return 0;
  const root = (stage.b + Math.sqrt(disc)) / (2 * A);
  return root > 0 ? root : 0;
}

export type OperatingPoint = { stage: number; flow: number; pressure: number; power: number | null };

export type SideResult = {
  nominalFlow: number;
  pressureDrop: number;
  k: number;
  /** Highest stage first. */
  points: OperatingPoint[];
  /** Lowest stage whose operating point reaches the nominal flow; null when the device is too small. */
  nominalStage: OperatingPoint | null;
  /** Operating point of the highest stage (party / intensive ventilation). */
  maxPoint: OperatingPoint;
  /** Power at the nominal stage divided by the nominal flow [W per m³/h]. */
  spi: number | null;
};

export function analyseSide(device: KwlDevice, nominalFlow: number, pressureDrop: number): SideResult | null {
  if (!(nominalFlow > 0) || !(pressureDrop > 0)) return null;
  const k = systemCoefficient(nominalFlow, pressureDrop);
  const points = device.stages.map((stage) => {
    const flow = operatingFlow(stage, k);
    return { stage: stage.stage, flow, pressure: k * flow * flow, power: stage.power };
  });
  // The workbook takes the first stage (from the lowest) whose operating flow is above the nominal flow.
  const nominalStage = [...points].reverse().find((p) => p.flow > nominalFlow) ?? null;
  const spi = nominalStage?.power != null ? nominalStage.power / nominalFlow : null;
  return { nominalFlow, pressureDrop, k, points, nominalStage, maxPoint: points[0], spi };
}

/** SIA 382/1 Absatz 5.7.5.1 – specific power of dwelling ventilation units [W per m³/h]. */
export const spiLimit = 0.35;
export const spiTarget = 0.28;

export type DeviceResult = {
  supply: SideResult | null;
  extract: SideResult | null;
  /** Party flow per side = min of both highest-stage operating points. */
  partyFlow: number | null;
  spi: number | null;
  /** SPI comes from the power entered by hand rather than the device's stage data. */
  spiFromInput: boolean;
};

/**
 * Both sides of a device. `powerInput` (W at nominal operation) overrides the stage power table;
 * then SPI = power / larger nominal flow.
 */
export function analyseDevice(
  device: KwlDevice | null,
  supplyFlow: number,
  extractFlow: number,
  supplyDrop: number | null,
  extractDrop: number | null,
  powerInput: number | null,
): DeviceResult {
  const supply = device ? analyseSide(device, supplyFlow, supplyDrop ?? 0) : null;
  const extract = device ? analyseSide(device, extractFlow, extractDrop ?? 0) : null;
  const partyFlow = supply && extract ? Math.min(supply.maxPoint.flow, extract.maxPoint.flow) : null;
  const largerFlow = Math.max(supplyFlow, extractFlow);

  if (powerInput !== null && powerInput > 0 && largerFlow > 0) {
    return { supply, extract, partyFlow, spi: powerInput / largerFlow, spiFromInput: true };
  }
  const values = [supply?.spi, extract?.spi].filter((v): v is number => v != null);
  return { supply, extract, partyFlow, spi: values.length ? Math.max(...values) : null, spiFromInput: false };
}

/** Polylines for the fan diagram (in data coordinates). */
export function fanChart(device: KwlDevice, side: SideResult | null, samples = 48) {
  const clip = (points: [number, number][]) => points.filter(([, p]) => p >= 0 && p <= device.yMax * 1.02);
  const curves = device.stages.map((stage) => {
    const points: [number, number][] = [];
    for (let i = 0; i <= samples; i++) {
      const flow = (device.xMax * i) / samples;
      const p = fanPressure(stage, flow);
      points.push([flow, p]);
      if (p < 0) break;
    }
    return { stage: stage.stage, points: clip(points.map(([v, p]) => [v, Math.max(p, 0)])) };
  });
  const system: [number, number][] = [];
  if (side) {
    for (let i = 0; i <= samples; i++) {
      const flow = (device.xMax * i) / samples;
      const p = side.k * flow * flow;
      if (p > device.yMax) {
        system.push([Math.sqrt(device.yMax / side.k), device.yMax]);
        break;
      }
      system.push([flow, p]);
    }
  }
  return { curves, system };
}

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

/** Maximum air velocity [m/s] in the relevant duct run, by air flow ("bis" = up to and including). */
export const velocityLimits: Record<BuildingStandard, [upTo: number, velocity: number][]> = {
  standard: [
    [40, 2.5],
    [1000, 3],
    [2000, 4],
    [4000, 5],
    [10000, 6],
    [Infinity, 7],
  ],
  minergie: [
    [40, 2.5],
    [1000, 2.5],
  ],
};

export function maxVelocity(flow: number, standard: BuildingStandard): number {
  const limits = velocityLimits[standard];
  const hit = limits.find(([upTo]) => flow <= upTo) ?? velocityLimits.standard.find(([upTo]) => flow <= upTo)!;
  return hit[1];
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
// Duct insulation (diagram insulation thickness vs. duct length)
// ---------------------------------------------------------------------------

export const insulationDeltas = [5, 10, 15] as const;
export type InsulationDelta = (typeof insulationDeltas)[number];

/** Insulation thickness [mm] by temperature difference air – surroundings [K] and duct length [m]. */
export function insulationThickness(delta: InsulationDelta, lengthM: number): number {
  const ramp = (from: number, to: number, max: number) =>
    lengthM <= from ? 30 : lengthM >= to ? max : 30 + ((max - 30) * (lengthM - from)) / (to - from);
  if (delta === 5) return 30;
  if (delta === 10) return ramp(3, 6, 60);
  return ramp(2.5, 6, 100);
}

/** Minimum efficiency of the heat recovery. */
export const heatRecoveryMinimum = { standard: 0.7, minergie: 0.8 };
