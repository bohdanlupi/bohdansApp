// Sicherheitseinrichtungen of a Wärmeerzeugungsanlage after SWKI HE301-01:2020 (Berechnungsvorlagen/Heizung):
//   – Druckausdehnungsgefäss mit vorgegebener Gasfüllung (3.2.4, 3.2.5, Anhang B.5 / B.6) for the heating water and,
//     with a Sole/Wasser-WP, separately for the Solekreis (3.2.4: X = 2.5, Vwr ≥ 3 dm³, e up to 20 °C / 40 °C)
//   – Sicherheitsventil per Wärmeerzeuger (6.2.3: by Verdampfung qm = Φmax / he, or by Ausdehnung qV = ΦN · 1 l/(h·kW)),
//     pressures after Tabelle 11 / 12, line sizes after Tabelle 3, 5 and 9.
// All pressures are gauge pressures in bar.

import type { EmitterType, GeneratorType } from "./plan-schema";
import type { EwsResult } from "./ews";
import type { HeatingGroup, PlantData } from "./plant-schema";

const G = 9.81;
/** Density of water at the lowest system temperature (10 °C), as in example B.6 [kg/m³]. */
const RHO_MIN = 999.7;
/** Safety margin of the Vordruck with the vessel on the suction side of the pump (3.2.5) [bar]. */
const P0_MARGIN = 0.3;
/** Verdampfungsenthalpie of water up to 10 bar (6.2.3) [kJ/kg]. */
const HE_WATER = 2000;

export type Medium = "water" | "antifreeze30" | "antifreeze40";
export type Glycol = "ethylene" | "propylene";
export type Closing = "0.8" | "0.9";

/** Tabelle 1: Ausdehnungskoeffizient e from 10 °C to the temperature, for water and 30 / 40 Vol-% Frostschutz. */
const TABLE1: [number, number, number, number][] = [
  [10, 0, 0, 0],
  [30, 0.004, 0.013, 0.017],
  [40, 0.0075, 0.016, 0.021],
  [50, 0.012, 0.021, 0.024],
  [60, 0.017, 0.026, 0.03],
  [70, 0.023, 0.031, 0.036],
  [80, 0.029, 0.038, 0.043],
  [90, 0.036, 0.044, 0.05],
  [100, 0.0434, 0.052, 0.058],
  [110, 0.052, 0.06, 0.073],
];

const lerp = (x: number, table: [number, number][]) => {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    const [x0, y0] = table[i - 1];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return table[table.length - 1][1];
};

/** Ausdehnungskoeffizient e (Tabelle 1, linear between the rows) from 10 °C to θ. */
export function expansionCoefficient(theta: number, medium: Medium): number {
  const col = medium === "water" ? 1 : medium === "antifreeze30" ? 2 : 3;
  return lerp(theta, TABLE1.map((r) => [r[0], r[col]] as [number, number]));
}

/**
 * Kubischer Ausdehnungskoeffizient β [1/K] of glycol mixtures, Richtwerte read from Anhang A.5 (Figur 27, Ethylen) and
 * A.6 (Figur 28, Propylen); each curve starts at its Frostsicherheit.
 */
export const glycolCurves: Record<Glycol, Record<number, [number, number][]>> = {
  ethylene: {
    20: [[-10, 135e-6], [0, 200e-6], [20, 310e-6], [40, 410e-6], [60, 510e-6], [80, 600e-6], [100, 675e-6]],
    27: [[-15, 185e-6], [0, 260e-6], [20, 365e-6], [40, 460e-6], [60, 550e-6], [80, 640e-6], [100, 715e-6]],
    34: [[-20, 230e-6], [0, 320e-6], [20, 420e-6], [40, 510e-6], [60, 590e-6], [80, 670e-6], [100, 737e-6]],
  },
  propylene: {
    25: [[-10, 205e-6], [0, 265e-6], [20, 375e-6], [40, 470e-6], [60, 565e-6], [80, 645e-6], [100, 715e-6]],
    38: [[-20, 295e-6], [0, 400e-6], [20, 495e-6], [40, 580e-6], [60, 650e-6], [80, 715e-6], [100, 775e-6]],
  },
};

/** e of a glycol mixture between θmin and θmax: the integral of β (Anhang A.5 / A.6), equivalent to Gl. (5). */
export function glycolExpansion(glycol: Glycol, share: number, thetaMin: number, thetaMax: number): number {
  const curve = glycolCurves[glycol][share] ?? Object.values(glycolCurves[glycol])[0];
  const steps = 40;
  const h = (thetaMax - thetaMin) / steps;
  let sum = 0;
  for (let i = 0; i < steps; i++) sum += lerp(thetaMin + (i + 0.5) * h, curve) * h;
  return Math.max(sum, 0);
}

/** Figur 5: Zuschlagsfaktor X for the Vorlagevolumen, 3 up to 10 kW, 1.5 from 150 kW, linear between. */
export const reserveFactor = (phiN: number) => (phiN <= 10 ? 3 : phiN >= 150 ? 1.5 : 3 - ((phiN - 10) * 1.5) / 140);

/** Tabelle 2: Dampfdruck pv at the maximum abgesicherte Vorlauftemperatur (0 up to 100 °C). */
export const vapourPressure = (thetaMax: number | null) =>
  thetaMax === null || thetaMax <= 100 ? 0 : lerp(thetaMax, [[100, 0], [105, 0.208], [110, 0.433]]);

/** Tabelle 11 / 12: factor between Ansprechdruck and Enddruck, by the Schliessdruck of the Sicherheitsventil. */
export const closingFactor = (c: Closing) => (c === "0.8" ? 1.3 : 1.15);
/** Highest allowed Enddruck pfin for the Ansprechdruck, rounded down to 0.1 bar. */
export const maxEndPressure = (pSV: number, c: Closing) => Math.floor((pSV / closingFactor(c)) * 10 + 1e-9) / 10;

/** Nominal sizes of Druckausdehnungsgefässe offered by the manufacturers [dm³]. */
export const vesselSizes = [8, 12, 18, 25, 35, 50, 80, 100, 140, 200, 250, 300, 400, 500, 600, 800, 1000];
export const nextVesselSize = (vMin: number) => vesselSizes.find((v) => v >= vMin - 1e-9) ?? null;

/** Tabelle 3: DN of the Sicherheits-Ausdehnungsleitung iSL by heating power. */
export const islDn = (phi: number) => ([[300, 20], [600, 25], [900, 32], [1400, 40], [3000, 50], [6000, 65], [9000, 80]] as const).find(([p]) => phi <= p)?.[1] ?? null;

/** Tabelle 5: iSV / iSA2 for Sicherheitsventile sized by Ausdehnung. */
export function expansionValveLines(phi: number) {
  const row = ([[350, 15, 20], [700, 20, 25], [1500, 25, 32], [3000, 32, 40], [5000, 40, 50]] as const).find(([p]) => phi <= p);
  return row ? { flow: row[0], isv: row[1], isa: row[2] } : null;
}

/** Tabelle 9, Spalte A (iSA2 ≤ 10 m, ≤ 8 Bögen) for Sicherheitsventile sized by Verdampfung. */
export function blowOffDn(phi: number, pSV: number): number | null {
  const rows: [number, number, number, number, number][] = [
    [70, 40, 32, 32, 32], [100, 50, 40, 32, 32], [150, 65, 50, 40, 40], [200, 65, 65, 50, 50], [300, 80, 65, 65, 50],
    [400, 100, 80, 65, 65], [500, 100, 80, 80, 65], [650, 125, 100, 80, 65], [800, 125, 100, 100, 80],
    [1000, 150, 125, 100, 100], [1250, 150, 125, 125, 100], [1500, 150, 150, 125, 100], [2000, 200, 150, 150, 125],
    [3000, 250, 200, 200, 150], [5000, 300, 250, 250, 200],
  ];
  // Column of the next lower Ansprechdruck (1, 2, 3, 6 bar): the larger line, on the safe side.
  const col = pSV >= 6 ? 4 : pSV >= 3 ? 3 : pSV >= 2 ? 2 : 1;
  return rows.find(([p]) => phi <= p)?.[col] ?? null;
}

/** Tabelle 13: Richtwerte for the contents (Wärmeabgabe + Verteilleitungen + Wärmeerzeuger) [l/kW] by Vorlauf. */
const TABLE13: Record<"radiator" | "convector" | "floor", [number, number][]> = {
  // Flachrohrradiatoren for «Heizkörper», Konvektoren for Lufterhitzer / Konvektoren.
  radiator: [[40, 34], [50, 19.5], [60, 14.5], [70, 12.5], [75, 11], [90, 9]],
  convector: [[40, 29], [50, 16.5], [60, 12], [70, 10.5], [75, 9], [90, 7.5]],
  floor: [[30, 33], [35, 23]],
};
export function specificContent(emitter: EmitterType, supplyTemp: number): number {
  const row = emitter === "floor" || emitter === "tabs" ? TABLE13.floor : emitter === "air" ? TABLE13.convector : TABLE13.radiator;
  return lerp(supplyTemp, row);
}

/** Richtwert of Vsys from the Heizgruppen (Tabelle 13); groups without power, Vorlauf or Wärmeabgabe are skipped. */
export function estimateSystemVolume(groups: HeatingGroup[], skip: string | null) {
  let volume = 0;
  let skipped = 0;
  for (const g of groups) {
    if (g.id === skip) continue;
    if (g.power === null || g.supplyTemp === null || g.emitter === null) {
      skipped++;
      continue;
    }
    volume += g.power * specificContent(g.emitter, g.supplyTemp);
  }
  return { volume, skipped };
}

// ---------------------------------------------------------------------------
// Druckausdehnungsgefäss mit vorgegebener Gasfüllung
// ---------------------------------------------------------------------------

export type VesselInput = {
  /** Anlageinhalt without Speicher [dm³]. */
  vsys: number;
  /** Speicher volume and its expansion coefficient (at the max. Speichertemperatur), expanded without X (Gl. 4). */
  vsto: number;
  eSto: number;
  e: number;
  x: number;
  /** Static height from the vessel connection to the highest consumer [m]. */
  height: number;
  pv: number;
  /** Additional Vordruck with the vessel on the pressure side of the pump [bar]. */
  extraP0: number;
  pSV: number;
  closing: Closing;
  /** Chosen Enddruck (null = highest allowed). */
  pfin: number | null;
  /** Chosen nominal volume (null = next standard size). */
  vn: number | null;
  /** Minimum Vorlagevolumen [dm³] (Solekreis: 3). */
  minReserve?: number;
};

export type VesselResult = {
  pst: number;
  p0: number;
  pfinMax: number;
  pfin: number;
  vex: number;
  vexTot: number;
  vwr: number;
  vnMin: number | null;
  vn: number | null;
  pfil: number | null;
  /** pfin > p0 (else no vessel works); VN ≥ VN,min; pSV ≥ factor · pfin. */
  ok: { pressures: boolean; volume: boolean | null; safetyValve: boolean };
};

export function sizeVessel(i: VesselInput): VesselResult {
  const pst = (i.height * RHO_MIN * G) / 1e5;
  const p0 = pst + i.pv + P0_MARGIN + i.extraP0;
  const pfinMax = maxEndPressure(i.pSV, i.closing);
  const pfin = i.pfin ?? pfinMax;
  const vex = i.vsys * i.e;
  const vwr = Math.max(vex * (i.x - 1), i.minReserve ?? 0);
  const vexTot = vex + vwr + i.vsto * i.eSto;
  const pressures = pfin > p0;
  const vnMin = pressures ? (vexTot * (pfin + 1)) / (pfin - p0) : null;
  const vn = i.vn ?? (vnMin !== null ? nextVesselSize(vnMin) : null);
  const pfil = vn !== null && vn > vwr ? (vn * (p0 + 1)) / (vn - vwr) - 1 : null;
  return {
    pst,
    p0,
    pfinMax,
    pfin,
    vex,
    vexTot,
    vwr,
    vnMin,
    vn,
    pfil,
    ok: { pressures, volume: vn !== null && vnMin !== null ? vn >= vnMin - 1e-9 : null, safetyValve: i.pSV >= closingFactor(i.closing) * pfin - 1e-9 },
  };
}

// ---------------------------------------------------------------------------
// Whole Anlage
// ---------------------------------------------------------------------------

/** Generators whose heating surfaces can be hotter than the saturation temperature at pSV: SV sized by Verdampfung. */
export const evaporates = (g: GeneratorType) => g === "pellets" || g === "logWood" || g === "gasOil";

export type ValveResult = {
  /** Id of the generator unit. */
  id: string;
  generator: GeneratorType;
  power: number | null;
  mode: "evaporation" | "expansion";
  /** Verdampfung: Dampf-Massenstrom [kg/h]; Ausdehnung: Volumenstrom [l/h]. */
  flow: number | null;
  /** DN of iSV / iSA2 (Tabelle 5) or iSA2 after Tabelle 9 column A; null when unknown. */
  isv: number | null;
  isa: number | null;
};

export type SafetyResult = {
  phiN: number;
  x: number;
  e: number;
  meanTemp: number;
  eSto: number;
  vsysEstimate: { volume: number; skipped: number };
  vsys: number;
  vessel: VesselResult;
  isl: number | null;
  valves: ValveResult[];
  /**
   * Solekreis after HE301-01, its content from the EWS calculation unless entered, and the minimum size after SIA 384/6
   * 3.4.2.6 (3 × ΔV/V0, ≥ 18 l); the larger one is chosen.
   */
  brine: (VesselResult & { e: number; vsys: number; sia: EwsResult["vessel"] | null; chosen: number | null }) | null;
  hints: ("pressureLimiter" | "waterShortage" | "preVessel" | "logWood" | "highPressure" | "noPower")[];
};

export function evaluateSafety(data: PlantData, ews: EwsResult | null = null): SafetyResult {
  const s = data.safety;
  const powers = data.generators.map((g) => g.power);
  const phiN = powers.reduce<number>((sum, p) => sum + (p ?? 0), 0);
  const x = reserveFactor(phiN);
  const means = data.groups.flatMap((g) => (g.supplyTemp !== null && g.returnTemp !== null ? [(g.supplyTemp + g.returnTemp) / 2] : []));
  const meanTemp = s.meanTemp ?? (means.length ? Math.max(...means) : 50);
  const e = expansionCoefficient(meanTemp, s.medium);
  const eSto = expansionCoefficient(s.storageTemp ?? 60, s.medium);
  const wwGroup = data.hotWater && data.hotWaterConnection === "group" ? data.hotWaterGroup : null;
  const vsysEstimate = estimateSystemVolume(data.groups, wwGroup);
  const vsys = s.vsys ?? vsysEstimate.volume;
  const vessel = sizeVessel({
    vsys,
    vsto: data.storage ? (data.storageVolume ?? 0) : 0,
    eSto,
    e,
    x,
    height: s.height ?? 0,
    pv: vapourPressure(s.thetaMax),
    extraP0: s.extraP0 ?? 0,
    pSV: s.pSV,
    closing: s.closing,
    pfin: s.pfin,
    vn: s.vn,
  });
  const valves = data.generators.map(({ id, type, power }): ValveResult => {
    if (evaporates(type)) {
      return { id, generator: type, power, mode: "evaporation", flow: power !== null ? (power / HE_WATER) * 3600 : null, isv: null, isa: power !== null ? blowOffDn(power, s.pSV) : null };
    }
    const lines = power !== null ? expansionValveLines(power) : null;
    return { id, generator: type, power, mode: "expansion", flow: power, isv: lines?.isv ?? null, isa: lines?.isa ?? null };
  });
  const b = s.brine;
  const types = data.generators.map((g) => g.type);
  const brine = types.includes("hpBrine")
    ? (() => {
        const eb = glycolExpansion(b.glycol, b.share, b.minTemp, b.regeneration ? 40 : 20);
        const vsysB = b.vsys ?? ews?.volume ?? 0;
        const v = sizeVessel({ vsys: vsysB, vsto: 0, eSto: 0, e: eb, x: 2.5, height: b.height ?? 0, pv: 0, extraP0: 0, pSV: b.pSV, closing: b.closing, pfin: b.pfin, vn: b.vn, minReserve: 3 });
        const sia = ews?.vessel ?? null;
        return { ...v, e: eb, vsys: vsysB, sia, chosen: v.vn !== null || sia ? Math.max(v.vn ?? 0, sia?.size ?? 0) : null };
      })()
    : null;
  const hints: SafetyResult["hints"] = [];
  if (powers.some((p) => p === null)) hints.push("noPower");
  if (phiN > 300) hints.push("pressureLimiter");
  if (types.some(evaporates)) hints.push("waterShortage");
  if (meanTemp > 70) hints.push("preVessel");
  if (types.includes("logWood")) hints.push("logWood");
  if (vessel.pfin > 2.3) hints.push("highPressure");
  return { phiN, x, e, meanTemp, eSto, vsysEstimate, vsys, vessel, isl: phiN > 0 ? islDn(phiN) : null, valves, brine, hints };
}
