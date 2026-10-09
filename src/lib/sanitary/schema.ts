// Prinzipschema (Strangschema) of a Sanitäranlage, as drawing primitives shared by the web view and the PDF:
//
//   floors (top first) ──────────────────────────────────────────────  Stockwerkverteilungen / Apparategruppen
//                         │ Strang 1   │ Strang 2 …                    right of each Strang, at their storey
//   Verteilleitung ═══════╧════════════╧═══════════                     PWC / PWH / PWH-C as three parallel lines
//   Zentrale: Hausanschluss → Wasserzähler → Filter → Verteilbatterie → Sicherheitsgruppe → Wassererwärmer → pump
//
// Symbols after SVGW W3 Anhang 4 (SN EN 806-1), SIA 410 only where W3 has none; Apparate, Verteiler and
// Verteilbatterie drawn like the LUPI Schemavorlage Sanitär (Berechnungsvorlagen/Sanitär): every Apparat of an
// Apparategruppe stands on its own line from the Verteiler. Colours: PWC green, PWH red, PWH-C orange. The
// Wassererwärmer is neutral, all other parts are Nussbaum (pump Biral). Insulation as highlighter bands behind the
// lines; «Rohr an Rohr» as one band around PWH and PWH-C.

import type { Paint, Prim } from "@/lib/kwl/schema-symbols";
import { floorOrder } from "@/lib/kwl/schema-layout";

import type { Medium, Mount, SanitaryData, SanNode, SystemResult } from "./network";
import { consumerLu } from "./network";
import { insulationStyle, type PipeSize, sizeText } from "./pipes";
import { type ApplianceKey, applianceKeys } from "./w3";

export const mediumColors: Record<Medium, `#${string}`> = { pwc: "#00a651", pwh: "#e3001b", pwhc: "#ff8000" };
/** Offset of each line from the first one (PWC) [units]. */
const OFF: Record<Medium, number> = { pwc: 0, pwh: 14, pwhc: 28 };
/** Distance of the outermost line (PWH-C) from the first one. */
const SPAN = OFF.pwhc;
const MEDIA: Medium[] = ["pwc", "pwh", "pwhc"];

const DX = 96; // Verteilleitung section
const DX2 = 100; // Stockwerkverteilung section
const RH = 110; // row of a Stockwerkverteilung (lines, the Apparate or text block above them, the group text below)
const HEAD = 66; // top of a storey down to its first row
const TEXT_LINE = 9; // line pitch of the Leitung texts
const LEFT = 64; // storey names
const LANE = 56;

export type SchemaText = {
  /**
   * Leitung texts, e.g. «KW: 28 · 40 mm», «Dämmung: Mineralwolle»; «none»: not insulated, «inShared»: PWH-C inside the
   * common insulation «Rohr an Rohr».
   */
  kw: string;
  ww: string;
  zk: string;
  insulation: string;
  material: string;
  none: string;
  inShared: string;
  strang: string;
  heater: string;
  house: string;
  meter: string;
  battery: string;
  softener: string;
  lu: string;
};

export type SymbolKey =
  | "shutoff"
  | "shutoffDrain"
  | "check"
  | "regValve"
  | "regValveThermal"
  | "meter"
  | "filter"
  | "redfil"
  | "reducer"
  | "safety"
  | "pump"
  | "mixer"
  | "softener"
  | "consumer"
  | "battery"
  | "heater"
  | "union"
  | "drain"
  | "manifold"
  | "manifoldConcealed"
  | ApplianceSymbol;

/** Apparate (drawn upright, standing on their connections); Balkon- and Gartenventil share one symbol. */
export type ApplianceSymbol = "wc" | "basin" | "shower" | "bathtub" | "dishwasher" | "washer" | "urinal" | "outlet";
export const applianceSymbol: Record<ApplianceKey, ApplianceSymbol> = {
  wc: "wc",
  basin: "basin",
  dishwasher: "dishwasher",
  washer: "washer",
  balcony: "outlet",
  shower: "shower",
  urinal: "urinal",
  bathtub: "bathtub",
  garden: "outlet",
};
export const applianceSymbols: ApplianceSymbol[] = ["wc", "basin", "shower", "bathtub", "dishwasher", "washer", "urinal", "outlet"];
export const isApplianceSymbol = (key: SymbolKey): key is ApplianceSymbol => (applianceSymbols as SymbolKey[]).includes(key);
/** Width of each Apparat in the row and the x offsets of its connections (warm null: cold water only). */
const APPLIANCE: Record<ApplianceSymbol, { w: number; cold: number; warm: number | null }> = {
  wc: { w: 26, cold: 0, warm: null },
  basin: { w: 38, cold: 6, warm: -6 },
  shower: { w: 42, cold: 6, warm: -6 },
  bathtub: { w: 60, cold: 6, warm: -6 },
  dishwasher: { w: 30, cold: 0, warm: null },
  washer: { w: 30, cold: 0, warm: null },
  urinal: { w: 26, cold: 0, warm: null },
  outlet: { w: 34, cold: 0, warm: null },
};
/** Body of the Apparate: light blue with a blue edge, like the LUPI Schemavorlage. */
const APP_FILL = "#c9f7ff";
const APP_EDGE = "#1f45c8";

export type SchemaBand = { d: string; fill: string; edge: string; width: number; mm: number; shared: boolean };
export type SchemaLine = { d: string; medium: Medium; nodeId: string | null };
export type SchemaGroup = { nodeId: string | null; prims: Prim[] };

export type SanitarySchema = {
  width: number;
  height: number;
  bands: SchemaBand[];
  lines: SchemaLine[];
  groups: SchemaGroup[];
  /** Symbols used (for the legend); whether any line is insulated. */
  used: SymbolKey[];
  insulated: boolean;
};

type Pt = [number, number];
const pathD = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${round(x)},${round(y)}`).join(" ");
const round = (v: number) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------
// Symbols after SVGW W3 Anhang 4 (SN EN 806-1), drawn along a line: horizontal (flow dir ±1) or vertical (upwards)
//   Geradsitz- / Schrägsitzventil (Absperrventil), Auslaufventil / Entleerungsventil, Rückflussverhinderer
//   (kontrollierbar), Zirkulationsregelventil, Wasserzähler, Mechanischer Filter, Druckminderer, Druckminderer mit
//   Filter, Sicherheitsventil federbelastet with Trichter, Flüssigkeitspumpe, Thermostatischer Mischer, Verschraubung,
//   Apparate- und Armaturenanschluss mit Absperrung, Standmisch- / Wandmischbatterie, Brause, Selbstschlussarmatur,
//   Auslaufventil mit Sicherungsarmatur und Schlauchverschraubung.
// Not in W3, after SIA 410: Apparat ohne rotierende Teile (1.27.1, Enthärtung), Wassererwärmer (5.1.19), the arrow
// of adjustability on the Regulierventil von Hand (W3 Absperrventil + SIA 410). The Apparate bodies (Waschtisch, WC,
// Wanne …), the Verteiler and the Verteilbatterie follow the LUPI Schemavorlage Sanitär.
// ---------------------------------------------------------------------------

/** Maps local coordinates (u along the line, v across) to the sheet. */
function frame(x: number, y: number, vertical: boolean, dir = 1) {
  return (u: number, v: number): Pt => (vertical ? [x + v, y - u * dir] : [x + u * dir, y + v]);
}
const pts = (list: Pt[]) => list.map(([a, b]) => `${round(a)},${round(b)}`).join(" ");

/**
 * One symbol at (x, y). Apparate are drawn upright: (x, y) is the floor under them, their connections sit just
 * above it (applianceSlot).
 */
export function drawSymbol(key: SymbolKey, x: number, y: number, vertical = false, dir = 1, color: Paint = "ink"): Prim[] {
  if (isApplianceSymbol(key)) {
    vertical = false;
    dir = 1;
  }
  const f = frame(x, y, vertical, dir);
  // Side for parts off the line: above a horizontal line, right of a vertical one (clear of the line next to it).
  const a = vertical ? 1 : -1;
  const poly = (list: Pt[], fill: Paint = "bg", sw = 1, stroke: Paint = "ink"): Prim => ({ t: "polygon", points: pts(list.map(([u, v]) => f(u, v))), fill, stroke, sw });
  const line = (u1: number, v1: number, u2: number, v2: number, sw = 1, stroke: Paint = "ink"): Prim => {
    const [x1, y1] = f(u1, v1);
    const [x2, y2] = f(u2, v2);
    return { t: "line", x1, y1, x2, y2, stroke, sw };
  };
  const rect = (u: number, v: number, w: number, h: number, fill: Paint = "bg", stroke: Paint = "ink", sw = 1): Prim => {
    const [ax, ay] = f(u, v);
    const [bx, by] = f(u + w, v + h);
    return { t: "rect", x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay), fill, stroke, sw };
  };
  const dot = (u: number, v: number, r: number): Prim => {
    const [cx, cy] = f(u, v);
    return { t: "circle", cx, cy, r, fill: "ink" };
  };
  const ring = (u: number, v: number, r: number, stroke: Paint = "ink"): Prim => {
    const [cx, cy] = f(u, v);
    return { t: "circle", cx, cy, r, fill: "bg", stroke, sw: 1 };
  };
  const text = (u: number, v: number, s: string, size = 6, fill: Paint = "ink"): Prim => {
    const [tx, ty] = f(u, v);
    return { t: "text", x: tx, y: ty + size * 0.35, text: s, size, anchor: "middle", fill, bold: true };
  };
  const dashed = (u1: number, v1: number, u2: number, v2: number): Prim => ({ ...line(u1, v1, u2, v2, 0.8), dash: "2 1.5" }) as Prim;
  /** Filled arrow head with its tip at (u, v), pointing along +u (back = −1: along −u). */
  const head = (u: number, v: number, size = 3.2, back = 1) => poly([[u, v], [u - size * back, v - size * 0.6], [u - size * back, v + size * 0.6]], "ink", 0.4);
  /** Filled arrow head with its tip at (u, v), pointing along +v. */
  const headDown = (u: number, v: number, size = 3.2) => poly([[u, v], [u - size * 0.6, v - size], [u + size * 0.6, v - size]], "ink", 0.4);
  // Absperrarmatur: two triangles tip to tip around u0.
  const bowtie = (u0 = 0, w = 7, h = 5) => [poly([[u0 - w, -h], [u0, 0], [u0 - w, h]]), poly([[u0 + w, -h], [u0, 0], [u0 + w, h]])];
  // Geradsitz- / Schrägsitzventil: Absperrarmatur with the dot of the seat.
  const valve = () => [...bowtie(), dot(0, 0, 1.7)];
  // Druckminderer: the arrow «p» pointing down onto the valve at its upper right (off-line side).
  const pressure = () => [line(6, 12 * a, 6, 7 * a, 0.8), poly([[6, 5 * a], [4.6, 7.5 * a], [7.4, 7.5 * a]], "ink", 0.4), text(10, 9.5 * a, "p", 4.5)];
  // Apparate- und Armaturenanschluss mit Absperrung: circle, lower half filled in the colour of the water.
  const tap = (u: number, fill: Paint): Prim[] => {
    const [cx, cy] = f(u, -4);
    return [
      { t: "circle", cx, cy, r: 3, fill: "bg", stroke: "ink", sw: 0.9 },
      { t: "path", d: `M${cx - 3},${cy} A3,3 0 0 0 ${cx + 3},${cy} Z`, fill },
    ];
  };
  const taps = (k: ApplianceSymbol) => [...tap(APPLIANCE[k].cold, "#00a651"), ...(APPLIANCE[k].warm !== null ? tap(APPLIANCE[k].warm!, "#e3001b") : [])];
  const body = (list: Pt[]) => poly(list, APP_FILL, 1.2, APP_EDGE);
  // Wandmischbatterie: the bracket to the wall, the outlet arrow.
  const wallMixer = (u: number, v: number) => [line(u - 3, v - 4, u, v - 4, 0.9), line(u, v - 4, u, v + 4, 0.9), line(u - 3, v + 4, u, v + 4, 0.9), line(u, v, u + 5, v, 0.9), head(u + 8, v)];
  // Brause on its hose / rod from (u, v0) up to v1, the head pointing down.
  const brause = (u: number, v0: number, v1: number) => [
    line(u, v0, u, v1, 0.9),
    line(u, v1, u + 7, v1, 0.9),
    line(u + 7, v1, u + 7, v1 + 3, 0.9),
    line(u + 7, v1 + 3, u + 4, v1 + 6, 0.9),
    line(u + 7, v1 + 3, u + 10, v1 + 6, 0.9),
  ];
  switch (key) {
    case "shutoff":
      return valve();
    case "shutoffDrain":
      // Absperrventil with an Entleerungsventil (Auslaufventil) on a short branch, draining against the flow.
      return [...valve(), line(0, 0, 0, 7 * a, 0.8), line(0, 7 * a, -4, 7 * a, 0.8), head(-8, 7 * a, 3.2, -1)];
    case "drain":
      // Entleerung: Absperrventil, then the Auslaufventil (arrow) at the end of the line.
      return [...valve(), line(7, 0, 11, 0, 0.9), head(15, 0)];
    case "check":
      // Rückflussverhinderer kontrollierbar: filled triangle in the flow direction against a bar, test stub.
      return [poly([[-4.5, -4.5], [3.5, 0], [-4.5, 4.5]], "ink", 0.5), line(3.5, -4.5, 3.5, 4.5, 1.1), line(-1, -2 * a, -1, -7 * a, 0.9)];
    case "regValve":
      // Regulierventil von Hand: Absperrventil (W3) with the arrow of adjustability (SIA 410) across it.
      return [...valve(), line(-6, -7 * a, 4, 6 * a, 0.8), poly([[6, 8.5 * a], [2.4, 6.8 * a], [5, 4.6 * a]], "ink", 0.4)];
    case "regValveThermal":
      // Zirkulationsregelventil: Absperrarmatur with the filled triangle on it.
      return [...bowtie(), poly([[-5, 9 * a], [5, 9 * a], [0, 0]], "ink", 0.6)];
    case "meter":
      // Wasserzähler.
      return [rect(-7, -7, 14, 14), line(-7, -3, 7, -3, 0.7), text(0, 2, "m³", 4.8)];
    case "filter":
      // Mechanischer Filter.
      return [rect(-6, -8, 12, 16), dashed(0, -6.5, 0, 6.5)];
    case "reducer":
      // Druckminderer.
      return [...bowtie(), ...pressure()];
    case "redfil":
      // Redfil: Druckminderer mit Filter, the filter below the valve.
      return [rect(-7, 0, 14, -a * 18), dashed(0, -a * 6, 0, -a * 16), ...bowtie(), ...pressure()];
    case "safety":
      // Sicherheitsventil federbelastet (angle valve, spring on top) on a branch, blowing off into a Trichter.
      return [
        line(0, 0, 0, 6 * a),
        poly([[-4, 6 * a], [4, 6 * a], [0, 12 * a]]),
        poly([[6, 8 * a], [6, 16 * a], [0, 12 * a]]),
        line(0, 12 * a, 0, 15 * a, 0.8),
        line(0, 15 * a, 2.5, 16.5 * a, 0.8),
        line(2.5, 16.5 * a, -2.5, 18.5 * a, 0.8),
        line(-2.5, 18.5 * a, 2.5, 20.5 * a, 0.8),
        line(6, 12 * a, 11, 12 * a, 0.8),
        line(11, 12 * a, 11, 4 * a, 0.8),
        line(11, 7 * a, 8, 10 * a, 0.8),
        line(11, 7 * a, 14, 10 * a, 0.8),
      ];
    case "pump":
      // Flüssigkeitspumpe: circle, the two lines meeting at its edge in the flow direction.
      return [ring(0, 0, 8), line(0, -8, 8, 0), line(0, 8, 8, 0)];
    case "mixer":
      // Thermostatischer Mischer.
      return [dot(0, 0, 5)];
    case "softener":
      // SIA 410 1.27.1 Apparat ohne rotierende Teile, with its designation.
      return [rect(-9, -9, 18, 18), text(0, 0, "E", 8)];
    case "union":
      // Verschraubung.
      return [line(-1.5, -3, -1.5, 3, 1), line(1, -4.5, 1, 4.5, 1), line(2.6, -4.5, 2.6, 4.5, 1)];
    case "consumer": {
      // Apparate- und Armaturenanschluss mit Absperrung.
      const [cx, cy] = f(0, 0);
      return [
        { t: "circle", cx, cy, r: 4.5, fill: "bg", stroke: "ink", sw: 1 },
        { t: "path", d: `M${cx - 4.5},${cy} A4.5,4.5 0 0 0 ${cx + 4.5},${cy} Z`, fill: color },
      ];
    }
    case "manifold":
    case "manifoldConcealed":
      // Verteiler with one outlet per Apparat (legend: three outlets on one line).
      return manifoldPrims(x - manifoldWidth(3) / 2, y, y, 3, 0, key === "manifoldConcealed");
    case "battery":
      // Verteilbatterie: the collector with its Abgänge.
      return [line(-6, 0, -6, -9), line(4, 0, 4, -9), rect(-12, -3, 24, 6)];
    case "heater":
      // SIA 410 5.1.19 Wassererwärmer (Ansicht), with its insulation jacket like the Schemavorlage.
      return [rect(-10, -13, 20, 26, "#e6e6e6"), rect(-7, -10, 14, 23, "#ffd6c9"), text(0, 2, "WE", 5.5, "#111111")];
    case "wc":
      // WC with Unterputz-Spülkasten (dashed: concealed).
      return [
        { t: "path", d: `M${x - 9},${y - 16} V${y - 36} H${x + 9} V${y - 16} Z`, fill: APP_FILL, stroke: APP_EDGE, sw: 1.2, dash: "4 2.5" },
        body([[-9, -16], [9, -16], [0, -8]]),
        ...taps(key),
      ];
    case "basin":
      // Waschtisch with Standmischbatterie.
      return [
        body([[-17, -28], [17, -28], [4, -15], [-4, -15]]),
        rect(-1.8, -15, 3.6, 5, APP_FILL, APP_EDGE, 1),
        line(0, -30, 0, -38, 0.9),
        dot(0, -30, 1.3),
        dot(0, -38, 1.3),
        line(0, -34, 5, -34, 0.9),
        head(8, -34),
        ...taps(key),
      ];
    case "shower":
      // Dusche: tray, Wandmischbatterie and Brause.
      return [rect(-19, -14, 38, 5, APP_FILL, APP_EDGE, 1.2), ...wallMixer(-6, -24), ...brause(-6, -28, -48), ...taps(key)];
    case "bathtub":
      // Badewanne with Wandmischbatterie and Brause.
      return [body([[-29, -28], [27, -28], [27, -10], [-19, -10]]), ...wallMixer(10, -34), ...brause(10, -38, -50), ...taps(key)];
    case "dishwasher":
      return [rect(-12, -35, 24, 25, APP_FILL, APP_EDGE, 1.2), text(0, -22.5, "GS", 6.5, APP_EDGE), ...taps(key)];
    case "washer":
      // Waschautomat: casing and drum.
      return [rect(-12, -35, 24, 25, APP_FILL, APP_EDGE, 1.2), ring(0, -22.5, 7, APP_EDGE), line(-2.5, -25, 3.5, -19, 0.8, APP_EDGE), ...taps(key)];
    case "urinal":
      // Urinoir with Selbstschlussarmatur «SC».
      return [body([[-8, -34], [8, -34], [8, -18], [0, -11], [-8, -18]]), line(-4, -38, 2, -38, 0.9), head(6, -38), text(1, -43.5, "SC", 4.2), ...taps(key)];
    case "outlet": {
      // Balkon- / Gartenventil: Wandauslaufventil, Sicherungsarmatur, Schlauchverschraubung and hose.
      const hex: Pt[] = [0, 1, 2, 3, 4, 5].map((i) => [13.5 + 3.6 * Math.cos((Math.PI / 3) * i), -6 + 3.6 * Math.sin((Math.PI / 3) * i)]);
      return [
        line(0, -7, 0, -24, 0.9),
        line(0, -24, 6, -24, 0.9),
        head(9.5, -24),
        line(13.5, -21, 13.5, -13, 0.8),
        headDown(13.5, -9.6),
        poly(hex),
        dot(13.5, -6, 0.9),
        { t: "path", d: `M${x + 13.5},${y - 2.4} q2,1.5 0,3 q-2,1.5 0,3`, fill: "none", stroke: "ink", sw: 0.8 },
        ...taps(key),
      ];
    }
  }
}

/**
 * Verteiler (Flowpress) of an Apparategruppe: a box over the PWC and PWH lines (y of each) with one outlet dot per
 * Apparat; `concealed`: inside an Unterputz-Verteilerkasten (frame with the cover strip and its screws).
 */
function manifoldPrims(x: number, yC: number, yH: number, cold: number, warm: number, concealed: boolean): Prim[] {
  const w = manifoldWidth(Math.max(cold, warm, 1));
  const top = Math.min(yC, yH) - 6;
  const h = Math.abs(yH - yC) + 12;
  const out: Prim[] = concealed ? concealedBox(x - 4, top - 9, w + 8, h + 13) : [];
  out.push({ t: "rect", x, y: top, w, h, fill: "bg", stroke: "ink", sw: 1 });
  for (let i = 0; i < cold; i++) out.push({ t: "circle", cx: x + 5 + i * 6, cy: yC, r: 2, fill: "#00a651" });
  for (let i = 0; i < warm; i++) out.push({ t: "circle", cx: x + 5 + i * 6, cy: yH, r: 2, fill: "#e3001b" });
  return out;
}
const manifoldWidth = (slots: number) => 4 + slots * 6;

/** Unterputz-Verteilerkasten (Vorwand): frame with the cover strip and its two screws. */
function concealedBox(x: number, y: number, w: number, h: number): Prim[] {
  return [
    { t: "rect", x, y, w, h, fill: "none", stroke: "ink", sw: 1.3 },
    { t: "line", x1: x, y1: y + 5, x2: x + w, y2: y + 5, stroke: "ink", sw: 0.8 },
    { t: "circle", cx: x + 4, cy: y + 2.5, r: 0.9, fill: "ink" },
    { t: "circle", cx: x + w - 4, cy: y + 2.5, r: 0.9, fill: "ink" },
  ];
}

// ---------------------------------------------------------------------------
// Apparategruppe: Verteiler, then every Apparat on its own line
// ---------------------------------------------------------------------------

/** Apparate drawn per group; more are written as «+ n». */
const MAX_APPLIANCES = 16;
const APP_GAP = 12; // Verteiler to the first Apparat

/** The Apparate of a group one by one, in the order of W3 Tabelle 3. */
function applianceRow(n: SanNode) {
  const all = applianceKeys.flatMap((k) => Array.from({ length: n.appliances[k] ?? 0 }, () => applianceSymbol[k]));
  const items = all.slice(0, MAX_APPLIANCES);
  return { items, more: all.length - items.length, cold: items.length, warm: items.filter((k) => APPLIANCE[k].warm !== null).length };
}

/** Width of an Apparategruppe from its Verteiler to the end of the last Apparat (at least its text below). */
function consumerWidth(n: SanNode): number {
  const row = applianceRow(n);
  const apps = row.items.reduce((s, k) => s + APPLIANCE[k].w, 0) + (row.more ? 24 : 0);
  return Math.max(110, manifoldWidth(Math.max(row.cold, row.warm, 1)) + APP_GAP + apps + 10);
}

/** Right edge of a hanging element (relative to its column) at depth d whose lines start at `start`. */
function extent(n: SanNode, d: number, start: number): number {
  if (n.type === "consumer") return Math.max(start + 16, 44) + consumerWidth(n);
  const end = 30 + (d + 1) * DX2;
  return n.children.reduce((r, c, i) => Math.max(r, extent(c, d + 1, i ? end + SPAN : end)), end + SPAN);
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

type Hang = { node: SanNode; floor: string; rows: number; depth: number; anchor: number };
/** Where a line leaves the line before it; `continues`: that line goes on past this branch (T-junction). */
type From = { x: number; lane: number; continues: boolean };
type Column = { x: number; lane: number; from: From; chain: SanNode[]; hangs: Hang[]; width: number };
type Seg = { node: SanNode; lane: number; x0: number; x1: number; drop: boolean; from: From };

const fmt1 = (v: number) => (Math.round(v * 10) / 10).toString().replace(".", ",");

export function layoutSchema(data: SanitaryData, result: SystemResult, labels: SchemaText): SanitarySchema {
  const groups: SchemaGroup[] = [];
  const lines: SchemaLine[] = [];
  const bands: SchemaBand[] = [];
  const used = new Set<SymbolKey>();
  const group = (nodeId: string | null, prims: Prim[]) => prims.length && groups.push({ nodeId, prims });
  const symbol = (nodeId: string | null, key: SymbolKey, x: number, y: number, vertical = false, dir = 1) => {
    used.add(key);
    group(nodeId, drawSymbol(key, x, y, vertical, dir));
  };
  const label = (nodeId: string | null, x: number, y: number, s: string, size = 7, opts: { anchor?: "start" | "middle" | "end"; muted?: boolean; bold?: boolean } = {}) =>
    s && group(nodeId, [{ t: "text", x, y, text: s, size, anchor: opts.anchor ?? "start", fill: opts.muted ? "muted" : "ink", bold: opts.bold }]);
  const dot = (x: number, y: number, m: Medium) => group(null, [{ t: "circle", cx: x, cy: y, r: 2.4, fill: mediumColors[m] }]);

  const res = (n: SanNode) => result.pipes.get(n.id);
  const circulated = (n: SanNode) => !!res(n)?.circ;
  const carries = (n: SanNode, m: Medium) => {
    if (n.type === "consumer") {
      const lu = consumerLu(n.appliances);
      return m === "pwc" ? lu.cold > 0 : m === "pwh" ? lu.warm > 0 : false;
    }
    return m === "pwhc" ? circulated(n) : n[m];
  };
  const isDist = (n: SanNode) => n.type === "pipe" && !n.riser && res(n)?.role === "distribution";
  const floorOf = (n: SanNode): string => {
    if (n.floor) return n.floor;
    for (const c of n.children) {
      const f = floorOf(c);
      if (f) return f;
    }
    return "";
  };
  const leaves = (n: SanNode): number => (n.children.length ? n.children.reduce((s, c) => s + leaves(c), 0) : 1);
  const depth = (n: SanNode): number => (n.children.length ? 1 + Math.max(...n.children.map(depth)) : 0);

  // --- Pass A: x positions, lanes, columns --------------------------------------------------------------------
  const zentrale = centralGeometry(data, result);
  const X0 = zentrale.x0;
  let cursor = X0;
  let lanes = 0;
  const columns: Column[] = [];
  const segs: Seg[] = [];

  const makeColumn = (n: SanNode, from: From) => {
    const chain: SanNode[] = [];
    const hangs: Hang[] = [];
    const hang = (h: SanNode, anchor: number, floorFallback: string) =>
      hangs.push({ node: h, floor: floorOf(h) || floorFallback, rows: leaves(h), depth: depth(h), anchor });
    if (n.type === "pipe" && n.riser) {
      // The Strang goes on with its first riser child; everything else hangs at that section's storey.
      let cur: SanNode | undefined = n;
      while (cur) {
        chain.push(cur);
        const idx = chain.length - 1;
        const section: SanNode = cur;
        const next = section.children.find((c) => c.type === "pipe" && c.riser);
        section.children.filter((c) => c !== next).forEach((c) => hang(c, idx, section.floor));
        cur = next;
      }
    } else hang(n, -1, "");
    const width = Math.max(130, ...hangs.map((h) => 40 + extent(h.node, 0, SPAN)));
    columns.push({ x: cursor, lane: from.lane, from, chain, hangs, width });
    cursor += width;
  };

  const placeChildren = (kids: SanNode[], from: { x: number; lane: number }) => {
    // Columns first (at the branch point and to its right), then the Verteilleitungen: all but the last drop to a
    // lane of their own, the last one goes on along this lane.
    const cols = kids.filter((k) => !isDist(k));
    const dist = kids.filter(isDist);
    cols.forEach((k, i) => makeColumn(k, { ...from, continues: i < cols.length - 1 || dist.length > 0 }));
    dist.forEach((k, i) => {
      const last = i === dist.length - 1;
      const lane = last ? from.lane : ++lanes;
      const x1 = cursor + DX;
      segs.push({ node: k, lane, x0: from.x, x1, drop: !last, from: { ...from, continues: true } });
      cursor = x1;
      placeChildren(k.children, { x: x1, lane });
    });
  };
  placeChildren(data.network, { x: X0, lane: 0 });

  // --- Floors -------------------------------------------------------------------------------------------------
  const floorNames = [...new Set(columns.flatMap((c) => [...c.hangs.map((h) => h.floor), ...c.chain.map((s) => s.floor)]))].sort(
    (a, b) => (a === "" ? 1 : b === "" ? -1 : floorOrder(a) - floorOrder(b)),
  );
  // Rows of each column per storey, stacked in the order of the hangs.
  const rowIndex = new Map<Hang, number>();
  const rowsAt = new Map<string, number>();
  for (const c of columns) {
    const count = new Map<string, number>();
    for (const h of c.hangs) {
      const i = count.get(h.floor) ?? 0;
      rowIndex.set(h, i);
      count.set(h.floor, i + h.rows);
    }
    for (const [f, n] of count) rowsAt.set(f, Math.max(rowsAt.get(f) ?? 0, n));
  }
  const floorY = new Map<string, { y0: number; y1: number; row: number }>();
  let y = 36;
  for (const f of floorNames) {
    const h = HEAD + Math.max(1, rowsAt.get(f) ?? 1) * RH;
    floorY.set(f, { y0: y, y1: y + h, row: y + HEAD });
    y += h;
  }
  const floorsBottom = y;
  const lane0 = floorsBottom + 172;
  const laneY = (lane: number) => lane0 + lane * LANE;
  const width = Math.max(cursor + 30, X0 + 200);
  const height = Math.max(lane0 + zentrale.height + 24, laneY(lanes) + 60);

  // Storeys: slab line below each band, name on the left.
  for (const f of floorNames) {
    const band = floorY.get(f)!;
    group(null, [
      { t: "line", x1: LEFT - 50, y1: band.y1, x2: width - 10, y2: band.y1, stroke: "muted", sw: 0.5, dash: "6 4" },
      { t: "text", x: LEFT - 48, y: band.y0 + 16, text: f || "–", size: 10, fill: "muted", bold: true },
    ]);
  }

  // Line of one medium through points; insulation band behind it.
  const draw = (nodeId: string | null, m: Medium, points: Pt[]) => lines.push({ d: pathD(points), medium: m, nodeId });
  const band = (points: Pt[], mm: number | null, shared: boolean) => {
    if (!mm) return;
    const style = insulationStyle;
    bands.push({ d: pathD(points), fill: style.fill, edge: style.edge, width: shared ? 24 : 10, mm, shared });
  };
  const bandsOf = (n: SanNode, paths: Partial<Record<Medium, Pt[]>>) => {
    const r = res(n);
    if (!r) return;
    if (paths.pwc) band(paths.pwc, r.insulation.pwc, false);
    if (paths.pwh) band(paths.pwh, r.insulation.pwh, false);
    if (paths.pwhc) band(paths.pwhc, r.insulation.pwhc, false);
    if (r.insulation.shared && paths.pwh && paths.pwhc && paths.pwh.length === paths.pwhc.length) {
      band(paths.pwh.map(([x1, y1], i) => [(x1 + paths.pwhc![i][0]) / 2, (y1 + paths.pwhc![i][1]) / 2]), r.insulation.shared.mm, true);
    }
  };
  /** Text of a Leitung: diameter and insulation of each line, then the insulation material. */
  const lineText = (n: SanNode): string[] => {
    const r = res(n);
    if (!r) return [];
    const mm = (v: number | null | undefined) => (v ? `${v} mm` : labels.none);
    const shared = r.insulation.shared;
    const out: string[] = [];
    if (r.pwc) out.push(`${labels.kw}: ${sizeText(r.pwc.size)} · ${mm(r.insulation.pwc)}`);
    if (r.pwh) out.push(`${labels.ww}: ${sizeText(r.pwh.size)} · ${mm(shared ? shared.mm : r.insulation.pwh)}`);
    if (r.pwhc) out.push(`${labels.zk}: ${sizeText(r.pwhc.size)} · ${shared ? labels.inShared : mm(r.insulation.pwhc)}`);
    if (r.insulation.pwc || r.insulation.pwh || r.insulation.pwhc || shared) out.push(`${labels.insulation}: ${labels.material}`);
    return out;
  };
  /** Text block whose last line sits at yBottom (lines going upwards); the first line bold when `title` is set. */
  const textBlock = (nodeId: string, x: number, yBottom: number, lines: string[], anchor: "start" | "middle" | "end", title = false) =>
    lines.forEach((l, i) =>
      label(nodeId, x, yBottom - (lines.length - 1 - i) * TEXT_LINE, l, i === 0 && title ? 7.5 : 7, { anchor, muted: !(i === 0 && title), bold: i === 0 && title }),
    );
  const circuitEnds = new Set(result.circuits.map((c) => c.endId));

  /** End of a circuit on a horizontal line: the PWH-C joins the PWH. */
  const circulationEnd = (n: SanNode, x: number, yRow: number) => {
    group(n.id, [{ t: "line", x1: x, y1: yRow + OFF.pwhc, x2: x, y2: yRow + OFF.pwh, stroke: mediumColors.pwhc, sw: 1.6 }]);
    dot(x, yRow + OFF.pwh, "pwhc");
  };

  // --- Verteilleitung ------------------------------------------------------------------------------------------
  for (const s of segs) {
    const yL = laneY(s.lane);
    const yFrom = laneY(s.from.lane);
    const paths: Partial<Record<Medium, Pt[]>> = {};
    for (const m of MEDIA) {
      if (!carries(s.node, m)) continue;
      // Drop to a new lane: the lines turn down in reverse order so they do not cross each other.
      const pts: Pt[] = s.drop
        ? [[s.x0, yFrom + OFF[m]], [s.x0 + SPAN - OFF[m], yFrom + OFF[m]], [s.x0 + SPAN - OFF[m], yL + OFF[m]], [s.x1, yL + OFF[m]]]
        : [[s.x0, yL + OFF[m]], [s.x1, yL + OFF[m]]];
      paths[m] = pts;
      draw(s.node.id, m, pts);
      if (s.drop) dot(s.x0 + SPAN - OFF[m], yFrom + OFF[m], m);
    }
    bandsOf(s.node, paths);
    const mid = s.x1 - DX / 2;
    const title = [s.node.label, s.node.length ? `${fmt1(s.node.length)} m` : ""].filter(Boolean).join(" · ");
    textBlock(s.node.id, mid, yL - 11, [...(title ? [title] : []), ...lineText(s.node)], "middle", !!title);
    if (s.node.shutoff) for (const m of ["pwc", "pwh"] as const) if (carries(s.node, m)) symbol(s.node.id, "shutoff", s.x1 - DX + 18, yL + OFF[m]);
    if (circuitEnds.has(s.node.id)) circulationEnd(s.node, s.x1, yL);
  }

  // --- Columns (Stränge and Stockwerkverteilungen) -----------------------------------------------------------
  for (const c of columns) {
    const yL = laneY(c.lane);
    const yFrom = laneY(c.from.lane);
    const hangY = (h: Hang) => floorY.get(h.floor)!.row + (rowIndex.get(h) ?? 0) * RH;
    const mediaOf = (n: SanNode) => MEDIA.filter((m) => carries(n, m));
    /** Turn up from the Verteilleitung at the column (no dot at a plain corner). */
    const riseFrom = (m: Medium): Pt[] => [[c.from.x, yFrom + OFF[m]], [c.x + OFF[m], yFrom + OFF[m]]];

    /**
     * A Stockwerkverteilung / Apparategruppe to the right of the column: pipes as horizontal sections, further
     * children branching down from the end of their pipe, consumers as outlet markers with their text.
     * `start(m)`: x where each line begins. Returns the rows used.
     */
    const placeHang = (n: SanNode, d: number, start: (m: Medium) => number, yRow: number, mount: Mount): number => {
      const endX = c.x + 30 + (d + 1) * DX2;
      if (n.type === "consumer") {
        // Apparategruppe: Verteiler (open or in its Unterputzkasten like the Stockwerkverteilung), then every
        // Apparat on its own PWC / PWH line, the lines turning up to the Apparat (no junction: separate lines).
        const row = applianceRow(n);
        const xM = Math.max(start("pwc") + 16, c.x + 44);
        const wM = manifoldWidth(Math.max(row.cold, row.warm, 1));
        const y = { pwc: yRow + OFF.pwc, pwh: yRow + OFF.pwh };
        for (const m of ["pwc", "pwh"] as const) if (carries(n, m)) draw(n.id, m, [[start(m), y[m]], [xM, y[m]]]);
        const yF = yRow - 8;
        const last: Partial<Record<"pwc" | "pwh", number>> = {};
        let x = xM + wM + APP_GAP;
        for (const k of row.items) {
          const g = APPLIANCE[k];
          const cx = x + g.w / 2;
          const riser = (m: "pwc" | "pwh", tx: number) => {
            draw(n.id, m, [[tx, y[m]], [tx, yF - 1]]);
            last[m] = tx;
          };
          riser("pwc", cx + g.cold);
          if (g.warm !== null) riser("pwh", cx + g.warm);
          used.add(k);
          group(n.id, drawSymbol(k, cx, yF));
          x += g.w;
        }
        for (const m of ["pwc", "pwh"] as const) if (last[m] !== undefined) draw(n.id, m, [[xM + wM, y[m]], [last[m]!, y[m]]]);
        const concealed = mount === "concealed";
        used.add(concealed ? "manifoldConcealed" : "manifold");
        group(n.id, manifoldPrims(xM, y.pwc, y.pwh, row.cold, row.warm, concealed));
        if (row.more) label(n.id, x + 4, yRow - 18, `+ ${row.more}`, 8, { bold: true });
        const lu = consumerLu(n.appliances);
        label(n.id, xM, y.pwh + 19, n.label || "–", 8);
        label(n.id, xM, y.pwh + 28, `${lu.cold} / ${lu.warm} ${labels.lu}`, 7, { muted: true });
        return 1;
      }
      const paths: Partial<Record<Medium, Pt[]>> = {};
      for (const m of mediaOf(n)) {
        paths[m] = [[start(m), yRow + OFF[m]], [endX, yRow + OFF[m]]];
        draw(n.id, m, paths[m]!);
      }
      bandsOf(n, paths);
      // Wohnungsverteiler: Absperrventile and Wohnungswasserzähler side by side on PWC and PWH, in a common box
      // (open, or the Unterputzkasten) like the Schemavorlage.
      const x0 = start("pwhc") + 16;
      const sx = x0 + 8;
      const mx = n.shutoff ? x0 + 28 : x0 + 10;
      const meters = (["pwc", "pwh"] as const).filter((m) => carries(n, m));
      if (n.shutoff) meters.forEach((m) => symbol(n.id, "shutoff", sx, yRow + OFF[m]));
      if (n.meter) {
        meters.forEach((m) => symbol(n.id, "meter", mx, yRow + OFF[m]));
        const bx = x0 - 2;
        const bw = mx + 10 - bx;
        group(n.id, n.mount === "concealed" ? concealedBox(bx - 2, yRow - 17, bw + 4, OFF.pwh + 29) : [{ t: "rect", x: bx, y: yRow - 10, w: bw, h: OFF.pwh + 20, fill: "none", stroke: "ink", sw: 1 }]);
      }
      const title = [n.label, n.length ? `${fmt1(n.length)} m` : ""].filter(Boolean).join(" · ");
      // Above the lines, clear of the Wohnungsverteiler box on them.
      textBlock(n.id, endX - 4, yRow - (n.meter ? (n.mount === "concealed" ? 21 : 14) : 10), [...(title ? [title] : []), ...lineText(n)], "end");
      if (circuitEnds.has(n.id)) circulationEnd(n, endX, yRow);
      let rows = 0;
      n.children.forEach((child, i) => {
        const cy = yRow + rows * RH;
        if (i === 0) {
          rows += placeHang(child, d + 1, () => endX, cy, n.mount);
          return;
        }
        // Branch down from the end of this pipe, the lines turning in reverse order (like the Verteilleitung).
        const bx = (m: Medium) => endX + SPAN - OFF[m];
        for (const m of mediaOf(child)) {
          if (!carries(n, m)) continue;
          draw(child.id, m, [[endX, yRow + OFF[m]], [bx(m), yRow + OFF[m]]]);
          if (carries(n.children[0], m)) dot(bx(m), yRow + OFF[m], m);
        }
        rows += placeHang(child, d + 1, bx, cy, n.mount);
        // The vertical part of the branch, drawn after the child knows its row.
        for (const m of mediaOf(child)) if (carries(n, m)) draw(child.id, m, [[bx(m), yRow + OFF[m]], [bx(m), cy + OFF[m]]]);
      });
      return Math.max(1, rows);
    };

    if (c.chain.length) {
      // Section tops: the highest row hanging at it or its storey, never below the section before.
      const tops: number[] = [];
      c.chain.forEach((s, i) => {
        const own = c.hangs.filter((h) => h.anchor === i).map(hangY);
        const storey = s.floor && floorY.get(s.floor) ? floorY.get(s.floor)!.row : null;
        const candidates = [...own, ...(storey !== null ? [storey] : [])];
        const prev = i ? tops[i - 1] : yL - 150;
        tops.push(Math.min(prev, candidates.length ? Math.min(...candidates) : prev - 30));
      });
      const foot = c.chain[0];
      c.chain.forEach((s, i) => {
        const y1 = tops[i];
        const paths: Partial<Record<Medium, Pt[]>> = {};
        for (const m of mediaOf(s)) {
          const x = c.x + OFF[m];
          const pts: Pt[] = i ? [[x, tops[i - 1] + OFF[m]], [x, y1 + OFF[m]]] : [...riseFrom(m), [x, y1 + OFF[m]]];
          paths[m] = pts;
          draw(s.id, m, pts);
          if (!i && c.from.continues) dot(x, yFrom + OFF[m], m);
        }
        bandsOf(s, paths);
        // Section text left of the Strang, below the storey it leads to and above the slab under it (for the foot:
        // above the valves).
        const title = [i ? s.label : "", s.length ? `${fmt1(s.length)} m` : ""].filter(Boolean).join(" · ");
        const lower = i ? tops[i - 1] : yL - 140;
        textBlock(s.id, c.x - 8, Math.min(lower - 10, y1 + RH - 8), [...(title ? [title] : []), ...lineText(s)], "end");
        if (circuitEnds.has(s.id)) {
          group(s.id, [{ t: "line", x1: c.x + OFF.pwhc, y1: y1 + OFF.pwhc, x2: c.x + OFF.pwh, y2: y1 + OFF.pwhc, stroke: mediumColors.pwhc, sw: 1.6 }]);
          dot(c.x + OFF.pwh, y1 + OFF.pwhc, "pwhc");
        }
      });
      // Foot of the Strang: Absperrventile mit Entleerung, Rückflussverhinderer and Regulierventil on the PWH-C.
      const fr = res(foot);
      // Optiflex-Flowpress lines: Schrägsitzventil without Entleerung (Flowpress has none with it).
      for (const m of mediaOf(foot)) symbol(foot.id, fr?.[m]?.size.system === "optiflex" ? "shutoff" : "shutoffDrain", c.x + OFF[m], yL - 28 - OFF[m] * 1.5, true);
      if (fr?.pwhc) {
        symbol(foot.id, "check", c.x + OFF.pwhc, yL - 96, true, -1);
        symbol(foot.id, foot.regValve === "manual" ? "regValve" : "regValveThermal", c.x + OFF.pwhc, yL - 122, true, -1);
        label(foot.id, c.x + SPAN + 16, yL - 118, foot.regValve === "manual" ? "24026" : "36030", 6.5, { muted: true });
      }
      label(foot.id, c.x + 10, tops[tops.length - 1] - 14, foot.label || `${labels.strang} ${fr?.strang ?? ""}`, 8.5, { anchor: "middle", bold: true });

      const colTop = Math.min(...c.hangs.map(hangY), tops[tops.length - 1]);
      for (const h of c.hangs) {
        const yRow = hangY(h);
        // T-junction on the Strang unless the Strang ends in this row.
        for (const m of mediaOf(h.node)) if (yRow > colTop) dot(c.x + OFF[m], yRow + OFF[m], m);
        placeHang(h.node, 0, (m) => c.x + OFF[m], yRow, c.chain[h.anchor]?.mount ?? "surface");
      }
    } else {
      // Column without Strang: the group rises from the Verteilleitung straight to its storey.
      for (const h of c.hangs) {
        const yRow = hangY(h);
        for (const m of mediaOf(h.node)) {
          draw(h.node.id, m, [...riseFrom(m), [c.x + OFF[m], yRow + OFF[m]]]);
          if (c.from.continues) dot(c.x + OFF[m], yFrom + OFF[m], m);
        }
        placeHang(h.node, 0, (m) => c.x + OFF[m], yRow, "surface");
      }
    }
  }

  // --- Zentrale ----------------------------------------------------------------------------------------------------
  drawCentral(data, result, labels, zentrale, lane0, { symbol, label, draw, dot, group, band, textBlock, use: (k) => used.add(k) });

  return {
    width,
    height,
    bands,
    lines,
    groups,
    used: [...used],
    insulated: bands.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Zentrale
// ---------------------------------------------------------------------------

/**
 * Zentrale: the trunk with its items, the Verteilbatterie from xVB to xEnd with its Abgänge at xA1 (PWC
 * Verteilung) and xA2 (cold feed of the Wassererwärmer), the Wassererwärmer at spX, the Verteilung from x0.
 */
type CentralGeometry = { trunkItems: SymbolKey[]; xVB: number; xA1: number; xA2: number; xEnd: number; spX: number; feedItems: SymbolKey[]; hasHot: boolean; x0: number; height: number };

function centralGeometry(data: SanitaryData, result: SystemResult): CentralGeometry {
  const c = data.central;
  const trunkItems: SymbolKey[] = [];
  if (c.meter) trunkItems.push("shutoff", "meter", "shutoff");
  if (c.filter === "fine") trunkItems.push("filter");
  if (c.filter === "redfil") trunkItems.push("redfil");
  if (c.reducer && c.filter !== "redfil") trunkItems.push("reducer");
  if (c.softener === "all") trunkItems.push("softener");
  const xVB = LEFT + 70 + trunkItems.length * 46;
  // The Absperrventil of the cold feed sits on its Abgang of the Verteilbatterie.
  const feedItems: SymbolKey[] = [];
  if (c.safetyGroup) feedItems.push("check", "safety");
  if (c.softener === "heater") feedItems.push("softener");
  const hasHot = result.lu.warm > 0 || data.network.some((n) => n.pwh);
  const xA1 = xVB + 20;
  const xA2 = xVB + 56;
  const xEnd = hasHot ? xVB + 78 : xVB + 42;
  const spX = xA2 + 44 + feedItems.length * 40;
  const x0 = hasHot ? spX + 250 : xEnd + 70;
  return { trunkItems, xVB, xA1, xA2, xEnd, spX, feedItems, hasHot, x0, height: 190 };
}
function drawCentral(
  data: SanitaryData,
  result: SystemResult,
  labels: SchemaText,
  g: CentralGeometry,
  Y: number,
  api: {
    symbol: (nodeId: string | null, key: SymbolKey, x: number, y: number, vertical?: boolean, dir?: number) => void;
    label: (nodeId: string | null, x: number, y: number, s: string, size?: number, opts?: { anchor?: "start" | "middle" | "end"; muted?: boolean; bold?: boolean }) => void;
    draw: (nodeId: string | null, m: Medium, points: Pt[]) => void;
    dot: (x: number, y: number, m: Medium) => void;
    group: (nodeId: string | null, prims: Prim[]) => void;
    band: (points: Pt[], mm: number | null, shared: boolean) => void;
    textBlock: (nodeId: string, x: number, yBottom: number, lines: string[], anchor: "start" | "middle" | "end", title?: boolean) => void;
    use: (key: SymbolKey) => void;
  },
) {
  const { symbol, label, draw, dot, band } = api;
  const c = data.central;
  const ci = result.central.insulation;
  const Yt = Y + 150;
  const trunk = result.central.trunk?.size;
  // Text of a Zentrale line like the Leitungen: «KW: 35 · 40 mm», then the insulation material.
  const mm = (v: number | null) => (v ? `${v} mm` : labels.none);
  const text = (rows: [string, PipeSize | null | undefined, number | null][]) => {
    const out = rows.filter(([, size]) => size).map(([k, size, v]) => `${k}: ${sizeText(size)} · ${mm(v)}`);
    return rows.some(([, size, v]) => size && v) ? [...out, `${labels.insulation}: ${labels.material}`] : out;
  };
  // Text block with the length of the line on top (when entered).
  const block = (x: number, yTop: number, length: number | null, rows: string[], anchor: "start" | "end") => {
    const lines = [...(length ? [`${fmt1(length)} m`] : []), ...rows];
    if (lines.length) api.textBlock("", x, yTop + (lines.length - 1) * TEXT_LINE, lines, anchor);
  };
  const line = (m: Medium, points: Pt[], insulation: number | null) => {
    band(points, insulation, false);
    draw(null, m, points);
  };
  // Hausanschluss → Verteilbatterie.
  line("pwc", [[LEFT - 20, Yt], [g.xVB, Yt]], ci.trunk);
  block(g.xVB - 8, Yt - 47, c.trunkLength, text([[labels.kw, trunk, ci.trunk]]), "end");
  label(null, LEFT - 18, Yt - 22, labels.house, 8.5, { bold: true });
  label(
    null,
    LEFT - 18,
    Yt - 12,
    [[result.house.dn ? `DN ${result.house.dn}` : "", sizeText(trunk)].filter(Boolean).join(" / "), c.houseLength ? `${fmt1(c.houseLength)} m` : ""].filter(Boolean).join(" · "),
    7,
    { muted: true },
  );
  g.trunkItems.forEach((k, i) => {
    const x = LEFT + 60 + i * 46;
    symbol(null, k, x, Yt);
    if (k === "meter") label(null, x, Yt + 22, labels.meter, 6.5, { anchor: "middle", muted: true });
    if (k === "softener") label(null, x, Yt + 22, labels.softener, 6.5, { anchor: "middle", muted: true });
  });
  // Verteilbatterie like the Schemavorlage: the collector, each Abgang rising with its Absperrventil mit Entleerung
  // and a Verschraubung, the Entleerung at its end.
  api.use("battery");
  api.group(null, [{ t: "rect", x: g.xVB - 4, y: Yt - 4, w: g.xEnd - g.xVB + 8, h: 8, fill: "bg", stroke: "ink", sw: 1.2 }]);
  symbol(null, "drain", g.xEnd, Yt + 11, true, -1);
  label(null, (g.xVB + g.xEnd) / 2 - 4, Yt + 42, labels.battery, 6.5, { anchor: "middle", muted: true });
  const abgang = (x: number) => {
    symbol(null, "shutoffDrain", x, Yt - 18, true);
    symbol(null, "union", x, Yt - 33, true);
  };
  // PWC to the Verteilung.
  line("pwc", [[g.xA1, Yt - 4], [g.xA1, Y], [g.x0, Y]], ci.supply);
  abgang(g.xA1);
  block(g.xA1 + 20, Y - 43, c.centralLength, text([[labels.kw, result.central.supply?.size, ci.supply]]), "start");
  if (!g.hasHot) return;
  // Cold feed of the heater with the Sicherheitsgruppe, entering the Wassererwärmer at its foot.
  const Yf = Yt - 48;
  line("pwc", [[g.xA2, Yt - 4], [g.xA2, Yf], [g.spX - 14, Yf], [g.spX - 14, Yt], [g.spX, Yt]], ci.feed);
  abgang(g.xA2);
  g.feedItems.forEach((k, i) => {
    const x = g.xA2 + 32 + i * 40;
    symbol(null, k, x, Yf);
    if (k === "softener") label(null, x, Yf + 22, labels.softener, 6.5, { anchor: "middle", muted: true });
  });
  block(g.spX - 20, Yt + 12, c.heaterLength, text([[labels.kw, result.central.feed?.size, ci.feed]]), "end");
  // Wassererwärmer (neutral), with its insulation jacket like the Schemavorlage.
  const top = Y + 48;
  api.use("heater");
  api.group(null, [
    { t: "rect", x: g.spX, y: top, w: 90, h: Yt + 20 - top, fill: "#e6e6e6", stroke: "ink", sw: 1.4 },
    { t: "rect", x: g.spX + 6, y: top + 6, w: 78, h: Yt + 8 - top, fill: "#ffd6c9", stroke: "#111111", sw: 0.8 },
    { t: "text", x: g.spX + 45, y: top + 34, text: c.heaterLabel || labels.heater, size: 8.5, anchor: "middle", fill: "#111111", bold: true },
    { t: "text", x: g.spX + 45, y: top + 48, text: [c.heaterVolume ? `${c.heaterVolume} l` : "", `${fmt1(data.settings.tHot)} °C`].filter(Boolean).join(" · "), size: 7.5, anchor: "middle", fill: "#444444" },
  ]);
  // PWH out of the heater to the Verteilung, PWH-C back through the pump group.
  const xH = g.spX + 30;
  const xC = g.spX + 70;
  line("pwh", [[xH, top], [xH, Y + OFF.pwh], [g.x0, Y + OFF.pwh]], ci.hot);
  if (c.mixer) {
    symbol(null, "mixer", xH + 20, Y + OFF.pwh);
    draw(null, "pwc", [[xH + 20, Y], [xH + 20, Y + OFF.pwh - 5]]);
    dot(xH + 20, Y, "pwc");
  }
  if (result.pump) {
    line("pwhc", [[g.x0, Y + OFF.pwhc], [xC, Y + OFF.pwhc], [xC, top]], ci.ret);
    const px = xC + 30;
    symbol(null, "shutoff", px, Y + OFF.pwhc, false, -1);
    symbol(null, "pump", px + 44, Y + OFF.pwhc, false, -1);
    symbol(null, "check", px + 88, Y + OFF.pwhc, false, -1);
    symbol(null, "shutoff", px + 124, Y + OFF.pwhc, false, -1);
    const p = result.pump;
    label(null, px + 44, Y + OFF.pwhc + 20, p.chosen ? `Biral ${p.chosen.name.replace(/ BLUE.*$/, "")}` : "–", 7.5, { anchor: "middle", bold: true });
    label(null, px + 44, Y + OFF.pwhc + 30, `${Math.round(p.flow)} l/h · ${Math.round(p.head)} mbar`, 7, { anchor: "middle", muted: true });
    label(null, xC + 6, top - 6, `${fmt1(data.settings.tReturn)} °C`, 7, { muted: true });
  }
  // Warmwasser and Zirkulation between the Wassererwärmer and the Verteilung, below the pump group.
  block(xC + 30, Y + 70, c.heaterLength, text([[labels.ww, result.central.hot?.size, ci.hot], ...(result.pump ? [[labels.zk, result.central.ret, ci.ret] as [string, PipeSize | null, number | null]] : [])]), "start");
}

export { sizeText } from "./pipes";
