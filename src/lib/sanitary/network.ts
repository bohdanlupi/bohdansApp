// Drinking water system of a building (Sanitäranlage) for the Prinzipschema and the calculations:
//   Zentrale:  Hausanschluss → Wasserzähler → Filter / Druckreduzierventil → Verteilbatterie → PWC Verteilung
//              Verteilbatterie → Sicherheitsgruppe → Wassererwärmer (neutral) → PWH Verteilung, PWH-C back via pump
//   Verteilung: a tree of pipe sections that each carry PWC and / or PWH, with the PWH-C «konventionell» (separate
//              steel return) or «Rohr an Rohr» (Optiflex return along the steel PWH) – as the Nussbaum
//              Zirkulationsberechnung (Berechnungsvorlagen/Sanitär); Steigstränge («riser») are drawn vertically.
//   Leaves:     Apparategruppen with their outlets (SVGW W3 Tabelle 3).
// Sizing of PWC / PWH after SVGW W3 (w3.ts); PWH-C, flows and pump after the heat-loss method of the workbook:
//   Q' = q'·L (konventionell 2·L at 0.12 kWh/(m·d), Rohr an Rohr L at 0.15), V_pump = ΣQ'·1000/24 / (ρ·c·ΔT),
//   split at each branch in the ratio of the heat losses behind it; Δp = L·(1 + Zuschlag)·(R_PWH + R_PWH-C);
//   pump head = longest circuit + Rückflussverhinderer + Regulierorgan (fully open).

import { type BiralPump, biralPumps } from "./catalog-data";
import {
  findSize,
  frictionPerMetre,
  type InsulationMaterial,
  insulationThickness,
  nextSize,
  type PipeSize,
  type PipeSystem,
  rarReturnSizes,
  sizeByOd,
  sizeForVelocity,
  supplySizes,
  velocity,
} from "./pipes";
import { appliances, type Appliances, applianceKeys, peakFlow, tableSize, velocityLimits, type W3Table } from "./w3";

export type Circulation = "none" | "conventional" | "rar";
export type PipeRole = "auto" | "distribution" | "floor";
export type RegValve = "thermal" | "manual";
export type Medium = "pwc" | "pwh" | "pwhc";

export type SanNode = {
  id: string;
  type: "pipe" | "consumer";
  label: string;
  /** Storey: consumers where they are; riser sections the storey at their upper end. */
  floor: string;
  /** Pipe length [m] (PWC, PWH and PWH-C run the same way). */
  length: number | null;
  /** Steigstrang section: drawn vertically, the first one of a chain gets the Strang valves. */
  riser: boolean;
  role: PipeRole;
  pwc: boolean;
  pwh: boolean;
  system: PipeSystem;
  circulation: Circulation;
  /** Pipe size keys chosen by hand (null = sized automatically). */
  sizePwc: string | null;
  sizePwh: string | null;
  sizePwhc: string | null;
  /** Wohnungswasserzähler at the start (Stockwerkverteilung «mit Wasserzähler»). */
  meter: boolean;
  /** Absperrventile at the start (Steigstränge always get them). */
  shutoff: boolean;
  /** Regulierventil of the Zirkulation at the foot of a Strang. */
  regValve: RegValve;
  /** Bogen 90° / 45° of the Leitung (each of its lines PWC / PWH / PWH-C gets them in its size). */
  bends90: number;
  bends45: number;
  appliances: Appliances;
  children: SanNode[];
};

export type Central = {
  /** Hausanschlussleitung: developed length [m] for W3 Tabelle 5. */
  houseLength: number | null;
  /** Verteilbatterie → start of the Verteilung [m] (part of the developed length of the Verteilleitungen). */
  centralLength: number | null;
  /** Lengths in the Zentrale for pipes and insulation [m]: Hauseinführung → Verteilbatterie, and Wassererwärmer →
   * start of the Verteilung (its cold feed, PWH and PWH-C). */
  trunkLength: number | null;
  heaterLength: number | null;
  meter: boolean;
  filter: "none" | "fine" | "redfil";
  reducer: boolean;
  softener: "none" | "heater" | "all";
  heaterLabel: string;
  heaterVolume: number | null;
  safetyGroup: boolean;
  mixer: boolean;
};

export type Settings = {
  /** Hot water leaving the heater / returning [°C]. */
  tHot: number;
  tReturn: number;
  /** Heat loss per metre [kWh/(m·d)]: per pipe (konventionell), per pair (Rohr an Rohr). */
  lossConventional: number;
  lossRar: number;
  /** Allowance for fittings on the pipe length (0.2 = 20 %). */
  allowance: number;
  /** Pressure drops [mbar] of the Rückflussverhinderer and of the Regulierorgan fully open. */
  dpCheck: number;
  dpValve: number;
  /** Max. velocity of the PWH-C when sized automatically [m/s]. */
  vCirc: number;
  /** Insulation material of the thickness tables (Dämmung_Sanitär.xlsx): PIR or Mineralwolle. */
  insulationMaterial: InsulationMaterial;
  /** Insulate the PWC Verteil- und Steigleitungen (SIA 385/1 3.1.4: cold water max. 25 °C). */
  pwcInsulation: boolean;
  /** Biral article number chosen by hand (null = suggestion). */
  pump: string | null;
};

export type SanitaryData = { central: Central; settings: Settings; network: SanNode[]; notes: string };

export const defaultCentral = (): Central => ({
  houseLength: null,
  centralLength: null,
  trunkLength: null,
  heaterLength: null,
  meter: true,
  filter: "redfil",
  reducer: false,
  softener: "none",
  heaterLabel: "",
  heaterVolume: null,
  safetyGroup: true,
  mixer: false,
});

export const defaultSettings = (): Settings => ({
  tHot: 60,
  tReturn: 57,
  lossConventional: 0.12,
  lossRar: 0.15,
  allowance: 0.2,
  dpCheck: 85,
  dpValve: 105,
  vCirc: 0.5,
  insulationMaterial: "mineralwool",
  pwcInsulation: true,
  pump: null,
});

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type SizeSource = "manual" | "table" | "velocity" | "none";
export type Sized = { size: PipeSize; source: SizeSource; table: W3Table | null; flow: number; velocity: number; limit: number };

export type CircResult = {
  heatLoss: number;
  /** Circulation flow [l/h]. */
  flow: number;
  rPwh: number;
  rPwhc: number;
  dp: number;
  /** Δp from the heater up to the end of this section [mbar]. */
  cumulative: number;
};

export type PipeResult = {
  id: string;
  role: "distribution" | "floor";
  lu: { cold: number; warm: number };
  /** Peak flows after Diagramm 1 [l/s]. */
  qd: { cold: number; warm: number };
  pwc: Sized | null;
  pwh: Sized | null;
  pwhc: { size: PipeSize; source: SizeSource; velocity: number } | null;
  circ: CircResult | null;
  /** Insulation thickness [mm] per line; «shared»: one insulation around PWH and PWH-C (Rohr an Rohr) and its size. */
  insulation: { pwc: number | null; pwh: number | null; pwhc: number | null; shared: { mm: number; size: PipeSize } | null };
  /** Strang number when this is the foot of a Steigstrang. */
  strang: number | null;
};

export type Circuit = { endId: string; footId: string | null; path: number; throttle: number; flow: number };

export type PumpSuggestion = {
  flow: number;
  heatLoss: number;
  critical: number;
  head: number;
  chosen: BiralPump | null;
  suggested: BiralPump | null;
  /** The chosen pump reaches the head (max. head of the type ≥ required). */
  ok: boolean;
};

export type SystemResult = {
  pipes: Map<string, PipeResult>;
  lu: { cold: number; warm: number };
  qd: { cold: number; warm: number; total: number };
  /** Developed length of the Verteilleitungen [m] (W3 Tabelle 4.3). */
  distLength: number;
  house: { dn: string | null; lu: number };
  central: {
    trunk: Sized | null;
    feed: Sized | null;
    supply: Sized | null;
    hot: Sized | null;
    ret: PipeSize | null;
    /** Insulation [mm] of the Zentrale lines: PWC (by setting), PWH and PWH-C (warmgehalten). */
    insulation: { trunk: number | null; supply: number | null; feed: number | null; hot: number | null; ret: number | null };
  };
  pump: PumpSuggestion | null;
  circuits: Circuit[];
  warnings: Warning[];
};

export type Warning =
  | { kind: "fast"; id: string; medium: Medium; velocity: number; limit: number }
  | { kind: "circulationGap"; id: string }
  | { kind: "deltaT"; value: number }
  | { kind: "temperature" }
  | { kind: "tooHot" }
  | { kind: "noConsumers" }
  | { kind: "pumpHead"; head: number }
  | { kind: "tableExceeded"; id: string; medium: Medium };

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

export const newNode = (type: SanNode["type"], patch: Partial<SanNode> = {}): SanNode => ({
  id: newId(),
  type,
  label: "",
  floor: "",
  length: type === "pipe" ? 1 : null,
  riser: false,
  role: "auto",
  pwc: true,
  pwh: true,
  system: "optipress",
  circulation: "none",
  sizePwc: null,
  sizePwh: null,
  sizePwhc: null,
  meter: false,
  shutoff: false,
  regValve: "thermal",
  bends90: 0,
  bends45: 0,
  appliances: {},
  children: [],
  ...patch,
});

export function mapTree(roots: SanNode[], fn: (node: SanNode) => SanNode | null): SanNode[] {
  return roots.flatMap((n) => {
    const mapped = fn({ ...n, children: mapTree(n.children, fn) });
    return mapped ? [mapped] : [];
  });
}

export function findNode(roots: SanNode[], id: string): SanNode | null {
  for (const n of roots) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return null;
}

export function pathTo(roots: SanNode[], id: string): string[] {
  for (const n of roots) {
    if (n.id === id) return [n.id];
    const sub = pathTo(n.children, id);
    if (sub.length) return [n.id, ...sub];
  }
  return [];
}

/** LU of the outlets of a consumer. */
export function consumerLu(a: Appliances) {
  let cold = 0;
  let warm = 0;
  let largestCold = 0;
  let largestWarm = 0;
  for (const key of applianceKeys) {
    const n = a[key] ?? 0;
    if (!n) continue;
    const def = appliances[key];
    cold += n * def.cold;
    warm += n * def.warm;
    if (def.cold) largestCold = Math.max(largestCold, def.q);
    if (def.warm) largestWarm = Math.max(largestWarm, def.q);
  }
  return { cold, warm, largestCold, largestWarm };
}

/** Is the circulation of a section continued from the heater (all sections before it circulated too)? */
const isCirculated = (n: SanNode) => n.type === "pipe" && n.pwh && n.circulation !== "none";

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export function evaluateSystem(data: SanitaryData): SystemResult {
  const { settings, central } = data;
  const pipes = new Map<string, PipeResult>();
  const warnings: Warning[] = [];

  // LU per subtree.
  type Load = { cold: number; warm: number; largestCold: number; largestWarm: number; consumers: number; riser: boolean };
  const loads = new Map<string, Load>();
  const load = (n: SanNode): Load => {
    const own = n.type === "consumer" ? consumerLu(n.appliances) : { cold: 0, warm: 0, largestCold: 0, largestWarm: 0 };
    const acc: Load = { ...own, consumers: n.type === "consumer" ? 1 : 0, riser: n.type === "pipe" && n.riser };
    for (const c of n.children) {
      const l = load(c);
      acc.cold += l.cold;
      acc.warm += l.warm;
      acc.largestCold = Math.max(acc.largestCold, l.largestCold);
      acc.largestWarm = Math.max(acc.largestWarm, l.largestWarm);
      acc.consumers += l.consumers;
      acc.riser ||= l.riser;
    }
    loads.set(n.id, acc);
    return acc;
  };
  const total = data.network.map(load).reduce(
    (s, l) => ({ cold: s.cold + l.cold, warm: s.warm + l.warm, largestCold: Math.max(s.largestCold, l.largestCold), largestWarm: Math.max(s.largestWarm, l.largestWarm) }),
    { cold: 0, warm: 0, largestCold: 0, largestWarm: 0 },
  );
  if (total.cold + total.warm === 0) warnings.push({ kind: "noConsumers" });

  // Roles and developed lengths.
  const roles = new Map<string, "distribution" | "floor">();
  const assignRoles = (n: SanNode, riserAbove: boolean) => {
    if (n.type !== "pipe") return;
    const l = loads.get(n.id)!;
    let role: "distribution" | "floor";
    if (n.role !== "auto") role = n.role;
    else if (n.riser || l.riser) role = "distribution";
    else if (riserAbove) role = "floor";
    else role = l.consumers <= 1 ? "floor" : "distribution";
    roles.set(n.id, role);
    n.children.forEach((c) => assignRoles(c, riserAbove || n.riser));
  };
  data.network.forEach((n) => assignRoles(n, false));

  const pipeLength = (n: SanNode) => (n.type === "pipe" ? (n.length ?? 0) : 0);
  // Distribution: longest path through distribution pipes, plus the line in the Zentrale.
  const distPath = (n: SanNode): number =>
    n.type === "pipe" && roles.get(n.id) === "distribution" ? pipeLength(n) + Math.max(0, ...n.children.map(distPath)) : 0;
  const distLength = (central.centralLength ?? 0) + Math.max(0, ...data.network.map(distPath));
  // Floor groups: longest path from the group's first floor pipe.
  const floorPath = (n: SanNode): number => (n.type === "pipe" && roles.get(n.id) === "floor" ? pipeLength(n) + Math.max(0, ...n.children.map(floorPath)) : 0);
  const groupOf = new Map<string, { length: number; meter: boolean }>();
  const assignGroups = (n: SanNode, group: { length: number; meter: boolean } | null) => {
    let g = group;
    if (n.type === "pipe" && roles.get(n.id) === "floor") {
      if (!g) g = { length: floorPath(n), meter: n.meter };
      groupOf.set(n.id, g);
    } else g = null;
    n.children.forEach((c) => assignGroups(c, g));
  };
  data.network.forEach((n) => assignGroups(n, null));

  // PWC / PWH sizes.
  const sizeSupply = (n: SanNode, medium: "pwc" | "pwh", lu: number, largest: number): Sized | null => {
    const role = roles.get(n.id)!;
    const flow = peakFlow(lu * 0.1, largest);
    const limit = role === "floor" ? velocityLimits.floor : velocityLimits.distribution;
    const manual = findSize(medium === "pwc" ? n.sizePwc : n.sizePwh);
    const list = supplySizes(n.system);
    if (manual) return { size: manual, source: "manual", table: null, flow, velocity: velocity(manual, flow), limit };
    if (lu <= 0) {
      const smallest = list[0];
      return smallest ? { size: smallest, source: "none", table: null, flow: 0, velocity: 0, limit } : null;
    }
    const table: W3Table | null = role === "distribution" ? (n.system === "optipress" ? "4.3" : null) : n.system === "optiflex" ? "4.1" : "4.2";
    const group = groupOf.get(n.id);
    const od = table ? tableSize(table, lu, role === "distribution" ? distLength : (group?.length ?? pipeLength(n)), group?.meter ?? false) : null;
    const fromTable = od ? sizeByOd(n.system, od) : null;
    if (fromTable) return { size: fromTable, source: "table", table, flow, velocity: velocity(fromTable, flow), limit };
    if (table) warnings.push({ kind: "tableExceeded", id: n.id, medium });
    const byVelocity = sizeForVelocity(list, flow, limit);
    return byVelocity ? { size: byVelocity, source: "velocity", table: null, flow, velocity: velocity(byVelocity, flow), limit } : null;
  };

  // Circulation: heat losses per subtree (only sections circulated from the heater on).
  const circulated = new Set<string>();
  const markCirculation = (n: SanNode, parentOk: boolean) => {
    if (n.type !== "pipe") return;
    if (isCirculated(n)) {
      if (parentOk) circulated.add(n.id);
      else warnings.push({ kind: "circulationGap", id: n.id });
    }
    n.children.forEach((c) => markCirculation(c, parentOk && circulated.has(n.id)));
  };
  data.network.forEach((n) => markCirculation(n, true));
  const ownLoss = (n: SanNode) =>
    circulated.has(n.id) ? (n.circulation === "conventional" ? 2 * pipeLength(n) * settings.lossConventional : pipeLength(n) * settings.lossRar) : 0;
  const lossBelow = new Map<string, number>();
  const sumLoss = (n: SanNode): number => {
    if (!circulated.has(n.id)) return 0;
    const q = ownLoss(n) + n.children.reduce((s, c) => s + sumLoss(c), 0);
    lossBelow.set(n.id, q);
    return q;
  };
  const heatLoss = data.network.reduce((s, n) => s + sumLoss(n), 0);
  const deltaT = settings.tHot - settings.tReturn;
  // V [l/h] = Q [kWh/d] · 1000/24 W / (ρ c ΔT) · 3600 · 1000
  const pumpFlow = deltaT > 0 ? ((heatLoss * 1000) / 24 / (1000 * 4180 * deltaT)) * 3.6e6 : 0;
  const flows = new Map<string, number>();
  const split = (list: SanNode[], flow: number) => {
    const circ = list.filter((c) => circulated.has(c.id));
    const sum = circ.reduce((s, c) => s + (lossBelow.get(c.id) ?? 0), 0);
    for (const c of circ) {
      const f = sum > 0 ? (flow * (lossBelow.get(c.id) ?? 0)) / sum : flow / circ.length;
      flows.set(c.id, f);
      split(c.children, f);
    }
  };
  split(data.network, pumpFlow);
  const tMean = (settings.tHot + settings.tReturn) / 2;

  // Strang numbers: foot of each riser chain in tree order.
  let strangNo = 0;
  const circuits: Circuit[] = [];

  const visit = (n: SanNode, parentRiser: boolean, before: number, foot: string | null) => {
    if (n.type !== "pipe") return;
    const l = loads.get(n.id)!;
    const role = roles.get(n.id)!;
    const pwc = n.pwc ? sizeSupply(n, "pwc", l.cold, l.largestCold) : null;
    const pwh = n.pwh ? sizeSupply(n, "pwh", l.warm, l.largestWarm) : null;
    for (const [medium, s] of [["pwc", pwc], ["pwh", pwh]] as const) {
      if (s && s.velocity > s.limit + 1e-9) warnings.push({ kind: "fast", id: n.id, medium, velocity: s.velocity, limit: s.limit });
    }

    let pwhc: PipeResult["pwhc"] = null;
    let circ: CircResult | null = null;
    if (circulated.has(n.id)) {
      const flow = flows.get(n.id) ?? 0;
      const flowLs = flow / 3600;
      const list = n.circulation === "rar" ? rarReturnSizes() : supplySizes("optipress");
      const manual = findSize(n.sizePwhc);
      const size = manual && list.includes(manual) ? manual : sizeForVelocity(list, flowLs, settings.vCirc)!;
      pwhc = { size, source: manual && list.includes(manual) ? "manual" : "velocity", velocity: velocity(size, flowLs) };
      const rPwh = pwh ? frictionPerMetre(pwh.size, flow, tMean) : 0;
      const rPwhc = frictionPerMetre(size, flow, tMean);
      const dp = pipeLength(n) * (1 + settings.allowance) * (rPwh + rPwhc);
      circ = { heatLoss: ownLoss(n), flow, rPwh, rPwhc, dp, cumulative: before + dp };
    }

    // Insulation after the LUPI standard (Dämmung_Sanitär.xlsx): PWH of circulated sections and of the Verteilung
    // from the heater, PWH-C (SIA 385/1 5.3.1.1 warmgehaltene Teile, EnDK EN-103 9.1 d). Konventionell: PWH and PWH-C
    // each by their own size. Rohr an Rohr: one insulation by the PWH size from the table «Rohr an Rohr» (= a fictive
    // PWH one dimension larger), the PWH-C none of its own. PWC Verteil- und Steigleitungen by setting.
    // Ausstossleitungen stay without (SIA 385/1 5.4).
    const insulated = circulated.has(n.id) || role === "distribution";
    const shared = circulated.has(n.id) && n.circulation === "rar" && pwh && pwhc ? nextSize(pwh.size) : null;
    const insulation: PipeResult["insulation"] = {
      pwc: pwc && settings.pwcInsulation && role === "distribution" ? insulationThickness("cold", pwc.size, settings.insulationMaterial) : null,
      pwh: pwh && insulated && !shared ? insulationThickness("hot", pwh.size, settings.insulationMaterial) : null,
      pwhc: pwhc && !shared ? insulationThickness("hot", pwhc.size, settings.insulationMaterial) : null,
      shared: shared && pwh ? { mm: insulationThickness("rar", pwh.size, settings.insulationMaterial), size: shared } : null,
    };

    const isFoot = n.riser && !parentRiser;
    const strang = isFoot ? ++strangNo : null;
    const footId = isFoot ? n.id : foot;
    pipes.set(n.id, {
      id: n.id,
      role,
      lu: { cold: l.cold, warm: l.warm },
      qd: { cold: peakFlow(l.cold * 0.1, l.largestCold), warm: peakFlow(l.warm * 0.1, l.largestWarm) },
      pwc,
      pwh,
      pwhc,
      circ,
      insulation,
      strang,
    });

    const cumulative = circ?.cumulative ?? before;
    if (circ && !n.children.some((c) => circulated.has(c.id))) {
      circuits.push({ endId: n.id, footId, path: cumulative, throttle: 0, flow: circ.flow });
    }
    n.children.forEach((c) => visit(c, n.riser, cumulative, footId));
  };
  data.network.forEach((n) => visit(n, false, 0, null));

  const critical = circuits.reduce((m, c) => Math.max(m, c.path), 0);
  for (const c of circuits) c.throttle = critical - c.path;

  // Zentrale: trunk (cold + warm), PWC to the Verteilung, cold feed of the heater, PWH from it and the return.
  const sizeCentral = (lu: number, largest: number): Sized | null => {
    if (lu <= 0) return null;
    const flow = peakFlow(lu * 0.1, largest);
    const od = tableSize("4.3", lu, distLength);
    const fromTable = od ? sizeByOd("optipress", od) : null;
    const size = fromTable ?? sizeForVelocity(supplySizes("optipress"), flow, velocityLimits.distribution);
    return size ? { size, source: fromTable ? "table" : "velocity", table: fromTable ? "4.3" : null, flow, velocity: velocity(size, flow), limit: velocityLimits.distribution } : null;
  };
  const allLu = total.cold + total.warm;
  const largestAll = Math.max(total.largestCold, total.largestWarm);
  const rootReturns = data.network.map((n) => pipes.get(n.id)?.pwhc?.size).filter((s): s is PipeSize => !!s && s.system === "optipress");
  const ret = heatLoss > 0 ? (rootReturns.sort((a, b) => b.od - a.od)[0] ?? sizeForVelocity(supplySizes("optipress"), pumpFlow / 3600, settings.vCirc)) : null;

  // Pump: suggestion from the Biral BLUE range (type head ≥ required, the size fitting the return).
  let pump: PumpSuggestion | null = null;
  if (heatLoss > 0) {
    const head = critical + settings.dpCheck + settings.dpValve;
    const mbarPerM = 98.07;
    const wantDn = !ret || ret.od <= 22 ? 20 : ret.od <= 28 ? 25 : ret.od <= 35 ? 32 : 40;
    const candidates = biralPumps
      .filter((p) => !p.valves && p.head * mbarPerM >= head)
      .sort((a, b) => a.head - b.head || Math.abs(a.dn - wantDn) - Math.abs(b.dn - wantDn) || (a.series === "CompAX" ? -1 : 1));
    const suggested = candidates[0] ?? null;
    const chosen = biralPumps.find((p) => p.number === settings.pump) ?? suggested;
    const ok = !!chosen && chosen.head * mbarPerM >= head;
    if (!ok) warnings.push({ kind: "pumpHead", head });
    pump = { flow: pumpFlow, heatLoss, critical, head, chosen, suggested, ok };
  }

  if (deltaT > 5) warnings.push({ kind: "deltaT", value: deltaT });
  if (settings.tHot < 60 || settings.tReturn < 55) warnings.push({ kind: "temperature" });
  // SIA 385/1 4.1.1: hot water in the distribution at most 65 °C.
  if (settings.tHot > 65) warnings.push({ kind: "tooHot" });

  // Zentrale: sizes and insulation of its lines (same tables as the Verteilung).
  function centralLines(): SystemResult["central"] {
    const trunk = sizeCentral(allLu, largestAll);
    const supply = sizeCentral(total.cold, total.largestCold);
    const feed = sizeCentral(total.warm, total.largestWarm);
    const hot = sizeCentral(total.warm, total.largestWarm);
    const cold = (s: Sized | null) => (s && settings.pwcInsulation ? insulationThickness("cold", s.size, settings.insulationMaterial) : null);
    return {
      trunk,
      supply,
      feed,
      hot,
      ret,
      insulation: {
        trunk: cold(trunk),
        supply: cold(supply),
        feed: cold(feed),
        hot: hot ? insulationThickness("hot", hot.size, settings.insulationMaterial) : null,
        ret: ret ? insulationThickness("hot", ret, settings.insulationMaterial) : null,
      },
    };
  }

  const houseLu = allLu;
  return {
    pipes,
    lu: { cold: total.cold, warm: total.warm },
    qd: { cold: peakFlow(total.cold * 0.1, total.largestCold), warm: peakFlow(total.warm * 0.1, total.largestWarm), total: peakFlow(allLu * 0.1, largestAll) },
    distLength,
    house: { dn: houseLu > 0 ? tableSize("5", Math.max(houseLu, 60), Math.max(central.houseLength ?? 10, 10)) : null, lu: houseLu },
    central: centralLines(),
    pump,
    circuits,
    warnings,
  };
}
