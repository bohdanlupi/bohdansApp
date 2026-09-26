// Floor heating (HAKA.GERODUR Nass-System) after the HAKA planning guide and worksheet A: heating group temperatures
// from the most demanding room, per room edge zone, inner zone spacing, installed output, downward loss (Tab. C),
// mass flow, pipe length and pressure loss per ring (Tab. D). Where the guide's Excel deviates, the guide is used:
// pipe length includes the edge zone, the downward loss is computed, the mass flow always. Tab. D is used as drawn
// (17/13 at 100 kg/h: 58 Pa/m; the guide text says 64 Pa/m).

import { hakaData } from "./haka-data";

type Polyline = readonly (readonly [number, number])[];

export const floorSpacings = hakaData.spacings as readonly number[];
export const coveringCharts = hakaData.coveringResistances as readonly number[];
export const insulationThicknesses = [20, 30, 40, 50, 60] as const;
export const floorPipes = hakaData.pipes.filter((p) => p.da <= 20).map((p) => p.pipe);

/** Surface temperature limits as specific output [W/m²]: 28 °C occupied zone, 30 °C bathrooms (charts B1–B9). */
export const surfaceLimit = { occupied: hakaData.surfaceLimits["28"], bath: hakaData.surfaceLimits["30"] };
export const specificLoadLimit = 80;
const cWater = 1.163;
/** Chart reading tolerance [W/m²] (the guide reads 49.8 as 50). */
const tolerance = 0.5;

/** Chart for a covering resistance: the next higher Rλ (conservative), null above 0.20 m²K/W. */
export function coveringChart(r: number): number | null {
  return coveringCharts.find((c) => c >= r - 1e-9) ?? null;
}

const interpolate = (line: Polyline, x: number) => {
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1];
    const [x1, y1] = line[i];
    if (x <= x1 || i === line.length - 1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return 0;
};
const inverse = (line: Polyline, y: number) =>
  interpolate(
    line.map(([a, b]) => [b, a] as const),
    y,
  );

const curve = (chart: number, spacing: number) =>
  (hakaData.heatOutput as unknown as Record<string, Record<string, Polyline>>)[String(chart)][String(spacing)];

/** Specific heat output q [W/m²] at the mean over-temperature Δθ (Tab. B). */
export const heatOutput = (chart: number, spacing: number, dTheta: number) => Math.max(interpolate(curve(chart, spacing), dTheta), 0);

/** Over-temperature Δθ [K] needed for q (inverse of Tab. B). */
export const overTemperature = (chart: number, spacing: number, q: number) => inverse(curve(chart, spacing), q);

/** Downward loss [W/m²] (Tab. C) for the spacing, tmH − tu and the insulation thickness. */
export function downwardLoss(spacing: number, dTheta: number, insulation: number) {
  const k = (hakaData.downwardK as Record<string, number>)[String(spacing)] ?? 0;
  const f = (hakaData.insulationFactor as Record<string, number>)[String(insulation)] ?? 1;
  return Math.max(dTheta, 0) * k * f;
}

/** Pressure gradient R [Pa/m] of a pipe at the mass flow m [kg/h] (Tab. D). */
export function pressureGradient(pipe: string, massFlow: number) {
  const p = hakaData.pipes.find((x) => x.pipe === pipe);
  return p && massFlow > 0 ? (massFlow / p.a) ** (1 / p.b) : 0;
}

// ---------------------------------------------------------------------------
// Input model
// ---------------------------------------------------------------------------

export type FloorRoom = {
  id: string;
  /** Link to a room of a heat load calculation (Konzepte); null = manual room. */
  calcId: string | null;
  roomId: string | null;
  name: string;
  /** Manual values or overrides of the linked room: Qh without the floor loss [W], area [m²], θ [°C]. */
  load: number | null;
  area: number | null;
  roomTemp: number | null;
  /** Covering resistance Rλ [m²K/W] (Tab. E). */
  covering: number | null;
  /** Edge zone area A_R [m²] (5 cm spacing). */
  edgeArea: number | null;
  /** Permanent gain from the ceiling or internal gains Q_D [W]. */
  gain: number | null;
  /** Temperature of the space below tu [°C]; null = from the heat load (floor element). */
  belowTemp: number | null;
  /** Length of supply and return between distributor and room L2 [m]. */
  supplyLength: number | null;
  /** Number of rings; null = as needed for the maximum ring length. */
  rings: number | null;
  spacingOverride: number | null;
  /** Bathroom or subordinate room: surface up to 30 °C. */
  bath: boolean;
};

export type FloorDistributor = { id: string; name: string; rooms: FloorRoom[] };

export type FloorSystemData = {
  calcIds: string[];
  /** Spread Δt = tv − tr [K]. */
  spread: number;
  pipe: string;
  /** Spacing of the most demanding room used to fix the group temperature [cm]. */
  designSpacing: number;
  /** Fixed flow temperature tv [°C]; null = from the most demanding room. */
  flowOverride: number | null;
  insulation: number;
  /** Maximum ring length [m] (not given by HAKA; LUPI value). */
  maxRingLength: number;
  /** Distributor, regulating and shut-off valves per ring [Pa] (manufacturer data). */
  valveLoss: number | null;
  distributors: FloorDistributor[];
  notes: string;
};

/** Values of a linked room from the heat load. */
export type LinkedRoom = { name: string; load: number; area: number; roomTemp: number; belowTemp: number | null };

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

export type FloorWarning = "noData" | "covering" | "specific" | "insufficient" | "surface" | "downward" | "range" | "ringLength";

export type FloorRoomResult = {
  id: string;
  name: string;
  load: number;
  area: number;
  roomTemp: number;
  chart: number | null;
  specific: number;
  dTheta: number;
  edgeOutput: number;
  edgeLoad: number;
  innerLoad: number;
  innerArea: number;
  innerSpecific: number;
  spacing: number;
  installed: number;
  innerOutput: number;
  belowTemp: number | null;
  downward: number;
  total: number;
  massFlow: number;
  roomPipe: number;
  pipeLength: number;
  rings: number;
  ringLength: number;
  gradient: number;
  pressure: number;
  warnings: FloorWarning[];
};

export type FloorResult = {
  /** Mean heating medium temperature, flow and return [°C]. */
  mean: number | null;
  flow: number | null;
  ret: number | null;
  decisiveRoomId: string | null;
  distributors: { id: string; rooms: FloorRoomResult[]; total: number; massFlow: number; rings: number; maxPressure: number }[];
  total: number;
  massFlow: number;
  downward: number;
};

const resolve = (room: FloorRoom, linked: (r: FloorRoom) => LinkedRoom | null) => {
  const link = linked(room);
  return {
    name: room.name || link?.name || "",
    load: room.load ?? link?.load ?? null,
    area: room.area ?? link?.area ?? null,
    roomTemp: room.roomTemp ?? link?.roomTemp ?? null,
    belowTemp: room.belowTemp ?? link?.belowTemp ?? null,
  };
};

export function evaluateFloor(data: FloorSystemData, linked: (room: FloorRoom) => LinkedRoom | null): FloorResult {
  const all = data.distributors.flatMap((d) => d.rooms);
  const valid = all
    .map((room) => ({ room, v: resolve(room, linked), chart: coveringChart(room.covering ?? 0.1) }))
    .filter((x) => x.v.load !== null && x.v.area !== null && x.v.area > 0 && x.v.roomTemp !== null && x.chart !== null);

  // Step A: group temperature from the room that needs the highest mean medium temperature at the design spacing.
  let mean: number | null = null;
  let decisiveRoomId: string | null = null;
  if (data.flowOverride !== null) mean = data.flowOverride - data.spread / 2;
  else
    for (const x of valid) {
      const q = x.v.load! / x.v.area!;
      const needed = x.v.roomTemp! + Math.ceil(overTemperature(x.chart!, data.designSpacing, Math.max(q - tolerance, 0)) - 1e-9);
      if (mean === null || needed > mean) {
        mean = needed;
        decisiveRoomId = x.room.id;
      }
    }
  const flow = mean === null ? null : mean + data.spread / 2;
  const ret = mean === null ? null : mean - data.spread / 2;

  const evaluateRoom = (room: FloorRoom): FloorRoomResult => {
    const v = resolve(room, linked);
    const chart = coveringChart(room.covering ?? 0.1);
    const warnings: FloorWarning[] = [];
    const load = v.load ?? 0;
    const area = v.area ?? 0;
    const roomTemp = v.roomTemp ?? 20;
    const base = {
      id: room.id,
      name: v.name,
      load,
      area,
      roomTemp,
      chart,
      specific: area > 0 ? load / area : 0,
      belowTemp: v.belowTemp,
    };
    if (chart === null) warnings.push("covering");
    if (v.load === null || !(area > 0) || v.roomTemp === null || mean === null || chart === null) {
      if (!warnings.length) warnings.push("noData");
      return {
        ...base,
        dTheta: 0,
        edgeOutput: 0,
        edgeLoad: 0,
        innerLoad: 0,
        innerArea: 0,
        innerSpecific: 0,
        spacing: 0,
        installed: 0,
        innerOutput: 0,
        downward: 0,
        total: 0,
        massFlow: 0,
        roomPipe: 0,
        pipeLength: 0,
        rings: 0,
        ringLength: 0,
        gradient: 0,
        pressure: 0,
        warnings,
      };
    }
    if (base.specific > specificLoadLimit) warnings.push("specific");
    const dTheta = mean - roomTemp;
    if (dTheta > 35) warnings.push("range");
    const edgeArea = Math.min(room.edgeArea ?? 0, area);
    const edgeOutput = edgeArea > 0 ? heatOutput(chart, 5, dTheta) : 0;
    const edgeLoad = edgeArea * edgeOutput;
    const innerLoad = load - edgeLoad - (room.gain ?? 0);
    const innerArea = area - edgeArea;
    const innerSpecific = innerArea > 0 ? Math.max(innerLoad, 0) / innerArea : 0;
    // Largest spacing whose output covers the inner zone (never under-supply).
    let spacing = room.spacingOverride ?? 0;
    if (!spacing) {
      const fitting = [...floorSpacings].reverse().find((s) => heatOutput(chart, s, dTheta) >= innerSpecific - tolerance);
      spacing = fitting ?? 5;
      if (!fitting) warnings.push("insufficient");
    }
    const installed = heatOutput(chart, spacing, dTheta);
    if (room.spacingOverride && installed < innerSpecific - tolerance) warnings.push("insufficient");
    if (installed > (room.bath ? surfaceLimit.bath : surfaceLimit.occupied) || edgeOutput > surfaceLimit.bath) warnings.push("surface");
    const innerOutput = innerArea * installed;
    const downward = v.belowTemp === null ? 0 : downwardLoss(spacing, mean - v.belowTemp, data.insulation) * area;
    const total = innerOutput + edgeLoad + downward;
    if (total > 0 && downward / total > 0.1) warnings.push("downward");
    const massFlow = total / (data.spread * cWater);
    const roomPipe = (innerArea * 100) / spacing + edgeArea * 20;
    const supply = room.supplyLength ?? 0;
    const rings = Math.max(room.rings ?? Math.ceil((roomPipe + supply) / data.maxRingLength), 1);
    const ringLength = roomPipe / rings + supply;
    if (ringLength > data.maxRingLength) warnings.push("ringLength");
    const gradient = pressureGradient(data.pipe, massFlow / rings);
    const pressure = gradient * ringLength + (data.valveLoss ?? 0);
    return {
      ...base,
      dTheta,
      edgeOutput,
      edgeLoad,
      innerLoad,
      innerArea,
      innerSpecific,
      spacing,
      installed,
      innerOutput,
      downward,
      total,
      massFlow,
      roomPipe,
      pipeLength: roomPipe + supply * rings,
      rings,
      ringLength,
      gradient,
      pressure,
      warnings,
    };
  };

  const distributors = data.distributors.map((d) => {
    const rooms = d.rooms.map(evaluateRoom);
    return {
      id: d.id,
      rooms,
      total: rooms.reduce((s, r) => s + r.total, 0),
      massFlow: rooms.reduce((s, r) => s + r.massFlow, 0),
      rings: rooms.reduce((s, r) => s + r.rings, 0),
      maxPressure: rooms.reduce((s, r) => Math.max(s, r.pressure), 0),
    };
  });
  return {
    mean,
    flow,
    ret,
    decisiveRoomId,
    distributors,
    total: distributors.reduce((s, d) => s + d.total, 0),
    massFlow: distributors.reduce((s, d) => s + d.massFlow, 0),
    downward: distributors.reduce((s, d) => s + d.rooms.reduce((a, r) => a + r.downward, 0), 0),
  };
}
