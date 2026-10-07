// Prinzipschema of a Wärmeerzeugungsanlage (242), as drawing primitives shared by the web view and the PDF. Four
// sectors from left to right:
//
//   WÄRMEQUELLE        WARMWASSER        ENERGIESPEICHER     VERTEILER / HEIZGRUPPEN
//                                                                  G1      G2      G3   (consumers on top)
//   VL ══╤════════╤═══════╦═══════════╗    ┌───────╗ ┌──┐            │┊      │┊      │┊
//   RL ┄┄┼┄┄┄┄┄┄┄┄┼┄┄┄┄┄┄┄┊┄┄┄┄┄┄┄┄┄┄┄┊┄┄┐ │ ┄┄┄┄┄┊┄┊ ┊            │┊      │┊      │┊
//        │        │       ║  ┌───┐    ║  ┊ │       ║ ┊   ══════════╧╪══════╧╪══════╧╪══  Vorlauf bar
//      ┌─┴─┐    ┌─┴─┐     ╚══│ ≶ │    ╚═ │ │       ╚═┊   ┄┄┄┄┄┄┄┄┄┄┄┴┄┄┄┄┄┄┄┴┄┄┄┄┄┄┄┴┄┄  Rücklauf bar
//   ▁▁▁└───┘▁▁▁▁└───┘▁▁▁▁▁▁▁▁└───┘▁▁▁▁▁▁▁└─┘▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁  ground line
//    generators     Wassererwärmer    Speicher               (EWS / Brunnen below the ground)
//
// Generators, Wassererwärmer and Speicher stand on one ground line, the mains run over them and drop to the
// Verteiler just above the ground; the Heizgruppen rise from it.
//
// Symbols after SIA 410 (1978/1986): 1.26 Armaturen, 1.27 Apparate, 1.28 Messelemente, 1.29 Antriebe, 1.210 Zähler,
// 1.211 Energiemittel, 2.1 Heizkessel, 2.2 Speicher und Wärmetauscher, 2.3 Heizkörper, 2.4 Ausdehnungsgefässe, 2.5.1
// Vorlauf solid / Rücklauf dashed. Parts SIA 410 lacks (Sole/Wasser- and Wasser/Wasser-WP, technischer Speicher,
// Erdwärmesonden, Brunnen) are built from its parts («sinngemäss»). Colours: Vorlauf red, Rücklauf blue, Sole brown,
// Grundwasser cyan.

import type { Paint, Prim } from "@/lib/kwl/schema-symbols";

import type { EmitterType, GeneratorType } from "./plan-schema";
import { type CircuitType, generatorName, hotWaterUnit, type PlantData } from "./plant-schema";
import { emptyEwsContext, type EwsContext, evaluateEws } from "./ews";
import { evaluateHydraulics, storageTemperatures } from "./hydraulics";
import { componentTypes } from "./material";
import { evaluateSafety } from "./safety";

export type PipeKind = "vl" | "rl" | "brine" | "brineR" | "gw" | "gwR" | "pwc" | "pwh";

export const pipeColors: Record<PipeKind, `#${string}`> = {
  vl: "#e3001b",
  rl: "#0057b8",
  brine: "#2ecc40",
  brineR: "#e000e0",
  gw: "#0096c7",
  gwR: "#0096c7",
  pwc: "#00a651",
  pwh: "#e3001b",
};
/** Return lines dashed (SIA 410 2.5.1). */
export const pipeDashed = (k: PipeKind) => k === "rl" || k === "brineR" || k === "gwR";

/** Symbols of the schema, also the entries of the legend (in legend order). */
export const symbolKeys = [
  "ball",
  "capValve",
  "drain",
  "check",
  "regValve",
  "valve2",
  "valve3",
  "pump",
  "thermometer",
  "sensor",
  "safetyThermostat",
  "heatMeter",
  "expansion",
  "safetyValve",
  "siphon",
  "boilerSolid",
  "boilerGasOil",
  "hpAir",
  "hpWater",
  "plateHx",
  "storage",
  "waterHeater",
  "ews",
  "distributor",
  "well",
  "floor",
  "radiator",
  "register",
  "apparatus",
] as const;
export type SymbolKey = (typeof symbolKeys)[number];

/** SIA 410 number of each symbol (legend); «~» = built from SIA 410 parts. */
export const symbolRefs: Record<SymbolKey, string> = {
  ball: "1.26.7",
  capValve: "~ 1.26.5",
  drain: "2.6.7",
  check: "1.26.9",
  regValve: "2.6.9",
  valve2: "1.26.5 / 1.29.10",
  valve3: "1.26.3 / 1.29.10",
  pump: "1.27.3",
  thermometer: "1.28.11",
  sensor: "1.28.2",
  safetyThermostat: "~ 1.28.2",
  heatMeter: "1.210.3",
  expansion: "2.4.2",
  safetyValve: "1.26.10",
  siphon: "~",
  boilerSolid: "2.1.1 / 1.211.1",
  boilerGasOil: "2.1.1 / 1.211.2–3",
  hpAir: "2.2.11",
  hpWater: "~ 2.2.11",
  plateHx: "2.2.5",
  storage: "~ 2.2.2",
  waterHeater: "2.2.7",
  ews: "~",
  distributor: "~",
  well: "~ 1.27.3",
  floor: "2.3.9",
  radiator: "2.3.6",
  register: "2.3.2",
  apparatus: "1.27.1",
};

export type GenerationLabels = {
  sectors: { source: string; hotWater: string; storage: string; distribution: string };
  generators: Record<GeneratorType, string>;
  emitters: Record<EmitterType, string>;
  circuits: Record<CircuitType, string>;
  noGenerator: string;
  boreholes: string;
  /** Sondenverteiler (Verteiler and Sammler). */
  distributor: string;
  supplyWell: string;
  returnWell: string;
  intermediate: string;
  districtPrimary: string;
  waterHeater: string;
  noHotWater: string;
  storage: string;
  noStorage: string;
  mainPump: string;
  pressurized: string;
  unpressurized: string;
  bypass: string;
  /** Short name of the Druckausdehnungsgefäss (e.g. «MAG»). */
  vessel: string;
  /** Warning at the Kappenventil of the Ausdehnungsgefäss. */
  doNotClose: string;
  group: string;
  noGroups: string;
  cold: string;
  hot: string;
  supply: string;
  return: string;
};

const generatorKeys: GeneratorType[] = ["hpAir", "hpBrine", "hpWater", "pellets", "logWood", "district", "gasOil"];
const emitterKeys: EmitterType[] = ["floor", "radiators", "tabs", "air"];
const circuitKeys: CircuitType[] = ["throttle", "diverting", "mixing", "injection3", "injection2"];
const schemaTextKeys = ["noGenerator", "boreholes", "distributor", "supplyWell", "returnWell", "intermediate", "districtPrimary", "waterHeater", "noHotWater", "storage", "noStorage", "mainPump", "pressurized", "unpressurized", "bypass", "vessel", "doNotClose", "group", "noGroups", "cold", "hot", "supply", "return"] as const;

/** Labels of the schema from the messages «heatingPlan.generation» (`t` is scoped to that namespace). */
export function generationLabels(t: (key: string) => string): GenerationLabels {
  const map = <K extends string>(keys: readonly K[], prefix: string) => Object.fromEntries(keys.map((k) => [k, t(`${prefix}.${k}`)])) as Record<K, string>;
  return {
    sectors: map(["source", "hotWater", "storage", "distribution"] as const, "sectors"),
    generators: map(generatorKeys, "short"),
    emitters: map(emitterKeys, "emitterShort"),
    circuits: map(circuitKeys, "circuitShort"),
    ...map(schemaTextKeys, "schema"),
  };
}

export type SchemaLine ={ d: string; kind: PipeKind; width: number };
export type SchemaGroup = { groupId: string | null; prims: Prim[] };

export type GenerationSchema = {
  width: number;
  height: number;
  lines: SchemaLine[];
  groups: SchemaGroup[];
  /** Symbols used (for the legend), in legend order; pipe kinds used. */
  used: SymbolKey[];
  pipes: PipeKind[];
};

type Pt = [number, number];
const round = (v: number) => Math.round(v * 10) / 10;
const pathD = (list: Pt[]) => list.map(([x, y], i) => `${i ? "L" : "M"}${round(x)},${round(y)}`).join(" ");
/** Thermischer Siphon: a horizontal run at y from x1 to x2 that drops into a «U» (SIPHON_W wide) starting at xu. */
const SIPHON_W = 10;
const SIPHON_H = 18;
const siphonD = (x1: number, y: number, xu: number, x2: number) => {
  const r = SIPHON_W / 2;
  return `M${round(x1)},${round(y)} L${round(xu)},${round(y)} L${round(xu)},${round(y + SIPHON_H - r)} A${r},${r} 0 0 0 ${round(xu + SIPHON_W)},${round(y + SIPHON_H - r)} L${round(xu + SIPHON_W)},${round(y)} L${round(x2)},${round(y)}`;
};
const ptsAttr = (list: Pt[]) => list.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");

// ---------------------------------------------------------------------------
// Symbols along a pipe. Local frame: u along the flow, v across it. Flow «right»: v > 0 below; «left»: v > 0 above;
// «up»: v > 0 right; «down»: v > 0 left. `side` (±1) picks the side for parts off the pipe in local v.
// ---------------------------------------------------------------------------

export type Dir = "right" | "left" | "up" | "down";

function frame(x: number, y: number, dir: Dir) {
  return (u: number, v: number): Pt => {
    switch (dir) {
      case "right":
        return [x + u, y + v];
      case "left":
        return [x - u, y - v];
      case "up":
        return [x + v, y - u];
      case "down":
        return [x - v, y + u];
    }
  };
}

/** Local v of the side on the sheet: «left»/«right»/«above»/«below» → ±1 for a pipe in direction `dir`. */
export function sideOf(dir: Dir, where: "left" | "right" | "above" | "below"): 1 | -1 {
  const [x0, y0] = frame(0, 0, dir)(0, 1);
  const s = where === "right" ? x0 : where === "left" ? -x0 : where === "below" ? y0 : -y0;
  return s >= 0 ? 1 : -1;
}

function along(x: number, y: number, dir: Dir) {
  const f = frame(x, y, dir);
  const poly = (list: Pt[], fill: Paint = "bg", sw = 1): Prim => ({ t: "polygon", points: ptsAttr(list.map(([u, v]) => f(u, v))), fill, stroke: "ink", sw });
  const line = (u1: number, v1: number, u2: number, v2: number, sw = 1, dash?: string): Prim => {
    const [x1, y1] = f(u1, v1);
    const [x2, y2] = f(u2, v2);
    return dash ? { t: "line", x1, y1, x2, y2, stroke: "ink", sw, dash } : { t: "line", x1, y1, x2, y2, stroke: "ink", sw };
  };
  const circle = (u: number, v: number, r: number, fill: Paint, sw = 1): Prim => {
    const [cx, cy] = f(u, v);
    return fill === "ink" ? { t: "circle", cx, cy, r, fill } : { t: "circle", cx, cy, r, fill, stroke: "ink", sw };
  };
  /** Axis-aligned box centred on (u, v) of size `a` along × `b` across. */
  const box = (u: number, v: number, a: number, b: number, fill: Paint = "bg", sw = 1): Prim => {
    const [ax, ay] = f(u - a / 2, v - b / 2);
    const [bx, by] = f(u + a / 2, v + b / 2);
    return { t: "rect", x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay), fill, stroke: "ink", sw };
  };
  const text = (u: number, v: number, s: string, size: number): Prim => {
    const [tx, ty] = f(u, v);
    return { t: "text", x: tx, y: ty + size * 0.35, text: s, size, anchor: "middle", fill: "ink", bold: true };
  };
  // 1.26.1 Absperrorgan: two triangles tip to tip.
  const bowtie = (fillIn: Paint = "bg", fillOut: Paint = "bg", w = 7, h = 5) => [poly([[-w, -h], [0, 0], [-w, h]], fillIn), poly([[w, -h], [0, 0], [w, h]], fillOut)];
  // 1.29.10 Motorantrieb on a stem at side s.
  const motor = (s: number) => [line(0, 0, 0, 7 * s), box(0, 13 * s, 12, 12), circle(0, 13 * s, 4.5, "bg", 0.8), text(0, 13 * s, "M", 5.5)];
  return { poly, line, circle, box, text, bowtie, motor };
}

export type SymbolOpts = { side?: 1 | -1; port?: 1 | -1 };

/** Symbol on a pipe at (x, y) with the flow in direction `dir`. */
export function drawSymbol(key: SymbolKey, x: number, y: number, dir: Dir = "right", opts: SymbolOpts = {}): Prim[] {
  const g = along(x, y, dir);
  const s = opts.side ?? -1;
  switch (key) {
    case "ball":
      // 1.26.7 Hahn (Kugelhahn): Absperrorgan with an open circle.
      return [...g.bowtie(), g.circle(0, 0, 2, "bg", 0.8)];
    case "capValve":
      // Kappenventil: 1.26.5 Ventil under a cap (secured against closing), drawn as a frame around it.
      return [g.box(0, 0, 18, 15), ...g.bowtie("bg", "bg", 6, 4.5), g.circle(0, 0, 1.5, "ink")];
    case "drain":
      // 2.6.7 Entleerhahn on a short branch at side s: Absperrorgan along the branch and the hose cap.
      return [
        g.line(0, 0, 0, 4 * s, 0.8),
        g.poly([[-3, 4 * s], [3, 4 * s], [0, 7.5 * s]], "bg", 0.8),
        g.poly([[-3, 11 * s], [3, 11 * s], [0, 7.5 * s]], "bg", 0.8),
        g.line(-3.5, 12.5 * s, 3.5, 12.5 * s, 1),
        g.line(-3.5, 12.5 * s, -3.5, 11 * s, 0.8),
        g.line(3.5, 12.5 * s, 3.5, 11 * s, 0.8),
      ];
    case "check":
      // 1.26.9 Rückflussverhinderer: downstream triangle filled.
      return g.bowtie("bg", "ink");
    case "regValve":
      // 2.6.9 Drosselventil (Strangregulierventil).
      return [...g.bowtie(), g.line(-13, 0, -4, 0, 0.9), g.poly([[-2.5, 0], [-6, -2], [-6, 2]], "ink", 0.4)];
    case "valve2":
      // 1.26.5 Ventil (Durchgangsventil) with 1.29.10 Motorantrieb.
      return [...g.bowtie(), g.circle(0, 0, 1.6, "ink"), ...g.motor(s)];
    case "valve3": {
      // 1.26.3 Dreiweg-Organ with 1.29.10 Motorantrieb; `port` = side of the third way, the drive opposite.
      const p = opts.port ?? 1;
      return [...g.bowtie(), g.poly([[-5, 7 * p], [0, 0], [5, 7 * p]]), ...g.motor(-p)];
    }
    case "pump":
      // 1.27.3 Pumpe: the filled triangle points in the flow direction.
      return [g.circle(0, 0, 8, "bg"), g.poly([[0, -8], [8, 0], [0, 8]], "ink", 0.5)];
    case "thermometer":
      // 1.28.11 Direktanzeige-Instrument T on a short stub.
      return [g.line(0, 0, 0, 6 * s, 0.8), g.circle(0, 11 * s, 5, "bg", 0.8), g.line(-3.5, 14.5 * s, 3.5, 7.5 * s, 0.7), g.text(5.5, 17 * s, "T", 4.5)];
    case "sensor":
      // 1.28.2 Messfühler Temperatur: the stem touches the pipe, the sensing element (circle) at its end.
      return [g.line(0, 0, 0, 10 * s, 0.8), g.circle(0, 12.6 * s, 2.6, "bg", 0.8)];
    case "safetyThermostat":
      // Sicherheitsthermostat (Anlegethermostat): the Temperaturfühler with a square of its size instead of the circle.
      return [g.line(0, 0, 0, 10 * s, 0.8), g.box(0, 12.6 * s, 5.2, 5.2, "bg", 0.8)];
    case "heatMeter":
      // 1.210.3 Wärmezähler mit elektronischem Zählwerk: Volumenstromzähler in the pipe, Rechenwerk beside it.
      return [
        g.box(0, 0, 13, 9),
        g.poly([[-6.5, 4.5], [6.5, -4.5], [6.5, 4.5]], "ink", 0.5),
        g.line(0, 4.5 * s, 0, 11 * s, 0.7, "1.5 1.2"),
        g.box(0, 15.5 * s, 11, 9),
        g.poly([[1.5, 12.5 * s], [-1.5, 15.5 * s], [1.5, 15.5 * s], [-1.5, 18.5 * s]].map(([u, v]) => [u, v] as Pt), "none", 0.7),
      ];
    case "expansion":
      // 2.4.2 Geschlossenes Membran-Ausdehnungsgefäss on a stub at side s.
      return [g.line(0, 0, 0, 7 * s, 0.9), g.circle(0, 15 * s, 8, "bg"), g.line(-8, 15 * s, 8, 15 * s, 0.7), g.poly([[-3, 15 * s], [0, 18 * s], [3, 15 * s]], "none", 0.7)];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Apparatus symbols at an absolute position
// ---------------------------------------------------------------------------

const rect = (x: number, y: number, w: number, h: number, fill: Paint = "bg", sw = 1.2): Prim => ({ t: "rect", x, y, w, h, fill, stroke: "ink", sw });
const ln = (x1: number, y1: number, x2: number, y2: number, sw = 1, dash?: string): Prim =>
  dash ? { t: "line", x1, y1, x2, y2, stroke: "ink", sw, dash } : { t: "line", x1, y1, x2, y2, stroke: "ink", sw };
const poly = (list: Pt[], fill: Paint = "ink", sw = 0.6): Prim => ({ t: "polygon", points: ptsAttr(list), fill, stroke: "ink", sw });
const path = (d: string, sw = 1, fill: Paint = "none"): Prim => ({ t: "path", d, fill, stroke: "ink", sw });
const label = (x: number, y: number, s: string, size = 7, opts: { anchor?: "start" | "middle" | "end"; muted?: boolean; bold?: boolean } = {}): Prim => ({
  t: "text",
  x,
  y,
  text: s,
  size,
  anchor: opts.anchor ?? "middle",
  fill: opts.muted ? "muted" : "ink",
  bold: opts.bold,
});

/**
 * 1.26.10 Sicherheitsventil mit Federbelastung on a stub rising from (x, y): Eck-Absperrorgan (inlet from below,
 * outlet to the left) with the spring on top.
 */
export function safetyValve(x: number, y: number, outlet: 1 | -1 = -1): Prim[] {
  const c = y - 12;
  const o = outlet;
  return [
    ln(x, y, x, y - 5, 1),
    poly([[x - 3.5, y - 5], [x + 3.5, y - 5], [x, c]], "bg", 0.9),
    poly([[x + 7 * o, c - 3.5], [x + 7 * o, c + 3.5], [x, c]], "bg", 0.9),
    ln(x + 7 * o, c, x + 10 * o, c, 0.9),
    path(`M${x},${c} L${x + 2.5},${c - 1.5} L${x - 2.5},${c - 3.5} L${x + 2.5},${c - 5.5} L${x - 2.5},${c - 7.5} L${x},${c - 9}`, 0.7),
  ];
}

/** 1.211 Energiemittel centred on (x, y): solid fuel square, liquid fuel burner, gas triangle. */
function fuel(kind: "solid" | "liquid" | "gas", x: number, y: number): Prim[] {
  if (kind === "solid") return [{ t: "rect", x: x - 4, y: y - 4, w: 8, h: 8, fill: "ink" }];
  if (kind === "gas") return [poly([[x - 4.5, y + 4], [x, y - 4.5], [x + 4.5, y + 4]])];
  return [{ t: "circle", cx: x, cy: y + 2, r: 3, fill: "ink" }, ln(x, y - 1, x, y - 6, 0.8), ln(x - 1, y - 0.5, x - 4, y - 5, 0.8), ln(x + 1, y - 0.5, x + 4, y - 5, 0.8)];
}

/** Coil «<» of a Wärmetauscher (2.2.4) between y1 and y2, entering from the left at x over width w. */
function coil(x: number, y1: number, y2: number, w: number): Prim {
  const m = (y1 + y2) / 2;
  return path(`M${x},${y1} L${x + w},${y1} L${x + w * 0.35},${m} L${x + w},${y2} L${x},${y2}`, 0.9);
}

/** 1.27.5 Verdichter centred on (x, y). */
const compressor = (x: number, y: number, r = 7): Prim[] => [
  { t: "circle", cx: x, cy: y, r, fill: "bg", stroke: "ink", sw: 1 },
  ln(x - r * 0.7, y - r * 0.7, x + r, y - r * 0.15, 0.8),
  ln(x - r * 0.7, y + r * 0.7, x + r, y + r * 0.15, 0.8),
];

/** 2.2.5 Platten-Wärmetauscher, square of side a centred on (x, y). */
const plateHx = (x: number, y: number, a = 36): Prim[] => [rect(x - a / 2, y - a / 2, a, a), ln(x - a / 2, y + a / 2, x + a / 2, y - a / 2, 0.9)];

/** 2.3 Heizkörper / Fussbodenheizung of a group, centred on (x, y), width w. */
function emitterSymbol(key: SymbolKey, x: number, y: number, w: number): Prim[] {
  const l = x - w / 2;
  switch (key) {
    case "floor":
      // 2.3.9 Rohrschlange für Decken- oder Fussbodenheizung.
      return [path(`M${l},${y - 4} L${x + w / 2 - 4},${y - 4} A4,4 0 0 1 ${x + w / 2 - 4},${y + 4} L${l},${y + 4}`, 1.1), path(`M${l},${y - 1} L${x + w / 2 - 4},${y - 1} A1,1 0 0 1 ${x + w / 2 - 4},${y + 1} L${l},${y + 1}`, 0.8)];
    case "radiator":
      // 2.3.6 Radiator.
      return [rect(l, y - 6, w, 12)];
    case "register":
      // 2.3.2 Heizregister.
      return [rect(l, y - 4, w, 8), ln(l + 3, y - 6, l + 3, y + 6, 1.2), ln(l + w - 3, y - 6, l + w - 3, y + 6, 1.2)];
    default:
      return [rect(l, y - 7, w, 14)];
  }
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const G = 400; // ground line: generators, Wassererwärmer and Speicher stand on it
const YMV = 130; // Vorlauf main, above all apparatus
const YMR = 160; // Rücklauf main
const YVD = 330; // Vorlauf bar of the Verteiler, just above the ground
const YRD = 360; // Rücklauf bar
const YBALL = YMR + 40; // Absperrungen of the generators, the Wassererwärmer and the Sondenverteiler im Technikraum
const YPUMP = YMR + 100; // pumps above the generators and the Solepumpe at a Sondenverteiler
const TITLE_Y = 22;
const GROUP_W = 104;
const GROUP_LEG = 36; // VL leg → RL leg of a group

const PROBE_PITCH = 30; // probes at a Sondenverteiler
const DUPLEX = 16; // legs of a Duplex-Sonde
const Y_VESSEL = YMR + 150; // tee of the Ausdehnungsgefässe (Heizung and Solekreis)

/** Width of the column of a generator (the source side lies left of the generator, with the Sondenverteiler). */
function genWidth(g: GeneratorType | null, data: PlantData) {
  if (g === "hpBrine") {
    const extra = data.ews.distributor === "none" ? 0 : (Math.min(data.ews.probes, 4) - 1) * PROBE_PITCH;
    return (data.ews.distributor === "outside" ? 290 : 250) + extra;
  }
  return g === "hpWater" ? 270 : g === "district" ? 190 : 120;
}
/** Height of the generator symbol standing on the ground. */
const genHeight = (g: GeneratorType | null) => (g === "district" ? 44 : g === "hpAir" || g === "hpBrine" || g === "hpWater" ? 72 : 60);

export function buildGenerationSchema(
  data: PlantData,
  labels: GenerationLabels,
  opts: { groupNames?: (i: number) => string; ews?: EwsContext } = {},
): GenerationSchema {
  const lines: SchemaLine[] = [];
  const groups: SchemaGroup[] = [];
  const used = new Set<SymbolKey>();
  const pipes = new Set<PipeKind>();
  let maxY = G + 30;
  let current: SchemaGroup = { groupId: null, prims: [] };
  groups.push(current);
  const begin = (groupId: string | null) => {
    current = { groupId, prims: [] };
    groups.push(current);
  };
  const bottomOf = (p: Prim) =>
    p.t === "rect" ? p.y + p.h : p.t === "line" ? Math.max(p.y1, p.y2) : p.t === "circle" ? p.cy + p.r : p.t === "text" ? p.y + 4 : p.t === "polygon" ? Math.max(...p.points.split(" ").map((xy) => Number(xy.split(",")[1]))) : 0;
  const add = (...prims: Prim[]) => {
    current.prims.push(...prims);
    for (const p of prims) maxY = Math.max(maxY, bottomOf(p));
  };
  const pipe = (kind: PipeKind, list: Pt[], width = 1.6) => {
    lines.push({ d: pathD(list), kind, width });
    pipes.add(kind);
    for (const [, y] of list) maxY = Math.max(maxY, y);
  };
  /** Horizontal VL run into a connection with a thermischer Siphon just before it. */
  const siphonPipe = (x1: number, y: number, xu: number, x2: number) => {
    lines.push({ d: siphonD(x1, y, xu, x2), kind: "vl", width: 1.6 });
    pipes.add("vl");
    used.add("siphon");
    maxY = Math.max(maxY, y + SIPHON_H);
  };
  const dot = (x: number, y: number, kind: PipeKind) => add({ t: "circle", cx: x, cy: y, r: 2.2, fill: pipeColors[kind] });
  const sym = (key: SymbolKey, x: number, y: number, dir: Dir, o: SymbolOpts = {}) => {
    used.add(key);
    add(...drawSymbol(key, x, y, dir, o));
  };
  const text = (x: number, y: number, s: string, size = 7, o: Parameters<typeof label>[4] = {}) => {
    if (!s) return;
    add(label(x, y, s, size, o));
    maxY = Math.max(maxY, y + 4);
  };

  // --- 1 Wärmequelle ------------------------------------------------------------------------------------------
  // Generators stand on the ground; their legs rise to the mains, which run over all sectors.
  // A Sondenverteiler im Technikraum lies at the height of the mains, so its Sole/Wasser-WP is drawn first (left of them);
  // the generator with the separate Warmwasser connection last, so its lines pass no other generator.
  const wwGenId = hotWaterUnit(data)?.id;
  const order = (u: (typeof data.generators)[number]) => (u.type === "hpBrine" && data.ews.distributor === "inside" ? 0 : u.id === wwGenId ? 2 : 1);
  const gens = data.generators.length ? [...data.generators].sort((a, b) => order(a) - order(b)) : [null];
  const x0 = 24;
  const ews = data.generators.some((g) => g.type === "hpBrine") ? evaluateEws(data, opts.ews ?? emptyEwsContext) : null;
  const safety = evaluateSafety(data, ews);
  // Pipe sizes («NW» = outer diameter of the Optipress-Therm pipe, as in the Sanitärschema) beside the circuits.
  const circuits = evaluateHydraulics(data, ews);
  const nw = (key: string, x: number, y: number, anchor: "start" | "middle" | "end" = "middle") => {
    const c = circuits.find((x) => x.key === key);
    if (!c?.size) return;
    text(x, y, `NW ${c.size.d}`, 6, { anchor, muted: true });
    if (c.flow !== null) text(x, y + 7, `${Math.round(c.flow * 1000).toLocaleString("de-CH")} l/h`, 6, { anchor, muted: true });
  };
  // Types of pumps, Dreiwegventile, Sicherheitsventile and Ausdehnungsgefässe (the picks of the Materialauszug).
  const types = componentTypes(data, ews);
  const typeText = (key: string, x: number, y: number, anchor: "start" | "middle" | "end" = "middle") =>
    (types.get(key) ?? []).forEach((line, i) => text(x, y + i * 6.5, line, 5.5, { anchor, muted: true }));
  const MAG_ROOM = 95;
  const sourceRight = x0 + gens.reduce((s, u) => s + genWidth(u?.type ?? null, data), 0) + 10 + MAG_ROOM;
  let colX = x0;
  let firstLeg = Infinity;
  // Wassererwärmer loading: generator of the separate connection, Heizgruppe of the WW-Ladegruppe.
  const ww = data.hotWater ? data.hotWaterConnection : null;
  const wwUnit = hotWaterUnit(data);
  const wwGroup = ww === "group" ? (data.groups.find((g) => g.id === data.hotWaterGroup) ?? null) : null;
  let wwGen: { gx: number; top: number } | null = null;
  for (const unit of gens) {
    const g = unit?.type ?? null;
    const w = genWidth(g, data);
    const gx = colX + w - 66; // left edge of the generator box (44 wide)
    const top = G - genHeight(g);
    const xv = gx + 6; // VL out
    const xr = gx + 38; // RL in
    firstLeg = Math.min(firstLeg, xv);
    drawGenerator(g, colX, gx, top, unit ? generatorName(data.generators, unit, (t) => labels.generators[t]) : "", unit?.id ?? "");
    if (ww === "generator" && unit && unit.id === wwUnit?.id) wwGen = { gx, top };
    if (unit) nw(`gen:${unit.id}`, (xv + xr) / 2, YBALL - 22);
    pipe("vl", [[xv, top], [xv, YMV]]);
    pipe("rl", [[xr, YMR], [xr, top]]);
    dot(xv, YMV, "vl");
    dot(xr, YMR, "rl");
    // Absperrungen of VL and RL at the height of those of the Wassererwärmer.
    sym("ball", xv, YBALL, "up");
    sym("ball", xr, YBALL, "down");
    // Entleerungen below the Absperrungen, on the side of the generator.
    sym("drain", xv, YBALL + 14, "up", { side: sideOf("up", "left") });
    sym("drain", xr, YBALL + 14, "down", { side: sideOf("down", "left") });
    if (g !== null) {
      // Sicherheitsventil on the VL between generator and Absperrung, unabsperrbar (HE301-01 6.2.4).
      const ySV = top - 12;
      pipe("vl", [[xv, ySV], [xv + 10, ySV]]);
      dot(xv, ySV, "vl");
      used.add("safetyValve");
      add(...safetyValve(xv + 10, ySV, 1));
      if (unit) typeText(`sv:gen:${unit.id}`, xv + 16, ySV - 36);
    }
    if (g === "pellets" || g === "logWood") {
      // Rücklaufhochhaltung: Dreiwegventil in the return, bypass from the supply.
      pipe("vl", [[xv, YMR + 72], [xr - 6, YMR + 72]]);
      dot(xv, YMR + 72, "vl");
      sym("valve3", xr, YMR + 72, "down", { port: sideOf("down", "left") });
      if (unit) typeText(`valve3:gen:${unit.id}`, xv - 4, YMR + 70, "end");
    }
    // Heizungspumpe (with a Rücklaufhochhaltung below its Dreiwegventil), unless built into the generator.
    if (g && !unit?.internalPumps.heating) {
      const yP = g === "pellets" || g === "logWood" ? YMR + 104 : YPUMP;
      sym("pump", xr, yP, "down");
      if (unit) typeText(`pump:gen:${unit.id}`, xr - 10, yP - 3, "end");
    }
    colX += w;
  }
  pipe("vl", [[firstLeg, YMV], [sourceRight, YMV]]);
  // Druckausdehnungsgefäss on the Rücklauf to the generators (suction side), plombierte Absperrung (HE301-01 3.2.2):
  // mirror image of the one of the Solekreis, at the same height.
  {
    const xd = sourceRight - 72;
    const xm = xd + 30;
    pipe("rl", [[xd, YMR], [xd, Y_VESSEL], [xm, Y_VESSEL]]);
    dot(xd, YMR, "rl");
    const v = safety.vessel;
    expansionVessel("rl", xm, -1, v.vn !== null ? `${labels.vessel} ${Math.round(v.vn)} l` : labels.vessel, v.vn !== null ? `p0 ${v.p0.toFixed(1)} bar` : "", "vessel:heating");
  }
  pipe("rl", [[sourceRight, YMR], [firstLeg + 32, YMR]]);
  text(x0, TITLE_Y, labels.sectors.source.toUpperCase(), 8, { anchor: "start", bold: true });

  function drawGenerator(g: GeneratorType | null, cx: number, gx: number, top: number, name: string, id: string) {
    const mid = gx + 22;
    if (g === null) {
      used.add("apparatus");
      add(rect(gx, top, 44, G - top));
      text(mid, G + 14, labels.noGenerator, 7, { muted: true });
      return;
    }
    if (g === "pellets" || g === "logWood" || g === "gasOil") {
      // 2.1.1 Heizkessel with the Energiemittel.
      used.add(g === "gasOil" ? "boilerGasOil" : "boilerSolid");
      add(rect(gx, top, 44, G - top));
      if (g === "gasOil") add(...fuel("liquid", mid - 8, top + 36), ...fuel("gas", mid + 8, top + 36));
      else add(...fuel("solid", mid, top + 36));
    } else if (g === "district") {
      // Übergabestation: 2.2.5 Platten-Wärmetauscher; primary side with Wärmezähler and Regelventil to the left.
      used.add("plateHx");
      add(...plateHx(mid, top + 22, 44));
      const yS = top + 6;
      const yR = top + 36;
      pipe("vl", [[cx + 14, yS], [gx, yS]]);
      pipe("rl", [[gx, yR], [cx + 14, yR]]);
      sym("ball", cx + 30, yS, "right");
      sym("ball", cx + 30, yR, "left");
      sym("heatMeter", gx - 70, yR, "left", { side: sideOf("left", "above") });
      sym("valve2", gx - 30, yR, "left", { side: sideOf("left", "above") });
      text(cx + 14, yS - 30, labels.districtPrimary, 7, { anchor: "start", bold: true });
    } else {
      // Wärmepumpe: 2.2.11 (Luft/Wasser: fan, evaporator, compressor); Sole and Wasser with a Verdampfer-WT instead.
      used.add(g === "hpAir" ? "hpAir" : "hpWater");
      const c = 24;
      add(rect(gx, top, 44, 3 * c), ln(gx, top + c, gx + 44, top + c, 1), ln(gx, top + 2 * c, gx + 44, top + 2 * c, 1));
      if (g === "hpAir") {
        add(ln(gx, top, gx + 44, top + c, 0.6), ln(gx, top + c, gx + 44, top, 0.6), { t: "circle", cx: mid, cy: top + c / 2, r: 7, fill: "bg", stroke: "ink", sw: 0.9 });
        add(poly([[mid - 4, top + c / 2 - 5], [mid + 6, top + c / 2], [mid - 4, top + c / 2 + 5]], "none", 0.8));
      } else {
        add(coil(gx + 6, top + 6, top + c - 6, 30));
      }
      add(coil(gx + 6, top + c + 6, top + 2 * c - 6, 30));
      add(...compressor(mid, top + 2.5 * c));
      if (g === "hpBrine" || g === "hpWater") drawSourceLoop(g, gx, top, id);
    }
    text(mid, G + 14, name, 7.5, { bold: true });
  }

  /**
   * Ausdehnungsgefäss connected from below: the branch comes along the tee line at Y_VESSEL to xm and rises through
   * the plombierte Absperrung (Kappenventil) and the Entleerung (on the side `drainSide`) into the vessel.
   */
  function expansionVessel(kind: PipeKind, xm: number, drainSide: 1 | -1, name: string, sub = "", typeKey = "") {
    const y = Y_VESSEL;
    pipe(kind, [[xm, y], [xm, y - 34]]);
    sym("capValve", xm, y - 13, "up");
    sym("drain", xm, y - 27, "up", { side: sideOf("up", drainSide > 0 ? "right" : "left") });
    sym("expansion", xm, y - 34, "right", { side: sideOf("right", "above") });
    const [first, ...rest] = labels.doNotClose.split(" ");
    text(xm, y + 10, first, 5.5, { bold: true });
    text(xm, y + 17, rest.join(" "), 5.5, { bold: true });
    text(xm, sub ? y - 72 : y - 62, name, 6.5, { bold: true });
    if (sub) text(xm, y - 62, sub, 6.5, { muted: true });
    if (typeKey) {
      if (sub) typeText(typeKey, xm + 12, y - 47, "start");
      else typeText(typeKey, xm, y - 72);
    }
  }

  /**
   * Sicherheitsventil of the Sole- / Zwischenkreis on its Vorlauf to the Verdampfer, between the pump and the
   * Verdampfer (no Absperrung in between, 6.2.3), teed off by `branch` and blowing off to the right like the one of the
   * generator.
   */
  function sourceSafetyValve(x: number, y: number, branch: number) {
    pipe("brine", [[x, y], [x + branch, y]]);
    dot(x, y, "brine");
    used.add("safetyValve");
    add(...safetyValve(x + branch, y, 1));
  }

  /** Bottom of a U-tube from x (kind kl, down) to x + 2r (kind kr, up). */
  function uBend(x: number, y: number, r: number, kl: PipeKind, kr: PipeKind): Prim[] {
    const arc = (x1: number, y1: number, x2: number, y2: number, kind: PipeKind): Prim => ({ t: "path", d: `M${x1},${y1} A${r},${r} 0 0 0 ${x2},${y2}`, fill: "none", stroke: pipeColors[kind], sw: 1.6 });
    return [arc(x, y, x + r, y + r, kl), arc(x + r, y + r, x + 2 * r, y, kr)];
  }

  /** Duplex-Sonde in its borehole from the ground: each leg (xl and xl + DUPLEX) splits into the two U-tubes. */
  function duplex(xl: number, kl: PipeKind, kr: PipeKind) {
    used.add("ews");
    const xr = xl + DUPLEX;
    const yt = G + 12;
    const yb = G + 60;
    pipe(kl, [[xl, G], [xl, yb]]);
    pipe(kl, [[xl, yt], [xl + 5, yt], [xl + 5, yb]]);
    pipe(kr, [[xr, yb], [xr, G]]);
    pipe(kr, [[xr - 5, yb], [xr - 5, yt], [xr, yt]]);
    dot(xl, yt, kl);
    dot(xr, yt, kr);
    add(...uBend(xl, yb, DUPLEX / 2, kl, kr), ...uBend(xl + 5, yb, DUPLEX / 2 - 5, kl, kr));
    for (const x of [xl - 5, xr + 5]) add({ t: "line", x1: x, y1: G, x2: x, y2: yb + DUPLEX / 2 + 5, stroke: "muted", sw: 0.6, dash: "2 2" });
  }

  /** Label of the Erdwärmesonden centred at x below them. */
  function probesLabel(x: number) {
    const y = G + 60 + DUPLEX / 2 + 18;
    text(x, y, labels.boreholes, 7, { bold: true });
    if (ews?.length) text(x, y + 10, `${data.ews.probes} × ${Math.ceil(ews.length)} m`, 6.5, { muted: true });
  }

  /** Probes drawn at a Sondenverteiler (at most 4; the label gives the number). */
  function probeCount() {
    return Math.min(data.ews.probes, 4);
  }

  /**
   * Sondenverteiler (Verteiler at yV, Sammler at yS) with the Duplex-Sonden below it, the first one at x = `left`.
   * The pipes of the upper bar pass behind the lower one. Returns the right end of the bars.
   */
  function drawProbes(left: number, yV: number, yS: number) {
    used.add("distributor");
    const n = probeCount();
    for (let i = 0; i < n; i++) {
      const px = left + i * PROBE_PITCH;
      pipe("brineR", [[px, yV], [px, G]]);
      pipe("brine", [[px + DUPLEX, G], [px + DUPLEX, yS]]);
      duplex(px, "brineR", "brine");
      // Drosselventil on the RL Abgang (to the probe), Absperrung on the VL Abgang (back from it).
      const yValve = Math.max(yV, yS) + 18;
      sym("regValve", px, yValve, "down");
      sym("ball", px + DUPLEX, yValve, "up");
    }
    const x1 = left - 8;
    const x2 = left + (n - 1) * PROBE_PITCH + DUPLEX + 8;
    for (const y of [yV, yS]) add(rect(x1, y - 3.5, x2 - x1, 7, "bg", 1.2));
    // Entleerungen at the end of the bars.
    for (const y of [yV, yS]) sym("drain", x1, y, "up", { side: sideOf("up", "left") });
    text((x1 + x2) / 2, Math.min(yV, yS) - 8, labels.distributor, 6.5, { bold: true });
    probesLabel(left + ((n - 1) * PROBE_PITCH + DUPLEX) / 2);
    return x2;
  }

  /** Sole circuit to the Erdwärmesonden, or Zwischenkreis to a Platten-WT on the ground with the Brunnen below it. */
  function drawSourceLoop(g: "hpBrine" | "hpWater", gx: number, top: number, id: string) {
    // Quellenpumpe, unless built into the WP.
    const sourcePump = !data.generators.find((u) => u.id === id)?.internalPumps.source;
    const xb = gx - 34; // back to the evaporator
    const xa = xb - 30; // to the source (cooled)
    if (g === "hpBrine") {
      // The lines rise straight from the evaporator. In all variants the same sequence at the same heights:
      // Ausdehnungsgefäss, Absperrungen with Entleerungen below them, Solepumpe between them and the WP.
      const dist = data.ews.distributor;
      const yS = dist === "inside" ? YMV + 2 : YMR + 10; // VL back from the probes
      const yV = dist === "inside" ? YMR - 2 : YMR + 22; // RL to the probes
      const back: Pt[] = [[xb, yS], [xb, top + 8], [gx, top + 8]];
      const out: Pt[] = [[gx, top + 16], [xa, top + 16], [xa, yV]];
      const xl = xa - 76; // legs over the source side: VL at xl, RL at xl + DUPLEX
      if (dist === "inside") {
        // Verteiler in the Technikraum at the height of the mains.
        const right = drawProbes(xa - 80 - (probeCount() - 1) * PROBE_PITCH, yV, yS);
        pipe("brineR", [...out, [right, yV]]);
        pipe("brine", [[right, yS], ...back]);
      } else if (dist === "outside") {
        // Verteiler outside the building at the height of the WP: the legs drop to it through the wall.
        const ySo = top + 12;
        const yVo = top + 34;
        const xw = xl - 16;
        add(rect(xw - 4, YBALL - 10, 8, G - YBALL + 10, "bg", 1));
        for (let y = YBALL - 6; y < G; y += 8) add(ln(xw - 4, Math.min(y + 8, G), xw + 4, y, 0.5));
        const right = drawProbes(xw - 38 - (probeCount() - 1) * PROBE_PITCH, yVo, ySo);
        pipe("brineR", [...out, [xl + DUPLEX, yV], [xl + DUPLEX, yVo], [right, yVo]]);
        pipe("brine", [[right, ySo], [xl, ySo], [xl, yS], ...back]);
      } else {
        // One Duplex-Sonde straight below the legs.
        pipe("brineR", [...out, [xl + DUPLEX, yV], [xl + DUPLEX, G]]);
        pipe("brine", [[xl, G], [xl, yS], ...back]);
        duplex(xl, "brine", "brineR");
        probesLabel(xl + DUPLEX / 2);
      }
      sym("ball", xa, YBALL, "up");
      sym("ball", xb, YBALL, "down");
      sym("drain", xa, YBALL + 14, "up", { side: sideOf("up", "left") });
      sym("drain", xb, YBALL + 14, "down", { side: sideOf("down", "left") });
      if (sourcePump) {
        sym("pump", xb, YPUMP, "down");
        typeText(`pump:source:${id}`, xb + 10, YPUMP - 3, "start");
      }
      sourceSafetyValve(xb, top - 12, 10);
      typeText(`sv:source:${id}`, xb + 17, top - 48);
      nw(`source:${id}`, (xa + xb) / 2, YBALL + 36);
      pipe("brineR", [[xa, Y_VESSEL], [xa - 30, Y_VESSEL]]);
      dot(xa, Y_VESSEL, "brineR");
      const v = safety.brine;
      expansionVessel("brineR", xa - 30, 1, v && v.chosen !== null ? `${labels.vessel} ${Math.round(v.chosen)} l` : labels.vessel, "", "vessel:source");
      return;
    }
    // Zwischenkreis: the lines leave the evaporator, rise over the source side and drop to the Platten-WT.
    const yA = YMR + 50;
    const yB = yA + 12;
    const yLow = G - 44;
    pipe("brineR", [[gx, top + 8], [gx - 12, top + 8], [gx - 12, yA], [xa, yA], [xa, yLow]]);
    pipe("brine", [[xb, yLow], [xb, yB], [gx - 22, yB], [gx - 22, top + 16], [gx, top + 16]]);
    sym("ball", xa, yA + 26, "down");
    sym("drain", xa, yA + 40, "down", { side: sideOf("down", "left") });
    pipe("brineR", [[xa, Y_VESSEL], [xa - 30, Y_VESSEL]]);
    dot(xa, Y_VESSEL, "brineR");
    const vz = safety.brine;
    expansionVessel("brineR", xa - 30, 1, vz && vz.chosen !== null ? `${labels.vessel} ${Math.round(vz.chosen)} l` : labels.vessel, "", "vessel:source");
    sym("ball", xb, yB + 20, "up");
    sym("drain", xb, yB + 34, "up", { side: sideOf("up", "left") });
    if (sourcePump) {
      sym("pump", xb, yB + 62, "up");
      typeText(`pump:source:${id}`, xb - 10, yB + 59, "end");
    }
    sourceSafetyValve(xb, top - 12, -16);
    typeText(`sv:source:${id}`, xb - 12, top - 4);
    nw(`source:${id}`, (xa + xb) / 2, yA - 19);
    // Zwischenkreis → Platten-WT (on the ground) → Grundwasser: Förderbrunnen (Unterwasserpumpe), Rückgabebrunnen.
    used.add("plateHx");
    used.add("well");
    const hx = (xa + xb) / 2;
    add(...plateHx(hx, G - 22, 44));
    text(hx, G + 14, labels.intermediate, 6.5, { muted: true });
    const wa = hx - 84;
    const wb = hx - 44;
    const ySup = G - 32;
    const yRet = G - 12;
    pipe("gw", [[wa, G + 76], [wa, ySup], [hx - 22, ySup]]);
    pipe("gwR", [[hx - 22, yRet], [wb, yRet], [wb, G + 30]]);
    sym("ball", wa + 22, ySup, "right");
    sym("ball", wb + 12, yRet, "left");
    for (const [wx, name, anchor] of [[wa, labels.supplyWell, "end"], [wb, labels.returnWell, "start"]] as const) {
      add(ln(wx - 7, G + 24, wx - 7, G + 90, 1), ln(wx + 7, G + 24, wx + 7, G + 90, 1));
      add(poly([[wx - 4, G + 36], [wx + 4, G + 36], [wx, G + 41]], "none", 0.7), ln(wx - 5, G + 43, wx + 5, G + 43, 0.6));
      text(anchor === "end" ? wx - 11 : wx + 11, G + 104, name, 6.5, { anchor, bold: true });
    }
    sym("pump", wa, G + 76, "up");
  }

  // Sector separators (drawn at the end, over the full height).
  const separators: number[] = [];
  const separator = (x: number) => separators.push(x);

  // --- 2 Warmwasser ---------------------------------------------------------------------------------------------
  // Loaded by a Heizgruppe (WW-Ladegruppe), the Wassererwärmer stands right of the Verteiler in its own sector and the
  // mains run straight from the Wärmequelle to the Energiespeicher.
  const external = data.hotWater && data.hotWaterHeater === "external";
  const wwAtGroup = data.hotWater && ww === "group";
  const WW_SECTOR = 222 + (external ? 80 : 0);
  /** Heating legs of the Wassererwärmer: VL at xw, RL at xw - 22, from the left edge of its sector. */
  const WW_LEG = 52;
  const wwLeft = sourceRight;
  const wwRight = wwAtGroup ? wwLeft : wwLeft + WW_SECTOR;
  // WW-Ladegruppe: lines above the boxes of the groups, the VL above the RL (they run to the right without crossing).
  const WW_VL = 40;
  const WW_RL = 48;

  /**
   * Wassererwärmer 2.2.7 on the ground, its heating VL / RL at xw / xw - 22: innenliegende Register (lower / upper), or
   * a Platten-WT beside it with the Ladepumpe on the drinking-water side. Returns where the VL enters and the RL leaves.
   */
  function drawWaterHeater(xw: number) {
    const xT = xw + 66 + (external ? 80 : 0); // room for the Sicherheitsventil and its type left of it
    const top = G - 150;
    const lower = { in: G - 50, out: G - 22 };
    const upper = { in: G - 104, out: G - 76 };
    const hx = xw + 92; // Platten-WT
    const coils = data.hotWaterCoils;
    used.add("waterHeater");
    add(rect(xT, top, 64, 150), rect(xT, top, 64, 16, "bg", 1));
    if (external) {
      // Platten-WT; Ladepumpe from the bottom of the Speicher through the WT back into its top.
      used.add("plateHx");
      add(...plateHx(hx, G - 60, 44));
      pipe("pwc", [[xT, G - 22], [hx + 28, G - 22], [hx + 28, G - 46], [hx + 22, G - 46]]);
      pipe("pwh", [[hx + 22, G - 74], [hx + 36, G - 74], [hx + 36, top + 40], [xT, top + 40]]);
      sym("pump", (hx + 28 + xT) / 2, G - 22, "left");
    } else {
      add(coil(xT + 4, lower.in, lower.out, 46));
      if (coils !== "single") add(coil(xT + 4, upper.in, upper.out, 46));
      // In Serie: out of the upper Register into the lower one.
      if (coils === "series") pipe("vl", [[xT + 4, upper.out], [xT - 8, upper.out], [xT - 8, lower.in], [xT + 4, lower.in]]);
    }
    text(xT + 32, top + 11, data.hotWaterVolume ? `${Math.round(data.hotWaterVolume)} l` : "– l", 7, { bold: true });
    text(xT + 32, G + 14, labels.waterHeater, 7.5, { bold: true });
    // Kaltwasser in at the bottom, Warmwasser out at the top.
    pipe("pwh", [[xT + 64, top + 30], [xT + 88, top + 30]]);
    pipe("pwc", [[xT + 88, G - 12], [xT + 64, G - 12]]);
    text(xT + 90, top + 33, labels.hot, 6.5, { anchor: "start", bold: true });
    text(xT + 90, G - 9, labels.cold, 6.5, { anchor: "start", bold: true });
    return {
      xIn: external ? hx - 22 : xT + 4,
      yIn: external ? G - 74 : coils === "upper" || coils === "series" ? upper.in : lower.in,
      yOut: external ? G - 46 : coils === "upper" ? upper.out : lower.out,
    };
  }

  /**
   * Absperrungen of the Wassererwärmer at the height of those of the generators with thermometers below them at the
   * height of those of the Speicher (VL facing right, RL left), the VL into the connection (with innenliegenden
   * Registern through a thermischer Siphon) and Entleerungen in VL and RL on their horizontals just before the
   * connections at xIn.
   */
  function waterHeaterFittings(xw: number, xIn: number, yIn: number, yOut: number) {
    // VL from its leg to the connection: with innenliegenden Registern a thermischer Siphon right at the leg (as at the
    // Speicher), not with an aussenliegenden Wärmetauscher.
    if (external) pipe("vl", [[xw, yIn], [xIn, yIn]]);
    else siphonPipe(xw, yIn, xw, xIn);
    sym("ball", xw, YBALL, "down");
    sym("ball", xw - 22, YBALL, "up");
    sym("thermometer", xw, YBALL + 26, "down", { side: sideOf("down", "right") });
    sym("thermometer", xw - 22, YBALL + 26, "up", { side: sideOf("up", "left") });
    sym("drain", xIn - 16, yIn, "right", { side: sideOf("right", "below") });
    sym("drain", xIn - 16, yOut, "left", { side: sideOf("left", "below") });
  }

  /** Sicherheitsventil on the heating VL of the Wassererwärmer, between its Absperrung and it; outlet to the right. */
  function waterHeaterSafetyValve(xw: number, y: number) {
    pipe("vl", [[xw, y], [xw + 10, y]]);
    dot(xw, y, "vl");
    used.add("safetyValve");
    add(...safetyValve(xw + 10, y, 1));
    typeText("sv:hotWater", xw + 24, y - 14, "start");
  }

  if (!wwAtGroup) {
    separator(wwLeft);
    text(wwLeft + 12, TITLE_Y, labels.sectors.hotWater.toUpperCase(), 8, { anchor: "start", bold: true });
    pipe("vl", [[wwLeft, YMV], [wwRight, YMV]]);
    pipe("rl", [[wwRight, YMR], [wwLeft, YMR]]);
  }
  if (data.hotWater && !wwAtGroup) {
    const xw = wwLeft + WW_LEG;
    const { xIn, yIn, yOut } = drawWaterHeater(xw);
    if (ww === "diverter") {
      // Umschaltventil (Dreiweg) in the supply main.
      pipe("vl", [[xw, YMV], [xw, yIn]]);
      pipe("rl", [[xIn, yOut], [xw - 22, yOut], [xw - 22, YMR]]);
      dot(xw - 22, YMR, "rl");
      sym("valve3", xw, YMV, "right", { port: sideOf("right", "below") });
      typeText("valve3:hotWater", xw + 14, YMV - 20, "start");
      waterHeaterFittings(xw, xIn, yIn, yOut);
      waterHeaterSafetyValve(xw, YBALL + 68);
      nw("hotWater", xw + 4, YBALL - 28, "start");
    } else if (ww === "generator" && wwGen) {
      // Own pair from the side of the generator, just below the mains: Absperrungen and thermometers as at the other
      // connections, Sicherheitsventil and Ladepumpe below them.
      const { gx, top: gTop } = wwGen;
      const yV = YMR + 16;
      const yR = YMR + 26;
      pipe("vl", [[gx + 44, gTop + 12], [gx + 62, gTop + 12], [gx + 62, yV], [xw, yV], [xw, yIn]]);
      pipe("rl", [[xIn, yOut], [xw - 22, yOut], [xw - 22, yR], [gx + 72, yR], [gx + 72, gTop + 28], [gx + 44, gTop + 28]]);
      waterHeaterFittings(xw, xIn, yIn, yOut);
      waterHeaterSafetyValve(xw, 262);
      if (!wwUnit?.internalPumps.hotWater) {
        sym("pump", xw, 280, "down");
        typeText("pump:hotWater", xw + 10, 277, "start");
      }
      nw("hotWater", xw + 4, yV - 2, "start");
    }
  } else if (!data.hotWater) {
    text((wwLeft + wwRight) / 2, G - 20, labels.noHotWater, 7, { muted: true });
  }

  // --- 3 Energiespeicher ----------------------------------------------------------------------------------------
  const stLeft = wwRight;
  const stRight = stLeft + (data.storage ? 200 : 160);
  separator(stLeft);
  text(stLeft + 12, TITLE_Y, labels.sectors.storage.toUpperCase(), 8, { anchor: "start", bold: true });
  if (data.storage) {
    // Technischer Speicher on the ground, the size of the Wassererwärmer. Konventionell: the mains drop into it on the
    // generator side and rise out of it on the consumer side (VL at the top, RL at the bottom); reduziert: the VL main
    // runs on to the Verteiler with a T-Stück down into the Speicher, the RL from the Verteiler runs through it. The VL
    // into the Speicher enters its side near the top through a thermischer Siphon.
    const xs = stLeft + 68;
    // Legs to and from the Speicher: RL outside, VL inside, far enough apart for the thermometers beside them.
    const dR = 44;
    const dV = 20;
    const w = 64;
    const top = G - 150;
    const yTop = top + 26;
    const yBot = G - 20;
    used.add("storage");
    add(rect(xs, top, w, 150), rect(xs, top, w, 16, "bg", 1));
    text(xs + w / 2, top + 11, data.storageVolume ? `${Math.round(data.storageVolume)} l` : "– l", 7, { bold: true });
    text(xs + w / 2, G + 14, labels.storage, 7.5, { bold: true });
    // Speicher at the highest VL of the groups, the mixed Rücklauf of the groups.
    const temps = storageTemperatures(data);
    if (temps.storage !== null) text(xs + w / 2, top + 30, `${temps.storage} °C`, 7, { muted: true });
    if (temps.ret !== null) text(xs + w / 2, yBot - 8, `${labels.return} ${(Math.round(temps.ret * 10) / 10).toLocaleString("de-CH")} °C`, 6.5, { muted: true });
    pipe("rl", [[xs, yBot], [xs - dR, yBot], [xs - dR, YMR], [stLeft, YMR]]);
    pipe("rl", [[stRight, YMR], [xs + w + dR, YMR], [xs + w + dR, yBot], [xs + w, yBot]]);
    // Absperrungen in all lines to and from the Speicher at the height of those of the generators, thermometers below
    // them (facing away from the Speicher), Entleerungen in the Rücklauf connections on both sides.
    const legs: [number, 1 | -1][] = [[xs - dR, -1], [xs + w + dR, 1]];
    if (data.storageConnection === "reduced") {
      pipe("vl", [[stLeft, YMV], [stRight, YMV]]);
      pipe("vl", [[xs - dV, YMV], [xs - dV, yTop]]);
      dot(xs - dV, YMV, "vl");
      legs.push([xs - dV, -1]);
    } else {
      pipe("vl", [[stLeft, YMV], [xs - dV, YMV], [xs - dV, yTop]]);
      pipe("vl", [[xs + w, yTop], [xs + w + dV, yTop], [xs + w + dV, YMV], [stRight, YMV]]);
      legs.push([xs - dV, -1], [xs + w + dV, 1]);
    }
    siphonPipe(xs - dV, yTop, xs - dV, xs);
    for (const [x, side] of legs) {
      sym("ball", x, YBALL, "down");
      sym("thermometer", x, YBALL + 26, "down", { side: sideOf("down", side < 0 ? "left" : "right") });
    }
    sym("drain", xs - dR / 2, yBot, "left", { side: sideOf("left", "below") });
    sym("drain", xs + w + dR / 2, yBot, "left", { side: sideOf("left", "below") });
  } else {
    pipe("vl", [[stLeft, YMV], [stRight, YMV]]);
    pipe("rl", [[stRight, YMR], [stLeft, YMR]]);
    text((stLeft + stRight) / 2, G - 20, labels.noStorage, 7, { muted: true });
  }

  // --- 4 Verteiler und Heizgruppen --------------------------------------------------------------------------------
  // The mains drop from above to the Verteiler, which sits just above the ground.
  const dLeft = stRight;
  separator(dLeft);
  text(dLeft + 12, TITLE_Y, labels.sectors.distribution.toUpperCase(), 8, { anchor: "start", bold: true });
  const n = Math.max(data.groups.length, 1);
  const xdR = dLeft + 20; // RL drop
  const xdV = dLeft + 42; // VL drop
  const b0 = dLeft + (data.distributor === "pressurized" ? 125 : 95); // bar start (room for the Hauptpumpe texts)
  const b1 = b0 + n * GROUP_W + 6;
  const pressurized = data.distributor === "pressurized";
  // Warmwasser sector of the WW-Ladegruppe right of the Verteiler: its heating VL / RL legs.
  const wwGroupLeft = b1 + 40;
  const xwG = wwGroupLeft + WW_LEG;
  pipe("vl", [[dLeft, YMV], [xdV, YMV], [xdV, YVD], [b0, YVD]]);
  pipe("rl", [[b0, YRD], [xdR, YRD], [xdR, YMR], [dLeft, YMR]]);
  // Verteiler bars (thicker).
  pipe("vl", [[b0, YVD], [b1, YVD]], 3.6);
  pipe("rl", [[b1, YRD], [b0, YRD]], 3.6);
  if (pressurized) {
    sym("pump", xdV, 240, "down");
    text(xdV + 12, 243, labels.mainPump, 6.5, { anchor: "start", muted: true });
    nw("main", xdV + 12, 252, "start");
    typeText("pump:main", xdV + 12, 268, "start");
  } else if (!data.storage) {
    // Druckloser Verteiler: VL and RL short-circuited at the feed (Bypass).
    pipe("vl", [[b0 + 6, YVD], [b0 + 6, YRD]]);
    dot(b0 + 6, YVD, "vl");
    dot(b0 + 6, YRD, "rl");
    text(b0 + 2, YRD + 16, labels.bypass, 6.5, { anchor: "end", muted: true });
  }
  text(b0, G + 14, pressurized ? labels.pressurized : labels.unpressurized, 7.5, { anchor: "start", bold: true });

  data.groups.forEach((group, i) => {
    begin(group.id);
    const a = b0 + 30 + i * GROUP_W; // VL leg
    const b = a + GROUP_LEG; // RL leg
    const cx = (a + b) / 2;
    const yC = 104; // bottom of the group box
    const yBox = 58; // top of the group box
    pipe("vl", [[a, YVD], [a, yC]]);
    pipe("rl", [[b, yC], [b, YRD]]);
    const loadsWater = wwGroup?.id === group.id;
    if (loadsWater) {
      // WW-Ladegruppe: the lines leave the top of its box and run over the other groups to the Wassererwärmer.
      pipe("vl", [[a, yBox], [a, WW_VL], [xwG, WW_VL]]);
      pipe("rl", [[xwG - 22, WW_RL], [b, WW_RL], [b, yBox]]);
    }
    dot(a, YVD, "vl");
    dot(b, YRD, "rl");
    // The same box for every group (1.27.1 Apparat mit Bezeichnung) with its texts inside.
    used.add("apparatus");
    add(rect(cx - 46, yBox, 92, yC - yBox));
    const temps = group.supplyTemp !== null || group.returnTemp !== null ? `${group.supplyTemp ?? "–"}/${group.returnTemp ?? "–"} °C` : "";
    const power = group.power !== null ? `${Math.round(group.power * 10) / 10} kW` : "";
    text(cx, yBox + 13, group.name || opts.groupNames?.(i) || `${labels.group} ${i + 1}`, 7.5, { bold: true });
    text(cx, yBox + 25, loadsWater ? labels.waterHeater : group.emitter ? labels.emitters[group.emitter] : "", 6.5, { muted: true });
    text(cx, yBox + 37, [power, temps].filter(Boolean).join(" · "), 6.5, { muted: true });
    text(cx, YRD + 18, labels.circuits[group.circuit], 6.5, { muted: true });
    nw(`group:${group.id}`, cx, yC + 12);
    // Absperrungen at the Verteiler.
    sym("ball", a, 312, "up");
    sym("ball", b, 312, "down");
    // After the pump (consumer side): Vorlauffühler, thermometers and Absperrungen in VL and RL.
    sym("sensor", a, 160, "up", { side: sideOf("up", "left") });
    // Sicherheitsthermostat below the Vorlauffühler.
    if (group.safetyThermostat) sym("safetyThermostat", a, 173, "up", { side: sideOf("up", "left") });
    sym("thermometer", a, 146, "up", { side: sideOf("up", "left") });
    sym("thermometer", b, 146, "down", { side: sideOf("down", "right") });
    sym("ball", a, 126, "up");
    sym("ball", b, 126, "down");
    // Entleerungen in VL and RL: between the Absperrungen and the group box, and between the Absperrungen at the
    // Verteiler and the Wärmezähler.
    for (const y of [112, 299]) {
      sym("drain", a, y, "up", { side: sideOf("up", "left") });
      sym("drain", b, y, "down", { side: sideOf("down", "right") });
    }
    if (group.heatMeter) {
      // Wärmezähler between the Mischventil and the Verteiler: meter in the RL, probe in the VL wired to the Rechenwerk.
      sym("heatMeter", b, 288, "down", { side: sideOf("down", "left") });
      add(ln(a + 2, 288, b - 20.5, 288, 0.6, "1.5 1.2"), { t: "circle", cx: a, cy: 288, r: 2, fill: "bg", stroke: "ink", sw: 0.7 });
    }
    const bypass = (y: number) => {
      pipe("vl", [[a, y], [b, y]]);
      dot(a, y, "vl");
      dot(b, y, "rl");
    };
    switch (group.circuit) {
      case "mixing":
        // Beimischschaltung: Dreiwegventil in the supply, bypass from the return, group pump.
        pipe("rl", [[b, 250], [a + 6, 250]]);
        dot(b, 250, "rl");
        sym("valve3", a, 250, "up", { port: sideOf("up", "right") });
        sym("pump", a, 205, "up");
        typeText(`valve3:group:${group.id}`, a - 22, 248, "end");
        typeText(`pump:group:${group.id}`, a + 10, 202, "start");
        break;
      case "throttle":
        // Drosselschaltung: Durchgangsventil, no group pump.
        sym("valve2", a, 240, "up", { side: sideOf("up", "left") });
        break;
      case "diverting":
        // Umlenkschaltung: Dreiwegventil in the return, bypass from the supply.
        pipe("vl", [[a, 240], [b - 6, 240]]);
        dot(a, 240, "vl");
        sym("valve3", b, 240, "down", { port: sideOf("down", "left") });
        typeText(`valve3:group:${group.id}`, b + 22, 238, "start");
        break;
      case "injection3":
        // Einspritzschaltung mit Dreiwegventil: primary valve in the return with its bypass, secondary bypass, pump.
        pipe("vl", [[a, 262], [b - 6, 262]]);
        dot(a, 262, "vl");
        sym("valve3", b, 262, "down", { port: sideOf("down", "left") });
        bypass(222);
        sym("pump", a, 190, "up");
        typeText(`valve3:group:${group.id}`, b + 22, 260, "start");
        typeText(`pump:group:${group.id}`, a + 10, 187, "start");
        break;
      case "injection2":
        // Einspritzschaltung mit Durchgangsventil: valve in the primary supply, Regulierventil, secondary bypass, pump.
        sym("valve2", a, 258, "up", { side: sideOf("up", "left") });
        sym("regValve", b, 258, "down");
        bypass(222);
        sym("pump", a, 190, "up");
        typeText(`pump:group:${group.id}`, a + 10, 187, "start");
        break;
    }
  });
  begin(null);
  if (!data.groups.length) text(b0 + 30, 200, labels.noGroups, 7, { anchor: "start", muted: true });
  if (wwAtGroup) {
    separator(wwGroupLeft);
    text(wwGroupLeft + 12, TITLE_Y, labels.sectors.hotWater.toUpperCase(), 8, { anchor: "start", bold: true });
    const { xIn, yIn, yOut } = drawWaterHeater(xwG);
    if (wwGroup) {
      // The lines of the WW-Ladegruppe come over the groups from the left.
      pipe("vl", [[xwG, WW_VL], [xwG, yIn]]);
      pipe("rl", [[xIn, yOut], [xwG - 22, yOut], [xwG - 22, WW_RL]]);
      waterHeaterFittings(xwG, xIn, yIn, yOut);
      waterHeaterSafetyValve(xwG, YBALL + 68);
      nw(`group:${wwGroup.id}`, xwG + 4, YBALL - 28, "start");
    }
  }
  for (const x of separators) add(ln(x, 8, x, maxY + 10, 0.6, "6 3 1.5 3"));
  // Ground line with hatching below it.
  const sheetRight = Math.max(wwAtGroup ? wwGroupLeft + WW_SECTOR : b1 + 40, 600);
  const right = sheetRight - 10;
  add(ln(10, G, right, G, 1.2));
  for (let x = 16; x <= right; x += 10) add(ln(x, G, x - 5, G + 5, 0.5));

  const width = sheetRight;
  return {
    width,
    height: maxY + 24,
    lines,
    groups: groups.filter((g) => g.prims.length),
    used: symbolKeys.filter((k) => used.has(k)),
    pipes: (["vl", "rl", "brine", "brineR", "gw", "gwR", "pwh", "pwc"] as const).filter((k) => pipes.has(k)),
  };
}

/** A symbol for the legend, centred in a box of 40 × 30 units. */
export function legendSymbol(key: SymbolKey): Prim[] {
  switch (key) {
    case "boilerSolid":
      return [rect(10, 1, 20, 28), ...fuel("solid", 20, 18)];
    case "boilerGasOil":
      return [rect(8, 1, 24, 28), ...fuel("liquid", 15, 18), ...fuel("gas", 25, 18)];
    case "hpAir":
    case "hpWater": {
      const c = 9.5;
      const out: Prim[] = [rect(10, 1, 20, 3 * c, "bg", 1), ln(10, 1 + c, 30, 1 + c), ln(10, 1 + 2 * c, 30, 1 + 2 * c)];
      if (key === "hpAir") out.push(ln(10, 1, 30, 1 + c, 0.5), ln(10, 1 + c, 30, 1, 0.5), { t: "circle", cx: 20, cy: 1 + c / 2, r: 3.5, fill: "bg", stroke: "ink", sw: 0.7 });
      else out.push(coil(12, 3.5, c - 1.5, 15));
      out.push(coil(12, 1 + c + 2.5, 1 + 2 * c - 2.5, 15), ...compressor(20, 1 + 2.5 * c, 3.5));
      return out;
    }
    case "plateHx":
      return plateHx(20, 15, 24);
    case "storage":
      return [rect(11, 1, 18, 28), rect(11, 1, 18, 7, "bg", 0.8)];
    case "waterHeater":
      return [rect(11, 1, 18, 28), rect(11, 1, 18, 7, "bg", 0.8), coil(12, 18, 26, 12)];
    case "ews":
      return [ln(4, 6, 36, 6), path("M14,6 L14,22 A6,6 0 0 0 26,22 L26,6", 1.4)];
    case "distributor":
      return [ln(14, 12, 14, 29, 1.2), ln(26, 4, 26, 29, 1.2), rect(6, 3, 28, 5, "bg", 1), rect(6, 11, 28, 5, "bg", 1)];
    case "well":
      return [ln(13, 2, 13, 29), ln(27, 2, 27, 29), poly([[16, 6], [24, 6], [20, 10]], "none", 0.6), ...drawSymbol("pump", 20, 21, "up")];
    case "floor":
    case "radiator":
    case "register":
    case "apparatus":
      return emitterSymbol(key, 20, 15, 28);
    case "safetyValve":
      return [{ t: "line", x1: 6, y1: 27, x2: 34, y2: 27, stroke: "muted", sw: 1 }, ...safetyValve(22, 27)];
    case "siphon":
      return [path(siphonD(2, 8, 15, 38), 1.2)];
    default: {
      // Pipe symbols on a short pipe: parts beside the pipe hang below it, drives point up.
      const offPipe = key === "thermometer" || key === "sensor" || key === "safetyThermostat" || key === "heatMeter" || key === "expansion" || key === "drain";
      const y = key === "expansion" ? 5 : offPipe ? 8 : key === "valve2" || key === "valve3" ? 22 : 15;
      return [{ t: "line", x1: 2, y1: y, x2: 38, y2: y, stroke: "muted", sw: 1 }, ...drawSymbol(key, 20, y, "right", { side: offPipe ? 1 : -1, port: 1 })];
    }
  }
}
