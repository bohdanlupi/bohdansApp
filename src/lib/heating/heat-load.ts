// Norm-Heizlast (design heat load) room by room after SIA 384/2:2020. Where the LUPI template
// «384-2_2020_Vorlage.xlsx» deviates from the norm, the norm is implemented: θe,0 rounded as a whole (Gl. 14),
// inertia after Tabelle 7 / Gl. 15, f1 after Tabelle 4 for unheated neighbours of unknown temperature, the building
// total without the heat flow to heated neighbours (Gl. 13), f_i-z after Tabelle 6, n_min by ventilation concept and
// room type (Tabelle 5), Δθs only on heated surfaces (Tabelle 9), f_e,an from the depth of each ground element
// (Tabelle 1) and the temperature of non-actively heated rooms after Anhang A.

import { findStation } from "./climate";

// ---------------------------------------------------------------------------
// Input model
// ---------------------------------------------------------------------------

export const inertiaModes = ["heavy", "medium", "light", "veryLight", "tau", "manual"] as const;
export type InertiaMode = (typeof inertiaModes)[number];

/** Groundwater level below the slab; factors of the LUPI template (SIA 384/2 2.2.5.3 gives no values). */
export const groundwaterLevels = { far: 1, near: 1.15, nearFlat: 2 } as const;
export type GroundwaterLevel = keyof typeof groundwaterLevels;

/** Project-wide basics of the heat load: site, climate, inertia, airtightness. */
export type HeatSite = {
  station: string | null;
  /** Site altitude h_S [m ü. M.] (zero level of the building). */
  altitude: number | null;
  /** Overrides of the station values (e.g. newer SIA 2028 data). */
  thetaEOverride: number | null;
  thetaMeanOverride: number | null;
  inertia: InertiaMode;
  /** Time constant τ [h] for Gl. 15. */
  tau: number | null;
  /** Manual inertia correction Δθe,τ [K]. */
  inertiaManual: number | null;
  /** «Neubau» column of Tabelle 5 (also existing buildings meeting new-build airtightness). */
  airtight: "new" | "old";
  groundwater: GroundwaterLevel;
  /** Heating system with frost protection: minimum temperature of non-actively heated rooms 5 °C (Tabelle 10). */
  frostProtection: boolean;
};

export const constructionKinds = ["element", "ground", "linear", "point"] as const;
export type ConstructionKind = (typeof constructionKinds)[number];

/** Entry of the project catalogue: construction with U, ground construction (Ueq), or thermal bridge (ψ / χ). */
export type Construction = {
  id: string;
  code: string;
  name: string;
  kind: ConstructionKind;
  /** U [W/m²K], ψ [W/mK] or χ [W/K]. */
  value: number | null;
  /** Ground constructions (Anhang B): wall or floor, slab area A_G, exposed perimeter P_FG, depth z. */
  groundType: "wall" | "floor";
  slabArea: number | null;
  perimeter: number | null;
  depth: number | null;
  /** Ueq calculated elsewhere (SN EN ISO 13370) instead of Gl. 19. */
  ueqOverride: number | null;
};

export const adjacencies = ["outside", "unheated", "heated", "ground"] as const;
export type Adjacency = (typeof adjacencies)[number];

export const orientations = ["N", "NO", "O", "SO", "S", "SW", "W", "NW", "H"] as const;

/** Tabelle 4: f1 of unheated neighbours with unknown temperature, [n ≤ 0.5 h⁻¹, 0.5 < n ≤ 5 h⁻¹]. */
export const f1Table4 = {
  side1: [0.6, 0.8],
  side2: [0.5, 0.7],
  side3: [0.4, 0.6],
  cellar1: [0.5, 0.7],
  cellar2: [0.4, 0.6],
  cellar3: [0.3, 0.5],
  attic: [0.7, 0.9],
} as const;
export type Table4Case = keyof typeof f1Table4;

export type RoomElement = {
  id: string;
  constructionId: string | null;
  orientation: string;
  adjacency: Adjacency;
  width: number | null;
  /** Length or height [m]; length of a linear thermal bridge. */
  length: number | null;
  count: number | null;
  /** Deducted area [m²] (e.g. windows in a wall). */
  deduction: number | null;
  /** Direct area input instead of width × length × count − deduction. */
  areaOverride: number | null;
  /** Neighbour temperature: entered, Tabelle 4 case, or taken from another room of the calculation. */
  neighbourMode: "temperature" | "table4" | "room";
  neighbourTemp: number | null;
  neighbourRoomId: string | null;
  table4: Table4Case;
  table4HighAirChange: boolean;
  /** Mean height of the element above the floor [m] (rooms ≥ 4 m). */
  height: number | null;
  /** Surface with integrated heating (Δθs of Tabelle 9 applies). */
  heatedSurface: boolean;
};

export const ventilationConcepts = ["natural", "wrg", "airHeating", "exhaust"] as const;
export type VentilationConcept = (typeof ventilationConcepts)[number];

/** Tabelle 5: minimum air change n_min [h⁻¹] by concept and room type, [Neubau, Altbau]. */
export const nMinTable: Record<VentilationConcept, Record<string, readonly [number, number]>> = {
  natural: { bath: [0.5, 0.7], exterior: [0.3, 0.5], interior: [0, 0] },
  wrg: { supply: [0.2, 0.4], transfer: [0.1, 0.3], interior: [0, 0] },
  airHeating: { exterior: [0.1, 0.3], interior: [0, 0] },
  exhaust: { exterior: [0.5, 0.7], interior: [0, 0] },
};

/** Tabelle 9: vertical temperature gradient G [K/m] and surface excess Δθs [K] of the emission system. */
export const emissionSystems = {
  radiators: { g: 1.0, dTheta: 0 },
  surface: { g: 0.2, dTheta: 1.5 },
  warmAir: { g: 1.0, dTheta: 0 },
  warmAirDestrat: { g: 0.35, dTheta: 0 },
  ceilingPanels: { g: 0.35, dTheta: 0 },
  radiantHeaters: { g: 0.2, dTheta: 0 },
} as const;
export type EmissionSystem = keyof typeof emissionSystems;

export type HeatRoom = {
  id: string;
  number: string;
  name: string;
  floor: string;
  /** Heated room, or non-actively heated room whose temperature follows from Anhang A (no heat load). */
  kind: "heated" | "passive";
  thetaInt: number | null;
  area: number | null;
  height: number | null;
  /** Net volume; default area × height. */
  volume: number | null;
  roomType: string;
  nMinOverride: number | null;
  /** Occupied zone height h_oc: 1.3 m sitting, 1.8 m standing (rooms ≥ 4 m). */
  standing: boolean;
  emission: EmissionSystem;
  /** Agreed permanent heat gains Φ_g [W] (residential normally 0). */
  gains: number | null;
  elements: RoomElement[];
};

export type HeatLoadData = {
  concept: VentilationConcept;
  /** Simultaneity f_i-z of the ventilation losses; null = default of Tabelle 6. */
  fiz: number | null;
  rooms: HeatRoom[];
  notes: string;
};

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

/** Tabelle 12: coefficients of Gl. 19. */
const ueqCoefficients = {
  floor: { a: 0.9671, b: -7.455, c1: 10.76, c2: 9.773, c3: 0.0265, n1: 0.5532, n2: 0.6027, n3: -0.9296, d: -0.0203 },
  wall: { a: 0.93328, b: -2.1552, c1: 0, c2: 1.466, c3: 0.1006, n1: 0, n2: 0.45325, n3: -1.0068, d: -0.0692 },
} as const;

/** Equivalent U-value of a ground element (Anhang B, Gl. 19/20). */
export function groundUeq(type: "wall" | "floor", u: number, slabArea: number, perimeter: number, depth: number): number | null {
  if (!(u > 0) || !(slabArea > 0) || !(perimeter > 0) || depth < 0) return null;
  const c = ueqCoefficients[type];
  const bPrime = slabArea / (0.5 * perimeter);
  const denominator = c.b + (c.c1 + bPrime) ** c.n1 + (c.c2 + depth) ** c.n2 + (c.c3 + u) ** c.n3;
  return c.a / denominator + c.d;
}

/** Tabelle 1: correction f_e,an by the depth z of the element below ground. */
export const groundFactor = (depth: number | null) => (depth === null || depth < 2 ? 1.5 : depth < 5 ? 1.3 : 1.2);

/** Round half away from zero to 1 K (Gl. 14). */
const round1K = (value: number) => Math.sign(value) * Math.round(Math.abs(value));

/** Inertia correction Δθe,τ [K] (Tabelle 7, or Gl. 15 with Tabelle 8). */
export function inertiaCorrection(site: HeatSite): number {
  switch (site.inertia) {
    case "heavy":
      return 0;
    case "medium":
      return -1;
    case "light":
      return -2;
    case "veryLight":
      return -3;
    case "tau":
      return site.tau === null ? 0 : Math.max(Math.min(0.015 * site.tau - 3.4, 0), -3);
    case "manual":
      return Math.max(Math.min(site.inertiaManual ?? 0, 0), -3);
  }
}

export type SiteResult = {
  thetaEClm: number | null;
  altitudeCorrection: number;
  inertia: number;
  /** Norm outdoor temperature θe,0 [°C], rounded to 1 K. */
  thetaE0: number | null;
  thetaMean: number | null;
  /** ρ·cp [Wh/m³K] (Gl. 11). */
  rhoCp: number;
  fGW: number;
};

export function evaluateSite(site: HeatSite): SiteResult {
  const station = findStation(site.station);
  const thetaEClm = site.thetaEOverride ?? station?.thetaE ?? null;
  const altitudeCorrection = station && site.altitude !== null ? -0.005 * Math.max(site.altitude - station.altitude, 0) : 0;
  const inertia = inertiaCorrection(site);
  return {
    thetaEClm,
    altitudeCorrection,
    inertia,
    thetaE0: thetaEClm === null ? null : round1K(thetaEClm + altitudeCorrection + inertia),
    thetaMean: site.thetaMeanOverride ?? station?.thetaMean ?? null,
    rhoCp: (1220 - 0.14 * (site.altitude ?? station?.altitude ?? 400)) / 3600,
    fGW: groundwaterLevels[site.groundwater],
  };
}

export type ConstructionResult = { value: number | null; feAn: number };

/** Value used per element: U, Ueq (Gl. 19 unless given) with f_e,an, ψ or χ. */
export function constructionValue(c: Construction): ConstructionResult {
  if (c.kind !== "ground") return { value: c.value, feAn: 1 };
  const ueq =
    c.ueqOverride ?? (c.value !== null && c.slabArea !== null && c.perimeter !== null ? groundUeq(c.groundType, c.value, c.slabArea, c.perimeter, c.depth ?? 0) : null);
  return { value: ueq, feAn: groundFactor(c.depth) };
}

export type ElementResult = {
  id: string;
  /** Area [m²], or length [m] (linear) / count (point) of a thermal bridge. */
  quantity: number;
  thetaX: number | null;
  f1: number | null;
  f2: number;
  value: number | null;
  /** H [W/K] and Φ [W]. */
  h: number;
  phi: number;
  warning: ElementWarning | null;
};

export type ElementWarning = "noConstruction" | "noValue" | "noNeighbour" | "noHeight" | "bridgeHeated" | "groundConstruction";

export type RoomResult = {
  id: string;
  thetaInt: number | null;
  area: number;
  volume: number;
  high: boolean;
  elements: ElementResult[];
  /** H_T parts [W/K] and Φ_T parts [W]: outside, unheated, heated neighbours, ground. */
  hT: Record<Adjacency, number>;
  phiT: Record<Adjacency, number>;
  phiTotal: number;
  nMin: number;
  qv: number;
  hV: number;
  phiV: number;
  gains: number;
  /** Φ_HL [W] and Φ′_HL [W/m²]. */
  phiHL: number;
  specific: number | null;
  /** Passive rooms: temperature after Anhang A. */
  passiveTemp: number | null;
};

export type HeatLoadResult = {
  site: SiteResult;
  rooms: RoomResult[];
  fiz: number;
  fizRange: [number, number];
  /** Σ(Φ_T,ie + Φ_T,iu + Φ_T,iG), ΣΦ_T,in (info), ΣΦ_V, ΣΦ_g. */
  phiT: number;
  phiTNeighbours: number;
  phiV: number;
  gains: number;
  /** Φ_HL,b [W] (Gl. 13) and Φ′_HL,b [W/m²]. */
  building: number;
  area: number;
  specific: number | null;
  /** Σ Φ_HL,i (for the emission sizing; not the building load). */
  roomSum: number;
};

const zeroParts = (): Record<Adjacency, number> => ({ outside: 0, unheated: 0, heated: 0, ground: 0 });

const quantityOf = (e: RoomElement, kind: ConstructionKind | undefined) => {
  if (kind === "linear") return (e.length ?? 0) * (e.count ?? 1);
  if (kind === "point") return e.count ?? 1;
  if (e.areaOverride !== null) return e.areaOverride;
  return Math.max((e.width ?? 0) * (e.length ?? 0) * (e.count ?? 1) - (e.deduction ?? 0), 0);
};

/** Default f_i-z (Tabelle 6) and its admissible range. */
export function simultaneity(concept: VentilationConcept, heatedRooms: number): { value: number; range: [number, number] } {
  if (concept !== "natural") return { value: 1, range: [0, 1] };
  return heatedRooms <= 1 ? { value: 1, range: [1, 1] } : { value: 0.8, range: [0.5, 0.8] };
}

export const nMinOf = (concept: VentilationConcept, roomType: string, airtight: "new" | "old") =>
  (nMinTable[concept][roomType] ?? Object.values(nMinTable[concept])[0])[airtight === "new" ? 0 : 1];

export function evaluateHeatLoad(data: HeatLoadData, site: HeatSite, catalog: Construction[]): HeatLoadResult {
  const s = evaluateSite(site);
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const values = new Map(catalog.map((c) => [c.id, constructionValue(c)]));
  const roomsById = new Map(data.rooms.map((r) => [r.id, r]));
  const thetaE0 = s.thetaE0;

  // Anhang A: temperature of the non-actively heated rooms from their elements (f1 = 1, ventilation neglected).
  const passiveTemps = new Map<string, number | null>();
  for (const room of data.rooms.filter((r) => r.kind === "passive")) {
    let sumH = 0;
    let sumHTheta = 0;
    for (const e of room.elements) {
      const c = e.constructionId ? byId.get(e.constructionId) : undefined;
      const v = e.constructionId ? values.get(e.constructionId) : undefined;
      if (!c || !v || v.value === null) continue;
      const q = quantityOf(e, c.kind);
      let theta: number | null = null;
      let h = q * v.value;
      if (e.adjacency === "outside") theta = thetaE0;
      else if (e.adjacency === "ground") {
        theta = s.thetaMean;
        h *= v.feAn * s.fGW;
      } else if (e.neighbourMode === "room") theta = roomsById.get(e.neighbourRoomId ?? "")?.thetaInt ?? null;
      else if (e.neighbourMode === "temperature") theta = e.neighbourTemp;
      if (theta === null || !(h > 0)) continue;
      sumH += h;
      sumHTheta += h * theta;
    }
    const min = site.frostProtection ? 5 : (thetaE0 ?? -Infinity);
    passiveTemps.set(room.id, sumH > 0 ? Math.max(sumHTheta / sumH, min) : null);
  }
  const neighbourTemp = (id: string | null) => {
    const r = id ? roomsById.get(id) : undefined;
    if (!r) return null;
    return r.kind === "passive" ? (passiveTemps.get(r.id) ?? null) : r.thetaInt;
  };

  const rooms: RoomResult[] = data.rooms.map((room) => {
    const area = room.area ?? 0;
    const volume = room.volume ?? area * (room.height ?? 0);
    const high = (room.height ?? 0) >= 4;
    const thetaInt = room.kind === "passive" ? (passiveTemps.get(room.id) ?? null) : room.thetaInt;
    const hT = zeroParts();
    const phiT = zeroParts();
    const delta = thetaInt !== null && thetaE0 !== null ? thetaInt - thetaE0 : null;
    const emission = emissionSystems[room.emission];
    const hoc = room.standing ? 1.8 : 1.3;

    const elements = room.elements.map((e): ElementResult => {
      const c = e.constructionId ? byId.get(e.constructionId) : undefined;
      const v = e.constructionId ? values.get(e.constructionId) : undefined;
      const quantity = quantityOf(e, c?.kind);
      const empty = (warning: ElementWarning | null, thetaX: number | null = null): ElementResult => ({
        id: e.id,
        quantity,
        thetaX,
        f1: null,
        f2: 0,
        value: v?.value ?? null,
        h: 0,
        phi: 0,
        warning,
      });
      if (!c || !v) return empty("noConstruction");
      if (v.value === null) return empty("noValue");
      const bridge = c.kind === "linear" || c.kind === "point";
      if (bridge && (e.adjacency === "heated" || e.adjacency === "ground")) return empty("bridgeHeated");
      if (room.kind === "passive" || delta === null || delta === 0) return empty(null);

      let thetaX: number | null = null;
      let f1: number | null = null;
      if (e.adjacency === "outside") {
        thetaX = thetaE0;
        f1 = 1;
      } else if (e.adjacency === "ground") {
        thetaX = s.thetaMean;
        f1 = thetaX === null ? null : (thetaInt! - thetaX) / delta;
      } else if (e.adjacency === "unheated" && e.neighbourMode === "table4") {
        f1 = f1Table4[e.table4][e.table4HighAirChange ? 1 : 0];
      } else {
        thetaX = e.neighbourMode === "room" ? neighbourTemp(e.neighbourRoomId) : e.neighbourTemp;
        f1 = thetaX === null ? null : (thetaInt! - thetaX) / delta;
      }
      if (f1 === null) return empty("noNeighbour", thetaX);

      let f2 = 0;
      let warning: ElementWarning | null = null;
      if (high) {
        if (e.height === null) warning = "noHeight";
        const surface = e.heatedSurface ? emission.dTheta : 0;
        f2 = (emission.g * ((e.height ?? hoc) - hoc) + surface) / delta;
      }
      let h = quantity * v.value * (f1 + f2);
      if (e.adjacency === "ground") {
        if (c.kind !== "ground") warning = warning ?? "groundConstruction";
        h *= v.feAn * s.fGW;
      }
      const phi = h * delta;
      hT[e.adjacency] += h;
      phiT[e.adjacency] += phi;
      return { id: e.id, quantity, thetaX, f1, f2, value: v.value, h, phi, warning };
    });

    const nMin = room.kind === "passive" ? 0 : (room.nMinOverride ?? nMinOf(data.concept, room.roomType, site.airtight));
    const qv = nMin * volume;
    const hV = s.rhoCp * qv;
    const phiV = delta === null || room.kind === "passive" ? 0 : hV * delta;
    const gains = room.kind === "passive" ? 0 : (room.gains ?? 0);
    const phiTotal = phiT.outside + phiT.unheated + phiT.heated + phiT.ground;
    const phiHL = room.kind === "passive" ? 0 : phiTotal + phiV - gains;
    return {
      id: room.id,
      thetaInt,
      area,
      volume,
      high,
      elements,
      hT,
      phiT,
      phiTotal,
      nMin,
      qv,
      hV,
      phiV,
      gains,
      phiHL,
      specific: area > 0 && room.kind !== "passive" ? phiHL / area : null,
      passiveTemp: room.kind === "passive" ? thetaInt : null,
    };
  });

  const heated = rooms.filter((_, i) => data.rooms[i].kind === "heated");
  const sim = simultaneity(data.concept, heated.length);
  const fiz = data.fiz === null ? sim.value : Math.min(Math.max(data.fiz, sim.range[0]), sim.range[1]);
  const sum = (pick: (r: RoomResult) => number) => heated.reduce((acc, r) => acc + pick(r), 0);
  const phiT = sum((r) => r.phiT.outside + r.phiT.unheated + r.phiT.ground);
  const phiV = sum((r) => r.phiV);
  const gains = sum((r) => r.gains);
  const building = phiT + fiz * phiV - gains;
  const area = sum((r) => r.area);
  return {
    site: s,
    rooms,
    fiz,
    fizRange: sim.range,
    phiT,
    phiTNeighbours: sum((r) => r.phiT.heated),
    phiV,
    gains,
    building,
    area,
    specific: area > 0 ? building / area : null,
    roomSum: sum((r) => r.phiHL),
  };
}
