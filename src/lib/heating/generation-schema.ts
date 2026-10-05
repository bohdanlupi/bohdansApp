// Prinzipschema of a Wärmeerzeugungsanlage (242), as drawing primitives shared by the web view and the PDF. Four
// sectors from left to right:
//
//   WÄRMEQUELLE            WARMWASSER          ENERGIESPEICHER      VERTEILER / HEIZGRUPPEN
//                                                                    G1      G2      G3    (consumers on top)
//   VL ════╤═══════════════╦═══════════════════╗ ┌──┐ ╔═══════════════╤═══════╤═══════╤═══  Vorlauf bar
//   RL ┄┄┄┄┼┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┼┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄│ │  │ │┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┼┄┄┄┄┄┄┄┼┄┄┄┄┄┄┄┼┄┄┄  Rücklauf bar
//        generators         Wassererwärmer       └──┘
//        (source side below: EWS, Brunnen, Fernwärme)
//
// Symbols after SIA 410 (1978/1986): 1.26 Armaturen, 1.27 Apparate, 1.28 Messelemente, 1.29 Antriebe, 1.210 Zähler,
// 1.211 Energiemittel, 2.1 Heizkessel, 2.2 Speicher und Wärmetauscher, 2.3 Heizkörper, 2.4 Ausdehnungsgefässe, 2.5.1
// Vorlauf solid / Rücklauf dashed. Parts SIA 410 lacks (Sole/Wasser- and Wasser/Wasser-WP, technischer Speicher,
// Erdwärmesonden, Brunnen) are built from its parts («sinngemäss»). Colours: Vorlauf red, Rücklauf blue, Sole brown,
// Grundwasser cyan.

import type { Paint, Prim } from "@/lib/kwl/schema-symbols";

import type { EmitterType, GeneratorType } from "./plan-schema";
import type { CircuitType, PlantData } from "./plant-schema";

export type PipeKind = "vl" | "rl" | "brine" | "brineR" | "gw" | "gwR" | "pwc" | "pwh";

export const pipeColors: Record<PipeKind, `#${string}`> = {
  vl: "#e3001b",
  rl: "#0057b8",
  brine: "#8c5a2b",
  brineR: "#8c5a2b",
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
  "check",
  "regValve",
  "valve2",
  "valve3",
  "pump",
  "thermometer",
  "sensor",
  "heatMeter",
  "expansion",
  "boilerSolid",
  "boilerGasOil",
  "hpAir",
  "hpWater",
  "plateHx",
  "storage",
  "waterHeater",
  "ews",
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
  check: "1.26.9",
  regValve: "2.6.9",
  valve2: "1.26.5 / 1.29.10",
  valve3: "1.26.3 / 1.29.10",
  pump: "1.27.3",
  thermometer: "1.28.11",
  sensor: "1.28.2",
  heatMeter: "1.210.3",
  expansion: "2.4.2",
  boilerSolid: "2.1.1 / 1.211.1",
  boilerGasOil: "2.1.1 / 1.211.2–3",
  hpAir: "2.2.11",
  hpWater: "~ 2.2.11",
  plateHx: "2.2.5",
  storage: "~ 2.2.2",
  waterHeater: "2.2.7",
  ews: "~",
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
const schemaTextKeys = ["noGenerator", "boreholes", "supplyWell", "returnWell", "intermediate", "districtPrimary", "waterHeater", "noHotWater", "storage", "noStorage", "mainPump", "pressurized", "unpressurized", "bypass", "group", "noGroups", "cold", "hot", "supply", "return"] as const;

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
      // 1.28.2 Messfühler Temperatur: element in the pipe, line to the controller.
      return [g.line(0, 2.6 * s, 0, 13 * s, 0.8), g.circle(0, 0, 2.6, "bg", 0.8)];
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

const emitterKey = (e: EmitterType | null): SymbolKey =>
  e === "floor" || e === "tabs" ? "floor" : e === "radiators" ? "radiator" : e === "air" ? "register" : "apparatus";

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const YV = 330; // Vorlauf main / bar
const YR = 360; // Rücklauf main / bar
const YG = 480; // top of the generators
const TITLE_Y = 22;
const GROUP_W = 104;
const GROUP_LEG = 36; // VL leg → RL leg of a group

/** Width of the column of a generator (the source side lies left of the generator). */
const genWidth = (g: GeneratorType | null) => (g === "hpWater" ? 270 : g === "hpBrine" || g === "district" ? 190 : 120);

export function buildGenerationSchema(data: PlantData, labels: GenerationLabels, opts: { groupNames?: (i: number) => string } = {}): GenerationSchema {
  const lines: SchemaLine[] = [];
  const groups: SchemaGroup[] = [];
  const used = new Set<SymbolKey>();
  const pipes = new Set<PipeKind>();
  let maxY = YR + 60;
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
  const gens: (GeneratorType | null)[] = data.generators.length ? data.generators : [null];
  const x0 = 24;
  const sourceRight = x0 + gens.reduce((s, g) => s + genWidth(g), 0) + 10;
  let colX = x0;
  let firstLeg = Infinity;
  for (const g of gens) {
    const w = genWidth(g);
    const gx = colX + w - 66; // left edge of the generator box (44 wide)
    const xv = gx + 10; // VL out
    const xr = gx + 34; // RL in
    firstLeg = Math.min(firstLeg, xv);
    drawGenerator(g, colX, gx);
    // VL leg up to the main, RL leg down from it.
    pipe("vl", [[xv, YG], [xv, YV]]);
    pipe("rl", [[xr, YR], [xr, YG]]);
    dot(xv, YV, "vl");
    dot(xr, YR, "rl");
    sym("ball", xv, 455, "up");
    sym("ball", xr, 378, "down");
    if (g === "pellets" || g === "logWood") {
      // Rücklaufhochhaltung: Dreiwegventil in the return, bypass from the supply.
      pipe("vl", [[xv, 404], [xr - 6, 404]]);
      dot(xv, 404, "vl");
      sym("valve3", xr, 404, "down", { port: sideOf("down", "left") });
      sym("pump", xr, 432, "down");
      sym("check", xr, 458, "down");
    } else if (g) {
      sym("pump", xr, 410, "down");
      sym("check", xr, 440, "down");
    }
    colX += w;
  }
  pipe("vl", [[firstLeg, YV], [sourceRight, YV]]);
  pipe("rl", [[sourceRight, YR], [firstLeg + 24, YR]]);
  text(x0, TITLE_Y, labels.sectors.source.toUpperCase(), 8, { anchor: "start", bold: true });

  function drawGenerator(g: GeneratorType | null, cx: number, gx: number) {
    const mid = gx + 22;
    let bottom = YG + 60;
    if (g === null) {
      used.add("apparatus");
      add(rect(gx, YG, 44, 60));
      text(mid, YG + 74, labels.noGenerator, 7, { muted: true });
      return;
    }
    if (g === "pellets" || g === "logWood" || g === "gasOil") {
      // 2.1.1 Heizkessel with the Energiemittel.
      used.add(g === "gasOil" ? "boilerGasOil" : "boilerSolid");
      add(rect(gx, YG, 44, 60));
      if (g === "gasOil") add(...fuel("liquid", mid - 8, YG + 36), ...fuel("gas", mid + 8, YG + 36));
      else add(...fuel("solid", mid, YG + 36));
    } else if (g === "district") {
      // Übergabestation: 2.2.5 Platten-Wärmetauscher; primary side with Wärmezähler and Regelventil to the left.
      used.add("plateHx");
      add(...plateHx(mid, YG + 22, 44));
      bottom = YG + 44;
      const yS = YG + 10;
      const yR = YG + 34;
      pipe("vl", [[cx + 14, yS], [gx, yS]]);
      pipe("rl", [[gx, yR], [cx + 14, yR]]);
      sym("ball", cx + 30, yS, "right");
      sym("ball", cx + 30, yR, "left");
      sym("heatMeter", gx - 70, yR, "left", { side: sideOf("left", "below") });
      sym("valve2", gx - 30, yR, "left", { side: sideOf("left", "below") });
      text(cx + 14, yS - 8, labels.districtPrimary, 7, { anchor: "start", bold: true });
    } else {
      // Wärmepumpe: 2.2.11 (Luft/Wasser: fan, evaporator, compressor); Sole and Wasser with a Verdampfer-WT instead.
      used.add(g === "hpAir" ? "hpAir" : "hpWater");
      const c = 24;
      add(rect(gx, YG, 44, 3 * c), ln(gx, YG + c, gx + 44, YG + c, 1), ln(gx, YG + 2 * c, gx + 44, YG + 2 * c, 1));
      if (g === "hpAir") {
        add(ln(gx, YG, gx + 44, YG + c, 0.6), ln(gx, YG + c, gx + 44, YG, 0.6), { t: "circle", cx: mid, cy: YG + c / 2, r: 7, fill: "bg", stroke: "ink", sw: 0.9 });
        add(poly([[mid - 4, YG + c / 2 - 5], [mid + 6, YG + c / 2], [mid - 4, YG + c / 2 + 5]], "none", 0.8));
      } else {
        add(coil(gx + 6, YG + 6, YG + c - 6, 30));
      }
      add(coil(gx + 6, YG + c + 6, YG + 2 * c - 6, 30));
      add(...compressor(mid, YG + 2.5 * c));
      bottom = YG + 3 * c;
      if (g === "hpBrine" || g === "hpWater") drawSourceLoop(g, cx, gx);
    }
    text(mid, bottom + 13, labels.generators[g], 7.5, { bold: true });
  }

  /** Sole circuit to the Erdwärmesonden, or Zwischenkreis to the Platten-WT and the Brunnen. */
  function drawSourceLoop(g: "hpBrine" | "hpWater", cx: number, gx: number) {
    const wide = g === "hpWater";
    const xa = gx - (wide ? 100 : 64); // to the source (cooled)
    const xb = gx - (wide ? 70 : 30); // back to the evaporator
    const yOut = YG + 8;
    const yIn = YG + 16;
    const yLow = YG + 120; // top of the EWS / the Platten-WT
    pipe("brineR", [[gx, yOut], [xa, yOut], [xa, yLow]]);
    pipe("brine", [[xb, yLow], [xb, yIn], [gx, yIn]]);
    sym("ball", xa, YG + 34, "down");
    sym("expansion", xa, YG + 60, "down", { side: sideOf("down", "left") });
    sym("ball", xb, YG + 34, "up");
    sym("pump", xb, YG + 62, "up");
    if (!wide) {
      // Erdwärmesonden: terrain line, the U-loop below it.
      used.add("ews");
      add(ln(xa - 18, yLow, xb + 18, yLow, 1));
      for (let x = xa - 16; x <= xb + 16; x += 6) add(ln(x, yLow, x - 4, yLow + 4, 0.6));
      pipe("brineR", [[xa, yLow], [xa, yLow + 60]]);
      pipe("brine", [[xb, yLow + 60], [xb, yLow]]);
      add({ t: "path", d: `M${xa},${yLow + 60} A${(xb - xa) / 2},${(xb - xa) / 2} 0 0 0 ${xb},${yLow + 60}`, fill: "none", stroke: pipeColors.brine, sw: 1.6 });
      text((xa + xb) / 2, yLow + 60 + (xb - xa) / 2 + 14, labels.boreholes, 7, { bold: true });
      return;
    }
    // Zwischenkreis → Platten-WT → Grundwasser: Förderbrunnen (Unterwasserpumpe) and Rückgabebrunnen.
    used.add("plateHx");
    used.add("well");
    const hx = (xa + xb) / 2;
    const hy = yLow + 22;
    add(...plateHx(hx, hy, 44));
    text(xb + 6, YG + 100, labels.intermediate, 6.5, { anchor: "start", muted: true });
    // Groundwater: from the supply well up into the WT, out of it down to the return well.
    const wa = hx - 50;
    const wb = hx + 50;
    const yW = hy + 70;
    pipe("gw", [[wa, yW + 46], [wa, hy + 10], [hx - 22, hy + 10]]);
    pipe("gwR", [[hx + 22, hy + 10], [wb, hy + 10], [wb, yW]]);
    for (const [wx, name, anchor] of [[wa, labels.supplyWell, "end"], [wb, labels.returnWell, "start"]] as const) {
      add(ln(wx - 7, yW - 6, wx - 7, yW + 60, 1), ln(wx + 7, yW - 6, wx + 7, yW + 60, 1));
      add(poly([[wx - 4, yW + 6], [wx + 4, yW + 6], [wx, yW + 11]], "none", 0.7), ln(wx - 5, yW + 13, wx + 5, yW + 13, 0.6));
      text(anchor === "end" ? wx - 11 : wx + 11, yW + 40, name, 6.5, { anchor, bold: true });
    }
    sym("pump", wa, yW + 46, "up");
    sym("ball", wa, hy + 34, "up");
    sym("ball", wb, hy + 34, "down");
  }

  // Sector separators (drawn at the end, over the full height).
  const separators: number[] = [];
  const separator = (x: number) => separators.push(x);

  // --- 2 Warmwasser ---------------------------------------------------------------------------------------------
  const wwLeft = sourceRight;
  const wwRight = wwLeft + 170;
  separator(wwLeft);
  text(wwLeft + 12, TITLE_Y, labels.sectors.hotWater.toUpperCase(), 8, { anchor: "start", bold: true });
  if (data.hotWater) {
    // Umschaltventil (Dreiweg) in the supply, Wassererwärmer 2.2.7 with its coil below the mains.
    const xw = wwLeft + 40;
    const xT = xw + 26;
    const top = 420;
    const yIn = 520;
    const yOut = 548;
    pipe("vl", [[wwLeft, YV], [wwRight, YV]]);
    pipe("rl", [[wwRight, YR], [wwLeft, YR]]);
    pipe("vl", [[xw, YV], [xw, yIn], [xT + 4, yIn]]);
    pipe("rl", [[xT + 4, yOut], [xw - 22, yOut], [xw - 22, YR]]);
    dot(xw - 22, YR, "rl");
    sym("valve3", xw, YV, "right", { port: sideOf("right", "below") });
    sym("ball", xw, 470, "down");
    sym("ball", xw - 22, 470, "up");
    used.add("waterHeater");
    add(rect(xT, top, 64, 150), rect(xT, top, 64, 16, "bg", 1));
    add(coil(xT + 4, yIn, yOut, 46));
    text(xT + 32, top + 11, data.hotWaterVolume ? `${Math.round(data.hotWaterVolume)} l` : "– l", 7, { bold: true });
    text(xT + 32, top + 166, labels.waterHeater, 7.5, { bold: true });
    // Kaltwasser in at the bottom, Warmwasser out at the top.
    pipe("pwh", [[xT + 64, top + 30], [xT + 88, top + 30]]);
    pipe("pwc", [[xT + 88, top + 138], [xT + 64, top + 138]]);
    text(xT + 90, top + 33, labels.hot, 6.5, { anchor: "start", bold: true });
    text(xT + 90, top + 141, labels.cold, 6.5, { anchor: "start", bold: true });
  } else {
    pipe("vl", [[wwLeft, YV], [wwRight, YV]]);
    pipe("rl", [[wwRight, YR], [wwLeft, YR]]);
    text((wwLeft + wwRight) / 2, YR + 40, labels.noHotWater, 7, { muted: true });
  }

  // --- 3 Energiespeicher ----------------------------------------------------------------------------------------
  const stLeft = wwRight;
  const stRight = stLeft + 150;
  separator(stLeft);
  text(stLeft + 12, TITLE_Y, labels.sectors.storage.toUpperCase(), 8, { anchor: "start", bold: true });
  if (data.storage) {
    const xs = stLeft + 40;
    const w = 70;
    const top = 270;
    const yTop = top + 26;
    const yBot = 420;
    used.add("storage");
    add(rect(xs, top, w, 170), rect(xs, top, w, 16, "bg", 1));
    text(xs + w / 2, top + 11, data.storageVolume ? `${Math.round(data.storageVolume)} l` : "– l", 7, { bold: true });
    text(xs + w / 2, top + 184, labels.storage, 7.5, { bold: true });
    pipe("vl", [[stLeft, YV], [xs - 16, YV], [xs - 16, yTop], [xs, yTop]]);
    pipe("vl", [[xs + w, yTop], [xs + w + 16, yTop], [xs + w + 16, YV], [stRight, YV]]);
    pipe("rl", [[stRight, YR], [xs + w + 16, YR], [xs + w + 16, yBot], [xs + w, yBot]]);
    pipe("rl", [[xs, yBot], [xs - 16, yBot], [xs - 16, YR], [stLeft, YR]]);
  } else {
    pipe("vl", [[stLeft, YV], [stRight, YV]]);
    pipe("rl", [[stRight, YR], [stLeft, YR]]);
    text((stLeft + stRight) / 2, YR + 40, labels.noStorage, 7, { muted: true });
  }

  // --- 4 Verteiler und Heizgruppen --------------------------------------------------------------------------------
  const dLeft = stRight;
  separator(dLeft);
  text(dLeft + 12, TITLE_Y, labels.sectors.distribution.toUpperCase(), 8, { anchor: "start", bold: true });
  const n = Math.max(data.groups.length, 1);
  const b0 = dLeft + 60; // bar start
  const b1 = b0 + n * GROUP_W + 6;
  const pressurized = data.distributor === "pressurized";
  pipe("vl", [[dLeft, YV], [b0, YV]]);
  pipe("rl", [[b0, YR], [dLeft, YR]]);
  // Verteiler bars (thicker).
  pipe("vl", [[b0, YV], [b1, YV]], 3.6);
  pipe("rl", [[b1, YR], [b0, YR]], 3.6);
  if (pressurized) {
    sym("pump", dLeft + 30, YV, "right");
    text(dLeft + 30, YV - 14, labels.mainPump, 6.5, { muted: true });
  } else if (!data.storage) {
    // Druckloser Verteiler: VL and RL short-circuited at the feed (Bypass).
    pipe("vl", [[b0 + 6, YV], [b0 + 6, YR]]);
    dot(b0 + 6, YV, "vl");
    dot(b0 + 6, YR, "rl");
    text(b0 + 2, YR + 16, labels.bypass, 6.5, { anchor: "end", muted: true });
  }
  text(b0, YR + 50, pressurized ? labels.pressurized : labels.unpressurized, 7.5, { anchor: "start", bold: true });

  data.groups.forEach((group, i) => {
    begin(group.id);
    const a = b0 + 30 + i * GROUP_W; // VL leg
    const b = a + GROUP_LEG; // RL leg
    const cx = (a + b) / 2;
    const yC = 104; // consumer
    pipe("vl", [[a, YV], [a, yC]]);
    pipe("rl", [[b, yC], [b, YR]]);
    dot(a, YV, "vl");
    dot(b, YR, "rl");
    // Consumer and its texts.
    const ek = emitterKey(group.emitter);
    used.add(ek);
    add(...emitterSymbol(ek, cx, yC - 6, 50));
    const temps = group.supplyTemp !== null || group.returnTemp !== null ? `${group.supplyTemp ?? "–"}/${group.returnTemp ?? "–"} °C` : "";
    const power = group.power !== null ? `${Math.round(group.power * 10) / 10} kW` : "";
    text(cx, 52, group.name || opts.groupNames?.(i) || `${labels.group} ${i + 1}`, 7.5, { bold: true });
    text(cx, 63, group.emitter ? labels.emitters[group.emitter] : "", 6.5, { muted: true });
    text(cx, 74, [power, temps].filter(Boolean).join(" · "), 6.5, { muted: true });
    text(cx, YR + 18, labels.circuits[group.circuit], 6.5, { muted: true });
    // Absperrungen and thermometers near the Verteiler.
    sym("ball", a, 312, "up");
    sym("ball", b, 312, "down");
    sym("thermometer", a, 290, "up", { side: sideOf("up", "left") });
    sym("thermometer", b, 290, "down", { side: sideOf("down", "right") });
    // Vorlauffühler after the valve / pump.
    sym("sensor", a, 140, "up", { side: sideOf("up", "left") });
    if (group.heatMeter) {
      sym("heatMeter", b, 150, "down", { side: sideOf("down", "left") });
      // Temperature probe of the meter in the supply, wired to the Rechenwerk.
      add(ln(a + 2, 150, b - 20.5, 150, 0.6, "1.5 1.2"), { t: "circle", cx: a, cy: 150, r: 2, fill: "bg", stroke: "ink", sw: 0.7 });
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
        break;
      case "injection3":
        // Einspritzschaltung mit Dreiwegventil: primary valve in the return with its bypass, secondary bypass, pump.
        pipe("vl", [[a, 262], [b - 6, 262]]);
        dot(a, 262, "vl");
        sym("valve3", b, 262, "down", { port: sideOf("down", "left") });
        bypass(222);
        sym("pump", a, 190, "up");
        break;
      case "injection2":
        // Einspritzschaltung mit Durchgangsventil: valve in the primary supply, Regulierventil, secondary bypass, pump.
        sym("valve2", a, 258, "up", { side: sideOf("up", "left") });
        sym("regValve", b, 258, "down");
        bypass(222);
        sym("pump", a, 190, "up");
        break;
    }
  });
  begin(null);
  if (!data.groups.length) text(b0 + 30, 200, labels.noGroups, 7, { anchor: "start", muted: true });
  for (const x of separators) add(ln(x, 8, x, maxY + 10, 0.6, "6 3 1.5 3"));

  const width = Math.max(b1 + 40, 600);
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
    case "well":
      return [ln(13, 2, 13, 29), ln(27, 2, 27, 29), poly([[16, 6], [24, 6], [20, 10]], "none", 0.6), ...drawSymbol("pump", 20, 21, "up")];
    case "floor":
    case "radiator":
    case "register":
    case "apparatus":
      return emitterSymbol(key, 20, 15, 28);
    default: {
      // Pipe symbols on a short pipe: parts beside the pipe hang below it, drives point up.
      const offPipe = key === "thermometer" || key === "sensor" || key === "heatMeter" || key === "expansion";
      const y = key === "expansion" ? 5 : offPipe ? 8 : key === "valve2" || key === "valve3" ? 22 : 15;
      return [{ t: "line", x1: 2, y1: y, x2: 38, y2: y, stroke: "muted", sw: 1 }, ...drawSymbol(key, 20, y, "right", { side: offPipe ? 1 : -1, port: 1 })];
    }
  }
}
