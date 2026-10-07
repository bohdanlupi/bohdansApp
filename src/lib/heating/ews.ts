// Erdwärmesonden after SIA 384/6:2021 – simplified method for einfache Anlagen (3.3.3, Anhang D.4), design
// temperature after Tabelle 2 with future neighbour probes (3.5, Gl. 1–3, Figur 3), hydraulics (3.4, D.7: Colebrook /
// laminar), Expansionsgefäss (3.4.2.6, C.4.4) and pump energy (3.4.2.9). Verified against the examples D.4.8.1–D.4.8.4
// and D.7.4 (see PLAN.md). Charts and tables in ews-data.ts.

import {
  type Arrangement,
  brineMedia,
  DIAMETER_40_FACTOR,
  designTemperature,
  envelopeFactors,
  LOAD_HOURS_POINTS,
  lengthSurcharge,
  loadHoursIncrease,
  neighbourCooling,
  normPower32,
  pePipes,
  probeInner,
  type RequirementClass,
  requirementClasses,
} from "./ews-data";
import { evaluateSite } from "./heat-load";
import type { HeatingPlan } from "./plan-schema";
import type { PlantData } from "./plant-schema";
import { CP_WATER } from "./water";

/** Values of the project the EWS calculation takes as defaults. */
export type EwsContext = {
  /** Norm-Heizlast SIA 384/2 of the building [kW]. */
  heatLoad: number | null;
  /** Site altitude [m ü. M.] and annual mean outdoor temperature [°C] (Wärmebedarf). */
  altitude: number | null;
  thetaMean: number | null;
  /** Energiebezugsfläche [m²]. */
  energyArea: number | null;
  /** Wohnungsbau (EFH / MFH). */
  residential: boolean;
};

/** Defaults of the project: site (Wärmebedarf), EBF and building type (242), building heat load [W]. */
export function ewsContextOf(plan: HeatingPlan, heatLoadW: number): EwsContext {
  const site = evaluateSite(plan.site);
  return {
    heatLoad: heatLoadW > 0 ? heatLoadW / 1000 : null,
    altitude: plan.site.altitude,
    thetaMean: site.thetaMean,
    energyArea: plan.params.energyArea,
    residential: plan.params.buildingType !== "nonResidential",
  };
}

export const emptyEwsContext: EwsContext = { heatLoad: null, altitude: null, thetaMean: null, energyArea: null, residential: true };

const lerp = (x: number, table: readonly (readonly [number, number])[]) => {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    const [x0, y0] = table[i - 1];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  const [xa, ya] = table[table.length - 2];
  const [xb, yb] = table[table.length - 1];
  return yb + ((yb - ya) * (x - xb)) / (xb - xa);
};
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

/** Figur 9 (× 1.05 for 40 mm, Figur 10): spezifische Normleistung [W/m]. */
export function normPower(lambda: number, rhoC: number, diameter: 32 | 40): number {
  const l = clamp(lambda, 1, 4);
  const at = (key: "c15" | "c20" | "c25") => lerp(l, normPower32.map((r) => [r.lambda, r[key]] as [number, number]));
  const c = clamp(rhoC, 1.5, 2.5);
  const p = c <= 2 ? at("c15") + ((at("c20") - at("c15")) * (c - 1.5)) / 0.5 : at("c20") + ((at("c25") - at("c20")) * (c - 2)) / 0.5;
  return diameter === 40 ? p * DIAMETER_40_FACTOR : p;
}

/** Figuren 13–21: Zuschlag [%], interpolated in λ (2–3), spacing (5–10 m) and Volllaststunden. */
export function surcharge(arrangement: Arrangement, spacing: number, lambda: number, hours: number): number {
  const at = (l: number, s: number) => lerp(hours, LOAD_HOURS_POINTS.map((h, i) => [h, lengthSurcharge[`${l}|${s}`][arrangement][i]] as [number, number]));
  const ls = [2, 2.5, 3];
  const ss = [5, 7.5, 10];
  const pick = (v: number, grid: number[]) => {
    const x = clamp(v, grid[0], grid[grid.length - 1]);
    const i = Math.min(grid.findIndex((g) => g >= x), grid.length - 1);
    const i0 = Math.max(i - 1, 0);
    return { a: grid[i0], b: grid[i], t: grid[i] === grid[i0] ? 0 : (x - grid[i0]) / (grid[i] - grid[i0]) };
  };
  const L = pick(lambda, ls);
  const S = pick(spacing, ss);
  const row = (l: number) => at(l, S.a) + (at(l, S.b) - at(l, S.a)) * S.t;
  return Math.max(row(L.a) + (row(L.b) - row(L.a)) * L.t, 0);
}

/** C.2: Bodenoberflächentemperatur for the Heizfall [°C]: from the annual mean (Gl. 8–10) or the altitude (Gl. 4–6). */
export function groundSurfaceTemperature(altitude: number, thetaMean: number | null, side: "north" | "south"): { theta: number; source: "mean" | "altitude" } {
  if (thetaMean !== null) {
    const t = altitude < 1000 ? thetaMean + 1.55 : thetaMean + 1.55 + ((altitude - 1000) / 800) * 2.45;
    return { theta: t - 1, source: "mean" };
  }
  const h = altitude;
  const t = side === "north" ? 1.373e-6 * h * h - 6.88e-3 * h + 14.2 : 2.277e-6 * h * h - 8.38e-3 * h + 15.4;
  return { theta: t - 1.5, source: "altitude" };
}

/** Requirement class after Figur 3 from the cooling by future neighbour probes. */
export const requirementOf = (cooling: number): RequirementClass => (cooling <= 1 ? "R1" : cooling <= 3 ? "R2" : cooling <= 5 ? "R3" : "R4");

// ---------------------------------------------------------------------------
// Hydraulics (D.7.1): Darcy-Weisbach with 64/Re (laminar, Re < 2300) or Colebrook for smooth PE pipes
// ---------------------------------------------------------------------------

const ROUGHNESS = 0.007e-3; // PE [m]

export function friction(re: number, d: number): number {
  if (re < 2300) return 64 / Math.max(re, 1);
  let f = 0.02;
  for (let i = 0; i < 30; i++) f = (-2 * Math.log10(ROUGHNESS / (3.7 * d) + 2.51 / (re * Math.sqrt(f)))) ** -2;
  return f;
}

/** Pressure loss per metre of pipe [Pa/m], velocity [m/s] and Reynolds number for a flow [l/h] in a pipe of inner d [mm]. */
export function pipeLoss(flowLh: number, dMm: number, rho: number, nu: number) {
  const d = dMm / 1000;
  const v = flowLh / 3600 / 1000 / ((Math.PI * d * d) / 4);
  const re = (v * d) / (nu * 1e-6);
  const f = friction(re, d);
  return { v, re, laminar: re < 2300, paPerM: (f / d) * ((rho * v * v) / 2) };
}

/** Smallest PE SDR 11 pipe with a velocity ≤ vMax. */
export const pipeFor = (flowLh: number, vMax: number) =>
  pePipes.find(([, di]) => flowLh / 3600 / 1000 / ((Math.PI * (di / 1000) ** 2) / 4) <= vMax) ?? pePipes[pePipes.length - 1];

// ---------------------------------------------------------------------------
// Whole calculation
// ---------------------------------------------------------------------------

export type EwsResult = {
  simple: { ok: boolean; reasons: ("probes" | "bivalent" | "nonResidential" | "cooling")[] };
  lambda: number;
  rhoC: number;
  depthLayers: number;
  thetaGs: number;
  thetaGsSource: "mean" | "altitude";
  pSpec: number;
  lengthNorm: number;
  hoursNorm: number;
  hoursHeating: number;
  qW: number;
  hours: number;
  surcharge: number;
  lengthPre: number;
  /** Future neighbour probes. */
  neighbour: { pGsf: number; cooling: number; fZB: number; gsfEff: number; qHli: number } | null;
  requirement: RequirementClass;
  thetaDesign: number | null;
  laminar: boolean;
  /** Final length per probe [m] (null when Tabelle 2 has no value: Regenerationspflicht) and its iterations. */
  length: number | null;
  iterations: number[];
  lengthTotal: number | null;
  tooDeep: boolean;
  hydraulics: {
    flow: number;
    perProbe: number;
    probe: { v: number; re: number; laminar: boolean; kPaPerM: number; kPa: number };
    feed: { dn: string; v: number; kPa: number; ok: boolean };
    main: { dn: string; v: number; kPa: number; ok: boolean };
    distributorOk: boolean;
    total: number;
    pumpPower: number;
    pumpShare: number | null;
    deltaTOk: boolean;
  } | null;
  volume: number;
  vessel: { min: number; eta: number; size: number };
};

const VESSEL_SIZES = [18, 25, 35, 50, 80, 100, 140, 200, 250, 300, 400, 500];

export function evaluateEws(data: PlantData, ctx: EwsContext): EwsResult {
  const e = data.ews;
  const medium = brineMedia[e.medium];
  const cp = e.cp ?? medium.cp;

  // Simple Anlage (3.3.3.1): monovalent, Wohnungsbau, max. 4 EWS, Geocooling not considered.
  const reasons: EwsResult["simple"]["reasons"] = [];
  if (e.probes > 4) reasons.push("probes");
  if (data.generators.some((g) => g.type !== "hpBrine")) reasons.push("bivalent");
  if (!ctx.residential) reasons.push("nonResidential");
  if (data.cooling) reasons.push("cooling");

  // Geologie: weighted mean of the layers (example D.4.8.1).
  const layers = e.layers.filter((l) => l.thickness > 0);
  const depthLayers = layers.reduce((s, l) => s + l.thickness, 0);
  const lambda = depthLayers > 0 ? layers.reduce((s, l) => s + l.thickness * l.lambda, 0) / depthLayers : 2;
  const rhoC = depthLayers > 0 ? layers.reduce((s, l) => s + l.thickness * l.rhoC, 0) / depthLayers : 2;

  // Bodenoberflächentemperatur (C.2).
  const altitude = e.altitude ?? ctx.altitude ?? 500;
  const surface = e.thetaGs !== null ? { theta: e.thetaGs, source: "mean" as const } : groundSurfaceTemperature(altitude, e.thetaMean ?? ctx.thetaMean, e.side);

  // Normlänge (D.4.2, Gl. 14).
  const q0 = (e.coolingCapacity ?? 0) * 1000;
  const pSpec = normPower(lambda, rhoC, e.diameter);
  const lengthNorm = q0 / pSpec;

  // Volllaststunden (D.4.5, Gl. 15–18), at least 1800 h (D.4.5.8).
  const hoursNorm = 1850 * (1 + lerp(altitude, loadHoursIncrease[e.side]) / 100);
  const heatLoad = e.heatLoad ?? ctx.heatLoad ?? 0;
  const hp = e.heatingCapacity ?? 0;
  const hoursHeating = hp > 0 ? (hoursNorm * heatLoad) / hp : 0;
  const qW = e.hotWater ? (e.hotWaterLitres * (e.hotWaterTemp - e.coldWaterTemp) * CP_WATER * 365) / 3600 : 0;
  const hpW = e.heatingCapacityHotWater ?? hp;
  const hours = Math.max(1800, hoursHeating + (hpW > 0 ? qW / hpW : 0));

  // Zuschlag for Volllaststunden, Anordnung, λ (D.4.6, Gl. 20).
  const arrangement: Arrangement = e.probes >= 4 && e.square ? "2x2" : (String(clamp(e.probes, 1, 4)) as Arrangement);
  const z = surcharge(arrangement, e.spacing, lambda, hours);
  const lengthPre = (lengthNorm / Math.max(e.probes, 1)) * (1 + z / 100);

  // Future neighbour probes (3.5) → Anforderung R1–R4 (Figur 3) → θBHE,50 (Tabelle 2).
  let neighbour: EwsResult["neighbour"] = null;
  let requirement: RequirementClass = e.requirement ?? "R1";
  const n = e.neighbours;
  if (n.enabled) {
    const gsfEff = (n.gsf ?? 0) + (n.asf ?? 0) + (n.aff ?? 0);
    const area = n.energyArea ?? ctx.energyArea ?? 0;
    // Grenzwert Q_H,li after SIA 380/1 with A_th/A_E of Tabelle 5; 50 % Neubau, 50 % Sanierung (Altbau = 1.5 × Neubau).
    const qHli = ((n.qHli0 ?? 0) + (n.dqHli ?? 0) * envelopeFactors[n.category]) * 1.25;
    const fZB = Math.max((n.fGeo ?? 40) - (n.f50m ?? 0), 0) / 100;
    const pGsf = gsfEff > 0 ? (qHli + (n.qW ?? 0)) * (area / gsfEff) * (3 / 4) * fZB : 0;
    const cooling = lerp(pGsf, neighbourCooling);
    neighbour = { pGsf, cooling, fZB, gsfEff, qHli };
    if (e.requirement === null) requirement = requirementOf(cooling);
  }
  const thetaDesign = designTemperature[e.regeneration][requirement];

  // Hydraulics (3.4.4, D.7).
  const flow = q0 > 0 ? (q0 / (medium.rho * cp * 1000 * e.deltaT)) * 3600 * 1000 : 0; // l/h
  const perProbe = flow / Math.max(e.probes, 1);
  const probeLoss = pipeLoss(perProbe / 2, probeInner[e.diameter], medium.rho, medium.nu); // one of the two circuits
  const laminar = flow > 0 && probeLoss.laminar;

  // Bodentemperatur iteration (D.4.7, Gl. 21/22). Laminar flow makes the Wärmeträger about 1.5 K colder (3.1.1.3), so
  // the design temperature is raised by 1.5 K to keep the limit (example D.7.4.2).
  const iterations: number[] = [];
  let length: number | null = null;
  if (thetaDesign !== null && lengthPre > 0) {
    const theta = thetaDesign + (laminar ? 1.5 : 0);
    let l = lengthPre;
    for (let i = 0; i < 20; i++) {
      const dTheta = surface.theta + (l * e.gradient) / 2 - theta;
      const next = (lengthPre * 11.5) / dTheta;
      iterations.push(next);
      const done = Math.abs(next - l) <= 5;
      l = next;
      if (done) break;
    }
    length = l;
  }

  const kPaProbe = flow > 0 && length !== null ? (2 * probeLoss.paPerM * length) / 1000 : 0;
  const feedPipe = pePipes.find(([o]) => o === e.feedDn) ?? pePipes[1];
  const feed = pipeLoss(perProbe, feedPipe[1], medium.rho, medium.nu);
  const mainPipe = pePipes.find(([o]) => o === e.mainDn) ?? pePipes[2];
  const main = pipeLoss(flow, mainPipe[1], medium.rho, medium.nu);
  const kPaFeed = (feed.paPerM * 2 * e.feedLength) / 1000;
  const kPaMain = (main.paPerM * 2 * e.mainLength) / 1000;
  const total = kPaProbe + kPaFeed + kPaMain + (e.distributorLoss ?? 0) + (e.evaporatorLoss ?? 0);
  const pumpPower = (flow / 3600 / 1000) * total * 1000 / Math.max(e.pumpEfficiency, 0.05); // W
  const hpElectric = hp - (e.coolingCapacity ?? 0); // kW
  const hydraulics: EwsResult["hydraulics"] = flow > 0
    ? {
        flow,
        perProbe,
        probe: { v: probeLoss.v, re: probeLoss.re, laminar: probeLoss.laminar, kPaPerM: (2 * probeLoss.paPerM) / 1000, kPa: kPaProbe },
        feed: { dn: `${feedPipe[0]} × ${feedPipe[1]}`, v: feed.v, kPa: kPaFeed, ok: feed.v <= 1 },
        main: { dn: `${mainPipe[0]} × ${mainPipe[1]}`, v: main.v, kPa: kPaMain, ok: main.v <= 1.5 },
        distributorOk: (e.distributorLoss ?? 0) <= 15,
        total,
        pumpPower,
        pumpShare: hpElectric > 0 ? pumpPower / 1000 / hpElectric : null,
        deltaTOk: e.deltaT <= 5,
      }
    : null;

  // Inhalt and Expansionsgefäss (3.4.2.6, C.4.4: 3 × ΔV/V0, min. 18 l, η = (pmax − pp) / (pmax + 1)).
  const area = (d: number) => (Math.PI * (d / 1000) ** 2) / 4;
  const volume =
    ((length ?? 0) * e.probes * 4 * area(probeInner[e.diameter]) + e.probes * 2 * e.feedLength * area(feedPipe[1]) + 2 * e.mainLength * area(mainPipe[1])) * 1000 +
    (e.extraVolume ?? 0);
  const eta = (e.vesselMaxPressure - e.vesselPrePressure) / (e.vesselMaxPressure + 1);
  const vesselMin = Math.max((medium.expansion * volume * 3) / Math.max(eta, 0.05), 18);
  const vesselSize = VESSEL_SIZES.find((v) => v >= vesselMin - 1e-9) ?? Math.ceil(vesselMin);

  return {
    simple: { ok: reasons.length === 0, reasons },
    lambda,
    rhoC,
    depthLayers,
    thetaGs: surface.theta,
    thetaGsSource: surface.source,
    pSpec,
    lengthNorm,
    hoursNorm,
    hoursHeating,
    qW,
    hours,
    surcharge: z,
    lengthPre,
    neighbour,
    requirement,
    thetaDesign,
    laminar,
    length,
    iterations,
    lengthTotal: length !== null ? length * e.probes : null,
    tooDeep: e.maxDepth !== null && length !== null && length > e.maxDepth,
    hydraulics,
    volume,
    vessel: { min: vesselMin, eta, size: vesselSize },
  };
}

export { requirementClasses, envelopeFactors };
