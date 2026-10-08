// 243 Wärmeverteilung of an Anlage (Strangschema): one tree of pipe sections per Heizgruppe of 242, from the group to
// its Heizkörper (rooms of the Wärmebedarf), Fussbodenheizungs-Verteiler (from their calculation) and free consumers.
//   Flows:      Heizkörper Φ / (cp · (θVL − θRL)) of the group; FBH-Verteiler the mass flow of its calculation;
//               each section carries the sum of the terminals behind it.
//   Sizes:      Optipress-Therm (C-Stahl, Nussbaum) as standard, Optiflex-Flowpress (Mehrschichtverbund) selectable;
//               by the velocity Richtwerte of 242 (hydraulics.ts) or chosen by hand.
//   Δp:         Darcy–Weisbach / Colebrook in VL and RL at their temperatures; Formstücke as a percentage of the pipe
//               friction, or – where Bögen 45° / 90° are entered on a section – with their ζ instead. Terminals add the
//               Heizkörperventil + Verschraubung or the highest circuit Δp of the FBH-Verteiler. Critical circuit,
//               Drosselbedarf of the others and the required head of the group pump.
//   Auskühlung: heat loss per metre q = (θ − θU) / (ln(Da/D)/(2πλ) + 1/(h·π·Da)) with the insulation of SIA 384/1
//               Tabelle 2 (or chosen), θU by the surroundings (beheizt / unbeheizt / aussen); the Vorlauf cools down
//               along the path: Δθ = Q / (ṁ · cp).

import { maxVelocity, pipeSizes as thermSizes } from "./hydraulics";
import { CP_WATER } from "./water";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export type HeatNodeType = "pipe" | "radiator" | "floor" | "consumer";
export type PipeSystem = "therm" | "flowpress";
export type Ambient = "heated" | "unheated" | "outside";
export type PipeRole = "auto" | "distribution" | "floor";

export type HeatNode = {
  id: string;
  type: HeatNodeType;
  label: string;
  /** Storey: terminals where they are; riser sections the storey at their upper end. */
  floor: string;
  // Pipe sections
  /** Pipe length [m] (VL and RL run the same way). */
  length: number | null;
  /** Steigstrang section: drawn vertically, the first of a chain gets the Strang valves. */
  riser: boolean;
  role: PipeRole;
  system: PipeSystem;
  /** Pipe size key chosen by hand (null = by velocity). */
  size: string | null;
  /** Bögen 90° / 45° in VL and RL each; when any are entered they replace the percentage for this section. */
  bends90: number;
  bends45: number;
  ambient: Ambient;
  /** Insulation thickness [mm] chosen by hand (null = SIA 384/1 Tabelle 2; 0 = none). */
  insulation: number | null;
  /** Absperrungen at the start; Strangregulierventil at the foot of a Strang. */
  shutoff: boolean;
  regValve: boolean;
  // Heizkörper: room of the Wärmebedarf
  calcId: string | null;
  roomId: string | null;
  // Fussbodenheizungs-Verteiler: system (heating_systems) and its distributor
  systemId: string | null;
  distributorId: string | null;
  /** Power [W] (Heizkörper: instead of the room load; consumer: required). */
  power: number | null;
  /** Pressure drop of the terminal [kPa] (Heizkörper: instead of the setting; consumer: required). */
  dp: number | null;
  children: HeatNode[];
};

export type DistributionSettings = {
  /** Surrounding temperatures [°C]; outside null = Norm-Aussentemperatur of the site. */
  tHeated: number;
  tUnheated: number;
  tOutside: number | null;
  /** Thermal conductivity of the insulation [W/(m·K)] (≤ 0.03 or 0.03 … 0.05: column of SIA 384/1 Tabelle 2). */
  lambda: number;
  /** Formstücke as a share of the pipe friction (0.3 = 30 %). */
  allowance: number;
  /** ζ of a Bogen 90° / 45°. */
  zeta90: number;
  zeta45: number;
  /** Heizkörperventil + Rücklaufverschraubung [kPa]. */
  valveDp: number;
};

export type DistributionData = {
  settings: DistributionSettings;
  /** Network per Heizgruppe (key: group id of the Anlage). */
  networks: Record<string, HeatNode[]>;
  notes: string;
};

export const defaultDistributionSettings = (): DistributionSettings => ({
  tHeated: 20,
  tUnheated: 10,
  tOutside: null,
  lambda: 0.035,
  allowance: 0.3,
  zeta90: 0.7,
  zeta45: 0.4,
  valveDp: 10,
});

export const emptyDistribution = (): DistributionData => ({ settings: defaultDistributionSettings(), networks: {}, notes: "" });

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

export const newHeatNode = (type: HeatNodeType, patch: Partial<HeatNode> = {}): HeatNode => ({
  id: newId(),
  type,
  label: "",
  floor: "",
  length: type === "pipe" ? 1 : null,
  riser: false,
  role: "auto",
  system: "therm",
  size: null,
  bends90: 0,
  bends45: 0,
  ambient: "heated",
  insulation: null,
  shutoff: false,
  regValve: false,
  calcId: null,
  roomId: null,
  systemId: null,
  distributorId: null,
  power: null,
  dp: null,
  children: [],
  ...patch,
});

export function mapHeatTree(roots: HeatNode[], fn: (node: HeatNode) => HeatNode | null): HeatNode[] {
  return roots.flatMap((n) => {
    const mapped = fn({ ...n, children: mapHeatTree(n.children, fn) });
    return mapped ? [mapped] : [];
  });
}

export function findHeatNode(roots: HeatNode[], id: string): HeatNode | null {
  for (const n of roots) {
    if (n.id === id) return n;
    const found = findHeatNode(n.children, id);
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pipes
// ---------------------------------------------------------------------------

export type HeatPipe = { key: string; system: PipeSystem; od: number; di: number; dn: number };

/** Optipress-Therm (C-Stahl) as in 242, Optiflex-Flowpress (Mehrschichtverbund) as in the Sanitär module. */
export const heatPipes: HeatPipe[] = [
  ...thermSizes.map((s) => ({ key: `ot-${s.d}`, system: "therm" as const, od: s.d, di: s.di, dn: s.dn })),
  { key: "of-16", system: "flowpress", od: 16, di: 11.6, dn: 12 },
  { key: "of-20", system: "flowpress", od: 20, di: 14.4, dn: 15 },
  { key: "of-25", system: "flowpress", od: 25, di: 19.6, dn: 20 },
  { key: "of-32", system: "flowpress", od: 32, di: 25.6, dn: 25 },
];

export const pipesOf = (system: PipeSystem) => heatPipes.filter((p) => p.system === system);
export const findHeatPipe = (key: string | null | undefined) => heatPipes.find((p) => p.key === key) ?? null;
/** Size as written in the schema: «NW 28» (Optipress-Therm), «Pex 20» (Optiflex-Flowpress). */
export const heatPipeText = (p: HeatPipe | null | undefined) => (!p ? "" : p.system === "flowpress" ? `Pex ${p.od}` : `NW ${p.od}`);

/** Roughness [mm]: C-Stahl 0.01, Mehrschichtverbund 0.007. */
const roughness: Record<PipeSystem, number> = { therm: 0.01, flowpress: 0.007 };

/** Kinematic viscosity of water [m²/s] at t [°C] (fit, 0.5 % over 5 … 90 °C). */
const viscosity = (t: number) => 1.792e-6 / (1 + 0.0337 * t + 0.000221 * t * t);
/** Density of water [kg/m³] at t [°C] (fit, ±0.1 % over 5 … 90 °C: 988 at 50 °C, 972 at 80 °C). */
const density = (t: number) => 1000 - 0.0178 * Math.abs(t - 4) ** 1.7;

/** Velocity [m/s] of a mass flow [kg/h]. */
export const heatVelocity = (p: HeatPipe, massFlow: number, t = 50) => massFlow / 3600 / density(t) / ((Math.PI * (p.di / 1000) ** 2) / 4);

/** Friction per metre [Pa/m] at a mass flow [kg/h] and water temperature [°C] (Darcy–Weisbach, Colebrook). */
export function heatFriction(p: HeatPipe, massFlow: number, t: number): number {
  if (massFlow <= 0) return 0;
  const d = p.di / 1000;
  const v = heatVelocity(p, massFlow, t);
  const re = (v * d) / viscosity(t);
  const eps = roughness[p.system] / p.di;
  let lambda: number;
  if (re < 2300) lambda = 64 / re;
  else {
    lambda = 0.25 / Math.log10(eps / 3.7 + 5.74 / re ** 0.9) ** 2;
    for (let i = 0; i < 8; i++) lambda = (-2 * Math.log10(eps / 3.7 + 2.51 / (re * Math.sqrt(lambda)))) ** -2;
  }
  return ((lambda / d) * density(t) * v * v) / 2;
}

/** Smallest size of the system within the velocity Richtwert of 242; else the largest. */
export function heatPipeFor(system: PipeSystem, massFlow: number, t: number): HeatPipe {
  const list = pipesOf(system);
  return list.find((p) => heatVelocity(p, massFlow, t) <= maxVelocity(p.dn) + 1e-9) ?? list[list.length - 1];
}

// ---------------------------------------------------------------------------
// Insulation after SIA 384/1:2022 Tabelle 2 (Wärmeverteilleitungen in nicht aktiv beheizten Räumen)
// ---------------------------------------------------------------------------

const tableDn = [10, 15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200];
/** Thickness [mm] per DN column, rows: design temperature ≤ 35 / ≤ 50 / ≤ 65 / ≤ 90 °C. */
const table2: Record<"low" | "high", number[][]> = {
  // λ ≤ 0.03 W/(m·K)
  low: [
    [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 40, 50],
    [30, 30, 30, 30, 30, 30, 30, 40, 40, 50, 60, 60, 60],
    [30, 30, 40, 40, 50, 60, 60, 60, 60, 80, 80, 80, 80],
    [30, 30, 40, 40, 60, 60, 80, 80, 80, 80, 80, 80, 80],
  ],
  // λ 0.03 … 0.05 W/(m·K)
  high: [
    [40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 50],
    [50, 50, 50, 50, 50, 50, 60, 60, 60, 60, 80, 80, 80],
    [60, 60, 60, 60, 80, 80, 80, 80, 80, 100, 100, 100, 120],
    [60, 60, 60, 60, 80, 80, 80, 80, 100, 100, 100, 100, 120],
  ],
};

/**
 * Minimum insulation [mm] of SIA 384/1 Tabelle 2 for a pipe at a design temperature; none below 26 °C (5.4.3.2).
 * The table is for nicht aktiv beheizte Räume; it is used as the LUPI default for all Verteilleitungen.
 */
export function insulationFor(p: HeatPipe, designTemp: number, lambda: number): number {
  if (designTemp < 26) return 0;
  const col = Math.max(0, tableDn.findIndex((dn) => dn >= p.dn));
  const row = designTemp <= 35 ? 0 : designTemp <= 50 ? 1 : designTemp <= 65 ? 2 : 3;
  return table2[lambda <= 0.03 + 1e-9 ? "low" : "high"][row][col];
}

/** Heat loss per metre [W/m] of a pipe (outer diameter od) with insulation s [mm] at θ in surroundings θU. */
export function lossPerMetre(od: number, s: number, lambda: number, theta: number, thetaU: number, outside: boolean): number {
  const d = od / 1000;
  const da = d + (2 * s) / 1000;
  const h = outside ? 25 : 8; // outer heat transfer [W/(m²·K)]
  const r = (s > 0 ? Math.log(da / d) / (2 * Math.PI * lambda) : 0) + 1 / (h * Math.PI * da);
  return (theta - thetaU) / r;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/** A room of the Wärmebedarf as Heizkörper load. */
export type RoomLoad = { name: string; load: number; roomTemp: number };
/** A Fussbodenheizungs-Verteiler from its calculation. */
export type FloorLoad = { name: string; total: number; massFlow: number; maxPressure: number };
/** A Heizgruppe of the Anlage (242). */
export type GroupInfo = { id: string; name: string; supplyTemp: number | null; returnTemp: number | null; power: number | null };

export type SectionResult = {
  id: string;
  role: "distribution" | "floor";
  /** Anschlussleitung: last section before a Heizkörper (no insulation in beheizten Räumen, SIA 384/1 5.4.4.2). */
  connection: boolean;
  power: number;
  /** Mass flow [kg/h]. */
  massFlow: number;
  pipe: HeatPipe;
  pipeSource: "manual" | "velocity";
  velocity: number;
  limit: number;
  /** Friction per metre in VL / RL [Pa/m]. */
  rVl: number;
  rRl: number;
  /** Δp of the section, VL + RL with Formstücke [kPa]. */
  dp: number;
  /** Formstücke by ζ (bends entered) or by the percentage. */
  bends: boolean;
  /** Δp from the group to the end of this section [kPa]. */
  cumulative: number;
  /** Insulation [mm] per line, by SIA 384/1 or chosen. */
  insVl: number;
  insRl: number;
  insSource: "table" | "manual" | "connection";
  /** Heat loss of VL + RL [W] and the Vorlauf temperature at the start / end of the section [°C]. */
  loss: number;
  tIn: number;
  tOut: number;
  /** Strang number when this is the foot of a Steigstrang. */
  strang: number | null;
};

export type TerminalResult = {
  id: string;
  name: string;
  kind: "radiator" | "floor" | "consumer";
  power: number;
  massFlow: number;
  /** Δp of the terminal itself and of the whole circuit [kPa]; Drosselbedarf against the critical circuit. */
  dp: number;
  path: number;
  throttle: number;
  /** Vorlauf temperature arriving at the terminal [°C]. */
  tArrive: number;
};

export type GroupResult = {
  group: GroupInfo;
  supplyTemp: number;
  returnTemp: number;
  /** The group temperatures are missing in 242 (defaults used). */
  defaultTemps: boolean;
  power: number;
  massFlow: number;
  /** Critical circuit Δp = required head of the group pump [kPa]. */
  critical: number;
  loss: number;
  terminals: TerminalResult[];
};

export type DistributionWarning =
  | { kind: "fast"; id: string; velocity: number; limit: number }
  | { kind: "noRoom"; id: string }
  | { kind: "noFloor"; id: string }
  | { kind: "noPower"; id: string }
  | { kind: "temps"; groupId: string }
  | { kind: "cooling"; id: string; drop: number };

export type DistributionResult = {
  sections: Map<string, SectionResult>;
  terminals: Map<string, TerminalResult>;
  groups: GroupResult[];
  warnings: DistributionWarning[];
};

const DEFAULT_TEMPS = { supply: 55, ret: 45 };

export function evaluateDistribution(
  data: DistributionData,
  groups: GroupInfo[],
  rooms: (calcId: string, roomId: string) => RoomLoad | null,
  floors: (systemId: string, distributorId: string) => FloorLoad | null,
  outsideTemp: number | null,
): DistributionResult {
  const s = data.settings;
  const sections = new Map<string, SectionResult>();
  const terminals = new Map<string, TerminalResult>();
  const warnings: DistributionWarning[] = [];
  const groupResults: GroupResult[] = [];
  let strangNo = 0;

  for (const group of groups) {
    const roots = data.networks[group.id] ?? [];
    const defaultTemps = group.supplyTemp === null || group.returnTemp === null || group.supplyTemp <= group.returnTemp;
    const tv = defaultTemps ? DEFAULT_TEMPS.supply : group.supplyTemp!;
    const tr = defaultTemps ? DEFAULT_TEMPS.ret : group.returnTemp!;
    if (defaultTemps && roots.length) warnings.push({ kind: "temps", groupId: group.id });
    const dt = tv - tr;
    const flowOf = (w: number) => (w * 3.6) / (CP_WATER * dt); // kg/h

    // Terminals: power, mass flow and own Δp.
    type Term = { power: number; massFlow: number; dp: number; name: string; kind: TerminalResult["kind"] };
    const term = (n: HeatNode): Term | null => {
      if (n.type === "radiator") {
        const room = n.calcId && n.roomId ? rooms(n.calcId, n.roomId) : null;
        if (!room && n.power === null) warnings.push({ kind: "noRoom", id: n.id });
        const power = n.power ?? room?.load ?? 0;
        return { power, massFlow: flowOf(power), dp: n.dp ?? s.valveDp, name: n.label || room?.name || "", kind: "radiator" };
      }
      if (n.type === "floor") {
        const f = n.systemId && n.distributorId ? floors(n.systemId, n.distributorId) : null;
        if (!f) {
          warnings.push({ kind: "noFloor", id: n.id });
          return { power: 0, massFlow: 0, dp: 0, name: n.label, kind: "floor" };
        }
        return { power: f.total, massFlow: f.massFlow, dp: f.maxPressure / 1000, name: n.label || f.name, kind: "floor" };
      }
      if (n.type === "consumer") {
        if (n.power === null) warnings.push({ kind: "noPower", id: n.id });
        const power = n.power ?? 0;
        return { power, massFlow: flowOf(power), dp: n.dp ?? 0, name: n.label, kind: "consumer" };
      }
      return null;
    };

    // Loads per subtree.
    type Load = { power: number; massFlow: number; terminals: number; riser: boolean };
    const loads = new Map<string, Load>();
    const terms = new Map<string, Term>();
    const load = (n: HeatNode): Load => {
      const t = term(n);
      if (t) terms.set(n.id, t);
      const acc: Load = { power: t?.power ?? 0, massFlow: t?.massFlow ?? 0, terminals: t ? 1 : 0, riser: n.type === "pipe" && n.riser };
      for (const c of n.children) {
        const l = load(c);
        acc.power += l.power;
        acc.massFlow += l.massFlow;
        acc.terminals += l.terminals;
        acc.riser ||= l.riser;
      }
      loads.set(n.id, acc);
      return acc;
    };
    const total = roots.map(load).reduce((a, l) => ({ power: a.power + l.power, massFlow: a.massFlow + l.massFlow }), { power: 0, massFlow: 0 });

    const thetaU = (a: Ambient) => (a === "heated" ? s.tHeated : a === "unheated" ? s.tUnheated : (s.tOutside ?? outsideTemp ?? -8));
    const groupTerminals: TerminalResult[] = [];
    let groupLoss = 0;

    const visit = (n: HeatNode, parentRiser: boolean, riserAbove: boolean, before: number, tIn: number) => {
      const t = terms.get(n.id);
      if (t) {
        const tr: TerminalResult = { id: n.id, name: t.name, kind: t.kind, power: t.power, massFlow: t.massFlow, dp: t.dp, path: before + t.dp, throttle: 0, tArrive: tIn };
        terminals.set(n.id, tr);
        groupTerminals.push(tr);
        // A terminal passes the flow on to nothing (children of terminals are not allowed in the editor).
        return;
      }
      if (n.type !== "pipe") return;
      const l = loads.get(n.id)!;
      const role: "distribution" | "floor" =
        n.role !== "auto" ? n.role : n.riser || l.riser ? "distribution" : riserAbove ? "floor" : l.terminals <= 1 ? "floor" : "distribution";
      const connection = n.children.length > 0 && n.children.every((c) => c.type === "radiator");
      const manual = findHeatPipe(n.size);
      const pipe = manual && manual.system === n.system ? manual : heatPipeFor(n.system, l.massFlow, tv);
      const v = heatVelocity(pipe, l.massFlow, tv);
      const limit = maxVelocity(pipe.dn);
      if (v > limit + 1e-9) warnings.push({ kind: "fast", id: n.id, velocity: v, limit });
      const length = n.length ?? 0;
      const rVl = heatFriction(pipe, l.massFlow, tv);
      const rRl = heatFriction(pipe, l.massFlow, tr);
      const bends = n.bends90 + n.bends45 > 0;
      const dynamic = (t: number) => (density(t) * heatVelocity(pipe, l.massFlow, t) ** 2) / 2;
      const fittings = bends ? (n.bends90 * s.zeta90 + n.bends45 * s.zeta45) * (dynamic(tv) + dynamic(tr)) : length * (rVl + rRl) * s.allowance;
      const dp = (length * (rVl + rRl) + fittings) / 1000;

      // Insulation and heat loss.
      const insSource: SectionResult["insSource"] = n.insulation !== null ? "manual" : connection && n.ambient === "heated" ? "connection" : "table";
      const insVl = insSource === "manual" ? n.insulation! : insSource === "connection" ? 0 : insulationFor(pipe, tv, s.lambda);
      const insRl = insSource === "manual" ? n.insulation! : insSource === "connection" ? 0 : insulationFor(pipe, tr, s.lambda);
      const tu = thetaU(n.ambient);
      const qVl = Math.max(0, lossPerMetre(pipe.od, insVl, s.lambda, tIn, tu, n.ambient === "outside"));
      const qRl = Math.max(0, lossPerMetre(pipe.od, insRl, s.lambda, tr, tu, n.ambient === "outside"));
      const lossVl = qVl * length;
      const loss = lossVl + qRl * length;
      groupLoss += loss;
      const tOut = l.massFlow > 0 ? tIn - (lossVl * 3.6) / (l.massFlow * CP_WATER) : tIn;

      const isFoot = n.riser && !parentRiser;
      sections.set(n.id, {
        id: n.id,
        role,
        connection,
        power: l.power,
        massFlow: l.massFlow,
        pipe,
        pipeSource: manual && manual.system === n.system ? "manual" : "velocity",
        velocity: v,
        limit,
        rVl,
        rRl,
        dp,
        bends,
        cumulative: before + dp,
        insVl,
        insRl,
        insSource,
        loss,
        tIn,
        tOut,
        strang: isFoot ? ++strangNo : null,
      });
      n.children.forEach((c) => visit(c, n.riser, riserAbove || n.riser, before + dp, tOut));
    };
    roots.forEach((n) => visit(n, false, false, 0, tv));

    const critical = groupTerminals.reduce((m, t) => Math.max(m, t.path), 0);
    for (const t of groupTerminals) {
      t.throttle = critical - t.path;
      if (tv - t.tArrive > 2) warnings.push({ kind: "cooling", id: t.id, drop: tv - t.tArrive });
    }
    groupResults.push({ group, supplyTemp: tv, returnTemp: tr, defaultTemps, power: total.power, massFlow: total.massFlow, critical, loss: groupLoss, terminals: groupTerminals });
  }
  return { sections, terminals, groups: groupResults, warnings };
}
