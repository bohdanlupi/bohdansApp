import { type Construction, constructionValue } from "@/lib/heating/heat-load";

import { type DerivedElement, derivedArea } from "./heat-link";
import {
  type BuildingModel,
  type BuildingRoom,
  type BuildingZone,
  heatCapacity,
  type PlanInfo,
  regulationSurcharge,
  unheatedCases,
} from "./schema";
import { type ClimateStationData, climateSets, finFactors, horizonFactors, overhangFactors, shadingGroups, usageCategories } from "./sia3801-data";
import { stackRooms } from "./stack";

// Heizwärmebedarf after SIA 380/1:2016 (monthly balance per Nutzungszone), spec from the Martinelli + Menti tool
// 19_sia_380-1_2016 (sheets Bauteile, Lüftung, Einträge, Bilanz) with the norm as the authority:
//   Q_T = Σ A·U·b·(θi + Δθ_reg − θe)·t      external, unheated (b Tabelle 17), ground (Ueq of the catalogue)
//   Q_V = ρc·V̇·(θi + Δθ_reg − θe)·t         V̇ = Standardnutzung × A_E × (1 − η_WRG) or entered
//   Q_i = Q_el (f_el) + Q_P                   Standardnutzung Tabellen 9–13
//   Q_s = Σ G(orientation)·A_w·g·0.9·f_F·f_s1·f_s2·f_s3   16 orientations by geometric interpolation of S/O/W/N
//   η_g = (1 − γ^a)/(1 − γ^(a+1)),  a = a0 + τ/τ0,  τ = C_R/H,  Q_H = Q_T + Q_V − η_g·Q_g (per month, ≥ 0)
//   Q_H,li = (Q_H,li0 + ΔQ_H,li·A_th/A_E)·f_cor, f_cor = 1 + (9.4 − θ_avg)·0.06; Umbau × 1.5, Zielwert Neubau 0.7 × li
// Elements come from the building model (heat-link.ts deriveElements). The Excel's Bauteilheizung correction
// (θ_HF,max − θi)/4 is applied to the floors of a zone with a floor heating.

export const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export type Sia3801Warning =
  | "noStation"
  | "noNorth"
  | "noZoneRooms"
  | "unassignedRooms"
  | "noConstruction"
  | "noU"
  | "noG"
  | "noEnvelope"
  | "uncalibrated"
  | "noArea";

export type ElementLine = {
  sourceId: string;
  kind: DerivedElement["kind"];
  roomNumber: string;
  construction: string;
  orientation: string;
  /** outside | unheated | ground | zone (another zone) */
  adjacency: "outside" | "unheated" | "ground" | "zone";
  area: number;
  /** U or Ueq [W/m²K]. */
  u: number | null;
  b: number;
  /** Transmission loss per year [kWh]. */
  qT: number;
  /** Windows: solar gains per year [kWh]. */
  qS: number | null;
};

export type MonthResult = {
  thetaE: number | null;
  qT: number;
  qV: number;
  qIEl: number;
  qIP: number;
  qS: number;
  qG: number;
  gamma: number;
  eta: number;
  qUg: number;
  qH: number;
};

export type ZoneResult = {
  zone: BuildingZone;
  rooms: BuildingRoom[];
  areaE: number;
  ath: number;
  /** A_th/A_E (Gebäudehüllzahl). */
  hullRatio: number;
  thetaInt: number;
  airflow: number;
  /** Heat transfer coefficient H [W/K] and time constant τ [h]. */
  h: number;
  tau: number;
  months: MonthResult[];
  /** Annual sums [kWh] and per m² EBF. */
  year: Omit<MonthResult, "thetaE" | "gamma" | "eta">;
  qHSpecific: number;
  limit: number | null;
  target: number | null;
  /** Grenzwert of a Neubau at this hull ratio (basis of Umbau and Zielwert). */
  limitNew: number | null;
  ok: boolean | null;
  elements: ElementLine[];
  bridgesH: number;
  warnings: Sia3801Warning[];
};

export type Sia3801Result = {
  station: ClimateStationData | null;
  climateSet: BuildingModel["climate"]["set"];
  zones: ZoneResult[];
  /** EBF-weighted building values. */
  areaE: number;
  ath: number;
  qH: number;
  qHSpecific: number | null;
  limit: number | null;
  target: number | null;
  ok: boolean | null;
  warnings: Sia3801Warning[];
};

const orient16 = ["S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW", "N", "NNO", "NO", "ONO", "O", "OSO", "SO", "SSO"] as const;
/** Column of the shading tables for each orientation (symmetric groups). */
const shadingColumn: Record<string, (typeof shadingGroups)[number]> = {
  SO: "SW/SO",
  SSO: "SSO",
  S: "S",
  SSW: "SSW",
  SW: "SW/SO",
  WSW: "WSW",
  W: "W/O",
  WNW: "WNW",
  NW: "NW/NO",
  NNW: "NNW",
  N: "N",
  NNO: "NNO",
  NO: "NW/NO",
  ONO: "ONO",
  O: "W/O",
  OSO: "OSO",
};

/** Monthly radiation [kWh/m²] on a surface of the given orientation (16 directions by geometric interpolation, H horizontal). */
export function radiation(month: ClimateStationData["months"][number], orientation: string): number | null {
  const base: Record<string, number | null> = { S: month.s, O: month.e, W: month.w, N: month.n, H: month.h };
  const kwh = (mj: number | null) => (mj === null ? null : mj / 3.6);
  if (orientation in base) return kwh(base[orientation]);
  const i = orient16.indexOf(orientation as (typeof orient16)[number]);
  if (i < 0) return null;
  // Cardinal every 4 steps: interpolate as the Excel does – diagonals from the two cardinals, the rest from neighbours.
  const cardinal = (k: number) => base[orient16[((k % 16) + 16) % 16]] ?? null;
  const lo = Math.floor(i / 4) * 4;
  const hi = lo + 4;
  const a = cardinal(lo);
  const b = cardinal(hi);
  if (a === null || b === null) return null;
  const diag = Math.sqrt(a * b);
  const step = i - lo;
  const mj = step === 2 ? diag : step === 1 ? Math.sqrt(a * diag) : Math.sqrt(diag * b);
  return kwh(mj);
}

const shadingFactor = (table: readonly (readonly number[])[], angle: number, orientation: string) => {
  const col = shadingGroups.indexOf(shadingColumn[orientation] ?? "S");
  const row = Math.min(table.length - 1, Math.max(0, Math.round(angle)));
  return table[row]?.[col] ?? 1;
};

export const findStation = (set: BuildingModel["climate"]["set"], name: string | null) => (name ? (climateSets[set] as readonly ClimateStationData[]).find((s) => s.name === name) ?? null : null);

export function evaluateSia3801(model: BuildingModel, plans: PlanInfo[], catalog: Construction[], derived: Map<string, DerivedElement[]>): Sia3801Result {
  const station = findStation(model.climate.set, model.climate.station);
  const warnings: Sia3801Warning[] = [];
  if (!station) warnings.push("noStation");
  if (plans.some((p) => p.north === null)) warnings.push("noNorth");
  if (plans.some((p) => p.scale === null)) warnings.push("uncalibrated");
  if (model.floors.some((f) => model.rooms.some((r) => r.floor === f.key) && !model.envelopes.some((e) => e.floor === f.key))) warnings.push("noEnvelope");

  const byId = new Map(catalog.map((c) => [c.id, c]));
  const stack = stackRooms(model, plans);
  const roomsById = new Map(model.rooms.map((r) => [r.id, r]));
  const zones = model.zones;
  const zoneOf = (room: BuildingRoom) => (room.zoneId ? zones.find((z) => z.id === room.zoneId) : zones.length === 1 ? zones[0] : undefined) ?? null;
  if (zones.length > 1 && model.rooms.some((r) => r.kind === "heated" && !zoneOf(r))) warnings.push("unassignedRooms");
  const thetaOfZone = (z: BuildingZone) => z.thetaInt ?? usageCategories[z.category].thetaInt ?? 20;
  const altitude = station?.altitude ?? 500;
  const rhoC = (1220 - 0.14 * altitude) / 3600; // Wh/(m³K)

  const zoneResults = zones.map((zone): ZoneResult => {
    const zw: Sia3801Warning[] = [];
    const rooms = model.rooms.filter((r) => r.kind === "heated" && zoneOf(r)?.id === zone.id);
    if (!rooms.length) zw.push("noZoneRooms");
    const usage = usageCategories[zone.category];
    const thetaInt = thetaOfZone(zone);
    const dReg = regulationSurcharge[zone.regulation];
    const areaE = rooms.reduce((s, r) => s + (stack.rooms.get(r.id)?.areaExt ?? 0), 0);
    if (rooms.length && areaE <= 0) zw.push("noArea");
    const airflow = zone.airflowOverride ?? (usage.airflow ?? 0.7) * (1 - (zone.wrgEfficiency ?? 0));
    const flow = airflow * areaE; // m³/h

    // Elements of the zone's rooms: transmission coefficient A·U·b per element, with its category.
    type El = { line: ElementLine; hub: number; thetaOther: number | null; floorHeated: boolean; window: { area: number; g: number; fF: number; fs: number } | null };
    const els: El[] = [];
    for (const room of rooms) {
      for (const d of derived.get(room.id) ?? []) {
        const area = derivedArea(d);
        if (area <= 0) continue;
        let adjacency: ElementLine["adjacency"];
        let b = 1;
        let thetaOther: number | null = null;
        if (d.neighbourModelRoomId) {
          const other = roomsById.get(d.neighbourModelRoomId);
          if (!other) continue;
          if (other.kind === "passive") {
            adjacency = "unheated";
            b = unheatedCases[other.unheatedCase][other.unheatedInsulated ? 1 : 0];
          } else {
            const otherZone = zoneOf(other);
            if (!otherZone || otherZone.id === zone.id) continue; // same zone: no loss
            adjacency = "zone";
            thetaOther = thetaOfZone(otherZone);
          }
        } else if (d.adjacency === "unheated") {
          adjacency = "unheated";
          b = unheatedCases[d.unheatedCase][d.unheatedInsulated ? 1 : 0];
        } else if (d.adjacency === "ground") adjacency = "ground";
        else adjacency = "outside";

        const c = d.constructionId ? byId.get(d.constructionId) : undefined;
        if (!c) zw.push("noConstruction");
        const u = c ? constructionValue(c).value : null;
        if (c && u === null) zw.push("noU");
        let window: El["window"] = null;
        if (d.kind === "window" && adjacency === "outside") {
          const g = c?.gValue ?? null;
          if (g === null) zw.push("noG");
          const fF = c?.frameFactor ?? 0.75;
          const sh = d.shading ?? { horizon: 0, overhang: 0, finLeft: 0, finRight: 0 };
          const fs = shadingFactor(horizonFactors, sh.horizon, d.orientation) * shadingFactor(overhangFactors, sh.overhang, d.orientation) * shadingFactor(finFactors, sh.finLeft, d.orientation) * shadingFactor(finFactors, sh.finRight, d.orientation);
          window = { area, g: g ?? 0, fF, fs };
        }
        els.push({
          line: { sourceId: d.sourceId, kind: d.kind, roomNumber: room.number, construction: c ? [c.code, c.name].filter(Boolean).join(" ") : "–", orientation: d.orientation, adjacency, area, u, b, qT: 0, qS: window ? 0 : null },
          hub: area * (u ?? 0) * b,
          thetaOther,
          floorHeated: d.kind === "floor" && zone.floorHeatingFlow !== null,
          window,
        });
      }
    }
    const ath = els.filter((e) => e.line.adjacency !== "zone").reduce((s, e) => s + e.line.area, 0);
    const bridgesH = zone.bridges.reduce((s, br) => s + (br.psi ?? 0) * (br.length ?? 0) * (br.b ?? 1), 0);
    const pct = 1 + (zone.bridgesPct ?? 0) / 100;
    const hT = (els.filter((e) => e.thetaOther === null).reduce((s, e) => s + e.hub, 0) + bridgesH) * pct;
    const hV = flow * rhoC;
    const h = hT + hV;
    const tau = h > 0 ? (heatCapacity[zone.construction] * areaE * 1000) / h : 0;
    const a = (usage.a0 ?? 1) + tau / (usage.tau0 ?? 15);
    const dFloorHeating = zone.floorHeatingFlow === null ? 0 : (zone.floorHeatingFlow - thetaInt) / 4;

    const months: MonthResult[] = monthDays.map((days, m) => {
      const cm = station?.months[m];
      const thetaE = cm?.theta ?? null;
      if (thetaE === null) return { thetaE, qT: 0, qV: 0, qIEl: 0, qIP: 0, qS: 0, qG: 0, gamma: 0, eta: 0, qUg: 0, qH: 0 };
      const hours = 24 * days;
      let qT = 0;
      for (const e of els) {
        const dTheta = e.thetaOther !== null ? thetaInt - e.thetaOther : thetaInt + dReg + (e.floorHeated ? dFloorHeating : 0) - thetaE;
        const q = (e.hub * dTheta * hours) / 1000;
        e.line.qT += Math.max(0, q);
        qT += q;
      }
      qT = Math.max(0, (qT + (bridgesH * (thetaInt + dReg - thetaE) * hours) / 1000) * pct);
      const qV = Math.max(0, (hV * (thetaInt + dReg - thetaE) * hours) / 1000);
      const qIEl = ((usage.electricity ?? 0) * (usage.fEl ?? 1) * days * areaE) / 365;
      const qIP = usage.personArea ? ((usage.personHeat ?? 0) * (usage.presence ?? 0) * days * areaE) / (usage.personArea * 1000) : 0;
      let qS = 0;
      for (const e of els) {
        if (!e.window || !cm) continue;
        const g = radiation(cm, e.line.orientation) ?? 0;
        const q = g * e.window.area * e.window.g * 0.9 * e.window.fF * e.window.fs;
        e.line.qS = (e.line.qS ?? 0) + q;
        qS += q;
      }
      const qG = qIEl + qIP + qS;
      const qTot = qT + qV;
      const gamma = qTot > 0 ? qG / qTot : 0;
      const eta = qTot <= 0 ? 0 : gamma === 1 ? a / (a + 1) : (1 - gamma ** a) / (1 - gamma ** (a + 1));
      const qUg = qG * eta;
      return { thetaE, qT, qV, qIEl, qIP, qS, qG, gamma, eta, qUg, qH: Math.max(0, qTot - qUg) };
    });
    const sum = (k: keyof Omit<MonthResult, "thetaE" | "gamma" | "eta">) => months.reduce((s, x) => s + x[k], 0);
    const year = { qT: sum("qT"), qV: sum("qV"), qIEl: sum("qIEl"), qIP: sum("qIP"), qS: sum("qS"), qG: sum("qG"), qUg: sum("qUg"), qH: sum("qH") };
    const hullRatio = areaE > 0 ? ath / areaE : 0;
    const qHSpecific = areaE > 0 ? year.qH / areaE : 0;
    const fCor = station?.thetaMean === null || station?.thetaMean === undefined ? null : 1 + (9.4 - station.thetaMean) * 0.06;
    const limitNew = fCor === null || usage.qhLi0 === null || usage.dQhLi === null || areaE <= 0 ? null : Math.round((usage.qhLi0 + usage.dQhLi * hullRatio) * fCor * 10) / 10;
    const limit = limitNew === null ? null : zone.state === "renovation" ? Math.round(limitNew * 1.5 * 10) / 10 : limitNew;
    const target = limitNew === null ? null : zone.state === "renovation" ? limitNew : Math.round(limitNew * 0.7 * 10) / 10;
    return {
      zone,
      rooms,
      areaE,
      ath,
      hullRatio,
      thetaInt,
      airflow,
      h,
      tau,
      months,
      year,
      qHSpecific,
      limit,
      target,
      limitNew,
      ok: limit === null || areaE <= 0 ? null : qHSpecific <= limit,
      elements: els.map((e) => e.line),
      bridgesH,
      warnings: [...new Set(zw)],
    };
  });

  const areaE = zoneResults.reduce((s, z) => s + z.areaE, 0);
  const qH = zoneResults.reduce((s, z) => s + z.year.qH, 0);
  const weighted = (pick: (z: ZoneResult) => number | null) => {
    const parts = zoneResults.filter((z) => z.areaE > 0 && pick(z) !== null);
    if (!parts.length || areaE <= 0) return null;
    return parts.reduce((s, z) => s + (pick(z) ?? 0) * z.areaE, 0) / areaE;
  };
  const limit = weighted((z) => z.limit);
  const qHSpecific = areaE > 0 ? qH / areaE : null;
  return {
    station,
    climateSet: model.climate.set,
    zones: zoneResults,
    areaE,
    ath: zoneResults.reduce((s, z) => s + z.ath, 0),
    qH,
    qHSpecific,
    limit,
    target: weighted((z) => z.target),
    ok: limit === null || qHSpecific === null ? null : qHSpecific <= limit,
    warnings: [...new Set([...warnings, ...zoneResults.flatMap((z) => z.warnings)])],
  };
}
