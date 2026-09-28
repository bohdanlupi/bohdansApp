// Symbols of the Prinzipschema after SIA 410 (1988), as drawing primitives shared by the web view (SVG) and the
// PDF (react-pdf):
//   3.1.7 flow direction (arrow on the duct)       3.2.1 / 3.2.2 supply outlet / extract inlet grille
//   3.3.1 weather louvre                            3.3.4 balancing damper (Einstellklappe)
//   3.3.6 silencer                                  3.3.8 filter (G / F / A)
//   3.3.15 / 3.3.16 heating / cooling coil          3.3.18 recuperative heat exchanger
//   3.3.19 flow distributor (Répartiteur)           3.4.1 fan
//   3.4.9 throttling orifice (Drosselblende)       pump, compressor, expansion valve (ComfoFond / ComfoClime)
// Ducts are drawn as single coloured lines (usual in a Prinzipschema; SIA 410 3.1.1 draws double lines in plans).

import type { NetNode } from "./network";
import type { DuctMaterial } from "./pressure";
import { findProduct } from "./products";
import { type AirKind, airColors, type SchemaLayout } from "./schema-layout";

/** «ink» = foreground, «bg» = background, «muted» = secondary text; or a colour. */
export type Paint = "ink" | "bg" | "muted" | "none" | `#${string}`;

export type Prim =
  | { t: "rect"; x: number; y: number; w: number; h: number; fill: Paint; stroke?: Paint; sw?: number; rx?: number }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; stroke: Paint; sw: number; dash?: string }
  | { t: "circle"; cx: number; cy: number; r: number; fill: Paint; stroke?: Paint; sw?: number }
  | { t: "path"; d: string; fill: Paint; stroke?: Paint; sw?: number }
  | { t: "polygon"; points: string; fill: Paint; stroke?: Paint; sw?: number }
  | { t: "text"; x: number; y: number; text: string; size: number; anchor?: "start" | "middle" | "end"; fill: Paint; bold?: boolean };

/** Direction of the air flow along the line: +1 left → right, −1 right → left. */
export const flowDirection = (air: AirKind) => (air === "outdoor" || air === "supply" ? 1 : -1);

const arrowHead = (x: number, y: number, dir: number, color: Paint, size = 4.5): Prim => ({
  t: "polygon",
  points: `${x + size * dir},${y} ${x - size * dir},${y - size * 0.85} ${x - size * dir},${y + size * 0.85}`,
  fill: color,
});

const box = (x: number, y: number, w: number, h: number): Prim => ({ t: "rect", x: x - w / 2, y: y - h / 2, w, h, fill: "bg", stroke: "ink", sw: 1.2 });

/** Weather louvre 3.3.1: frame with diagonal hatching (kept inside the frame). */
function louvre(x: number, y: number): Prim[] {
  const w = 12;
  const h = 30;
  const lines: Prim[] = [];
  for (let k = 0; k * 6 + w <= h; k++) lines.push({ t: "line", x1: x - w / 2, y1: y - h / 2 + k * 6, x2: x + w / 2, y2: y - h / 2 + k * 6 + w, stroke: "ink", sw: 0.7 });
  return [box(x, y, w, h), ...lines];
}

/** Filter letter after SIA 410 3.3.8: G coarse, F fine, A activated carbon. */
function filterLetter(name: string): string {
  if (/aktivkohle|\bAK\b/i.test(name)) return "A";
  if (/\bF[5-9]\b|ePM1|ePM2|pollen/i.test(name)) return "F";
  return "G";
}

/** Symbols of the schema, also the entries of the legend (in legend order). */
export const legendKeys = [
  "flow",
  "bend",
  "reducer",
  "tee",
  "distributor",
  "silencer",
  "filter",
  "orifice",
  "damper",
  "component",
  "louvre",
  "supplyTerminal",
  "extractTerminal",
  "heatRecovery",
  "fan",
  "coilBoth",
  "coilCooling",
  "coilHeating",
  "pump",
  "brine",
  "compressor",
  "expansionValve",
  "controlUnit",
  "sensor",
  "interface",
  "controlLine",
] as const;
export type LegendKey = (typeof legendKeys)[number];

/** What the schema draws at the unit besides the network: attachments, filters, control parts. */
export type DeviceExtras = {
  fond: boolean;
  clime: boolean;
  /** Filter per side: SIA 410 letter (G / F / A) and ISO class text. */
  filters?: { supply: { letter: string; text: string }; extract: { letter: string; text: string } } | null;
  /** Control units, sensors, interfaces: kind, short text on the symbol, pieces. */
  controls?: { kind: "control" | "sensor" | "interface"; short: string; count: number }[];
};

/** Which symbol a network element is drawn with. */
export function symbolKey(node: NetNode, air: AirKind): LegendKey {
  const product = findProduct(node.product);
  const kind = product?.kind;
  switch (node.type) {
    case "duct":
      return "flow";
    case "bend":
    case "tee":
    case "reducer":
    case "distributor":
      return node.type;
    case "terminal":
      return air === "supply" ? "supplyTerminal" : "extractTerminal";
    default:
      if (kind === "silencer") return "silencer";
      if (kind === "filter") return "filter";
      if ((kind === "valve" || kind === "fitting") && /comfoset|drossel/i.test(`${product?.family ?? ""} ${product?.name ?? ""}`)) return "orifice";
      if (kind === "valve") return "damper";
      if (kind === "grille" || ((air === "outdoor" || air === "exhaust") && !product)) return "louvre";
      return "component";
  }
}

/** Heat recovery 3.3.18: square with cross and the two air paths. */
function heatRecovery(cx: number, cy: number): Prim[] {
  return [
    { t: "rect", x: cx - 18, y: cy - 18, w: 36, h: 36, fill: "none", stroke: "ink", sw: 1.3 },
    { t: "line", x1: cx - 18, y1: cy - 18, x2: cx + 18, y2: cy + 18, stroke: "ink", sw: 1.3 },
    { t: "line", x1: cx + 18, y1: cy - 18, x2: cx - 18, y2: cy + 18, stroke: "ink", sw: 1.3 },
    { t: "line", x1: cx - 28, y1: cy - 9, x2: cx - 20, y2: cy - 9, stroke: "ink", sw: 1 },
    arrowHead(cx - 21, cy - 9, 1, "ink", 3),
    { t: "line", x1: cx + 20, y1: cy - 9, x2: cx + 28, y2: cy - 9, stroke: "ink", sw: 1 },
    arrowHead(cx + 27, cy - 9, 1, "ink", 3),
    { t: "line", x1: cx + 28, y1: cy + 9, x2: cx + 20, y2: cy + 9, stroke: "ink", sw: 1 },
    arrowHead(cx + 21, cy + 9, -1, "ink", 3),
    { t: "line", x1: cx - 20, y1: cy + 9, x2: cx - 28, y2: cy + 9, stroke: "ink", sw: 1 },
    arrowHead(cx - 27, cy + 9, -1, "ink", 3),
  ];
}

/** Fan 3.4.1: circle with the triangle pointing in the flow direction. */
function fan(x: number, y: number, dir: number): Prim[] {
  return [
    { t: "circle", cx: x, cy: y, r: 10, fill: "bg", stroke: "ink", sw: 1.3 },
    { t: "polygon", points: `${x - 5 * dir},${y - 7} ${x + 8 * dir},${y} ${x - 5 * dir},${y + 7}`, fill: "none", stroke: "ink", sw: 1.1 },
  ];
}

/** Compressor: circle with two lines narrowing in the flow direction (dir −1: to the left). */
function compressor(x: number, y: number, dir = -1): Prim[] {
  return [
    { t: "circle", cx: x, cy: y, r: 6.5, fill: "bg", stroke: "ink", sw: 1.1 },
    { t: "line", x1: x - 4.5 * dir, y1: y - 4.7, x2: x + 5.5 * dir, y2: y - 2, stroke: "ink", sw: 1 },
    { t: "line", x1: x - 4.5 * dir, y1: y + 4.7, x2: x + 5.5 * dir, y2: y + 2, stroke: "ink", sw: 1 },
  ];
}

/** Expansion valve: two triangles tip to tip, with the adjusting arrow across. */
function expansionValve(x: number, y: number): Prim[] {
  return [
    { t: "polygon", points: `${x - 6},${y - 4} ${x},${y} ${x - 6},${y + 4}`, fill: "bg", stroke: "ink", sw: 1 },
    { t: "polygon", points: `${x + 6},${y - 4} ${x},${y} ${x + 6},${y + 4}`, fill: "bg", stroke: "ink", sw: 1 },
    { t: "line", x1: x - 5, y1: y + 6, x2: x + 5, y2: y - 6, stroke: "ink", sw: 1 },
    { t: "polygon", points: `${x + 5},${y - 6} ${x + 1.2},${y - 4.8} ${x + 3.8},${y - 2.2}`, fill: "ink" },
  ];
}

/**
 * Draws a symbol at (x, y) on a line of the given colour and flow direction; `top` = extent above the line (for the
 * label above it). `letter`: filter class.
 */
export function drawSymbol(key: LegendKey, x: number, y: number, color: Paint, dir: number, letter = "G"): { prims: Prim[]; top: number } {
  switch (key) {
    case "flow":
      // 3.1.7: flow direction on the duct.
      return { prims: [arrowHead(x, y, dir, color)], top: 5 };
    case "bend":
      return { prims: [{ t: "path", d: `M${x - 6},${y} A6,6 0 0 1 ${x},${y - 6}`, fill: "none", stroke: color, sw: 2 }], top: 7 };
    case "tee":
      return { prims: [{ t: "circle", cx: x, cy: y, r: 3.5, fill: color }], top: 4 };
    case "reducer":
      // Change of cross-section: trapezoid narrowing in flow direction.
      return {
        prims: [{ t: "path", d: `M${x - 5 * dir},${y - 6} L${x + 5 * dir},${y - 3} L${x + 5 * dir},${y + 3} L${x - 5 * dir},${y + 6} Z`, fill: "none", stroke: color, sw: 1.4 }],
        top: 7,
      };
    case "distributor": {
      // 3.3.19 flow distributor: frame with double sides and rungs.
      const prims: Prim[] = [box(x, y, 16, 32)];
      prims.push({ t: "line", x1: x - 5, y1: y - 16, x2: x - 5, y2: y + 16, stroke: "ink", sw: 0.8 }, { t: "line", x1: x + 5, y1: y - 16, x2: x + 5, y2: y + 16, stroke: "ink", sw: 0.8 });
      for (let i = -2; i <= 2; i++) prims.push({ t: "line", x1: x - 5, y1: y + i * 6, x2: x + 5, y2: y + i * 6, stroke: "ink", sw: 0.8 });
      return { prims, top: 16 };
    }
    case "supplyTerminal":
    case "extractTerminal": {
      // 3.2.1 supply outlet / 3.2.2 extract inlet: grille with the air flowing out of / into the duct.
      const bar: Prim = { t: "line", x1: x - 2, y1: y - 9, x2: x - 2, y2: y + 9, stroke: "ink", sw: 2 };
      if (key === "supplyTerminal") return { prims: [bar, { t: "line", x1: x, y1: y, x2: x + 12, y2: y, stroke: color, sw: 1.6 }, arrowHead(x + 14, y, 1, color)], top: 9 };
      return { prims: [bar, { t: "line", x1: x + 18, y1: y, x2: x + 6, y2: y, stroke: color, sw: 1.6 }, arrowHead(x + 4, y, -1, color)], top: 9 };
    }
    case "silencer": {
      // 3.3.6 silencer: frame divided into four cells.
      const prims: Prim[] = [box(x, y, 12, 32)];
      for (const k of [-8, 0, 8]) prims.push({ t: "line", x1: x - 6, y1: y + k, x2: x + 6, y2: y + k, stroke: "ink", sw: 0.8 });
      return { prims, top: 16 };
    }
    case "filter":
      // 3.3.8 filter with its class letter; the V points in the flow direction.
      return {
        prims: [
          box(x, y, 12, 30),
          { t: "path", d: `M${x - 6 * dir},${y - 15} L${x + 6 * dir},${y} L${x - 6 * dir},${y + 15}`, fill: "none", stroke: "ink", sw: 0.9 },
          { t: "text", x: x - 2.5 * dir, y: y + 3, text: letter, size: 7, anchor: "middle", fill: "ink", bold: true },
        ],
        top: 15,
      };
    case "orifice":
      // 3.4.9 throttling orifice.
      return {
        prims: [box(x, y, 10, 26), { t: "line", x1: x, y1: y - 13, x2: x, y2: y - 3, stroke: "ink", sw: 1 }, { t: "line", x1: x, y1: y + 3, x2: x, y2: y + 13, stroke: "ink", sw: 1 }],
        top: 13,
      };
    case "damper":
      // 3.3.4 balancing damper.
      return {
        prims: [box(x, y, 22, 9), { t: "line", x1: x - 6, y1: y + 4, x2: x + 6, y2: y - 4, stroke: "ink", sw: 1 }, { t: "circle", cx: x, cy: y, r: 1.8, fill: "ink" }],
        top: 5,
      };
    case "louvre":
      return { prims: louvre(x, y), top: 15 };
    case "component":
      return { prims: [box(x, y, 16, 16)], top: 8 };
    case "heatRecovery":
      return { prims: heatRecovery(x, y), top: 18 };
    case "fan":
      return { prims: fan(x, y, dir), top: 10 };
    case "coilBoth":
      return { prims: coil(x, y, "both"), top: 13 };
    case "coilCooling":
      return { prims: coil(x, y, "cooling"), top: 13 };
    case "coilHeating":
      return { prims: coil(x, y, "heating"), top: 13 };
    case "pump":
      return { prims: pump(x, y, dir, brine), top: 5 };
    case "brine":
      return {
        prims: [
          { t: "line", x1: x - 12, y1: y - 3, x2: x + 12, y2: y - 3, stroke: brine, sw: 1.4 },
          { t: "line", x1: x - 12, y1: y + 3, x2: x + 12, y2: y + 3, stroke: brine, sw: 1.4 },
        ],
        top: 4,
      };
    case "compressor":
      return { prims: compressor(x, y), top: 7 };
    case "expansionValve":
      return { prims: expansionValve(x, y), top: 6 };
    case "controlUnit":
      return { prims: controlSymbol("control", x, y, letter === "G" ? "CS" : letter), top: 7 };
    case "sensor":
      return { prims: controlSymbol("sensor", x, y, letter === "G" ? "H" : letter), top: 7 };
    case "interface":
      return { prims: controlSymbol("interface", x, y, letter === "G" ? "LAN" : letter), top: 7 };
    case "controlLine":
      return { prims: [{ t: "line", x1: x - 12, y1: y, x2: x + 12, y2: y, stroke: "ink", sw: 0.8, dash: "3 2" }], top: 2 };
  }
}

/** Control unit (rectangle), room sensor (circle) or interface (box with double frame), with its short text. */
function controlSymbol(kind: "control" | "sensor" | "interface", x: number, y: number, text: string): Prim[] {
  const label: Prim = { t: "text", x, y: y + 2.3, text, size: text.length > 2 ? 5 : 6, anchor: "middle", fill: "ink", bold: true };
  if (kind === "sensor") return [{ t: "circle", cx: x, cy: y, r: 7, fill: "bg", stroke: "ink", sw: 1 }, label];
  if (kind === "interface") {
    return [
      { t: "rect", x: x - 10, y: y - 7, w: 20, h: 14, fill: "bg", stroke: "ink", sw: 1 },
      { t: "rect", x: x - 8, y: y - 5, w: 16, h: 10, fill: "none", stroke: "ink", sw: 0.5 },
      label,
    ];
  }
  return [{ t: "rect", x: x - 9, y: y - 7, w: 18, h: 14, rx: 2, fill: "bg", stroke: "ink", sw: 1 }, label];
}

/** Symbol of a network element; `top` = extent above the line (for the label above it). */
export function nodeSymbol(node: NetNode, air: AirKind, x: number, y: number): { prims: Prim[]; top: number } {
  return drawSymbol(symbolKey(node, air), x, y, airColors[air] as Paint, flowDirection(air), filterLetter(findProduct(node.product)?.name ?? ""));
}

/** Legend entries of a schema: the symbols of its elements and of the unit with its attachments, in legend order. */
export function schemaLegend(layout: SchemaLayout, extras: DeviceExtras): LegendKey[] {
  const used = new Set<LegendKey>(layout.nodes.map((n) => symbolKey(n.node, n.air)));
  used.add("heatRecovery");
  used.add("fan");
  if (extras.filters) used.add("filter");
  if (extras.fond) ["coilBoth", "pump", "brine"].forEach((k) => used.add(k as LegendKey));
  if (extras.clime) ["coilCooling", "coilHeating", "compressor", "expansionValve"].forEach((k) => used.add(k as LegendKey));
  for (const c of extras.controls ?? []) used.add(c.kind === "control" ? "controlUnit" : c.kind);
  if (extras.controls?.length) used.add("controlLine");
  return legendKeys.filter((k) => used.has(k));
}

/** Coil: frame with diagonal; heating 3.3.15 «+», cooling 3.3.16 «−», combined heating / cooling both. */
function coil(x: number, y: number, mode: "heating" | "cooling" | "both"): Prim[] {
  const prims: Prim[] = [box(x, y, 10, 26), { t: "line", x1: x - 5, y1: y + 13, x2: x + 5, y2: y - 13, stroke: "ink", sw: 0.8 }];
  if (mode !== "heating") prims.push({ t: "text", x: x - 2, y: y - 5, text: "-", size: 8, anchor: "middle", fill: "ink", bold: true });
  if (mode !== "cooling") prims.push({ t: "text", x: x + 2, y: y + 10, text: "+", size: 7, anchor: "middle", fill: "ink", bold: true });
  return prims;
}

/** Brine of the ground probes (Erdwärmesonden) of the ComfoFond-L Q: dark violet. */
const brine: Paint = "#5b1f8a";

/** Pump: circle with the triangle pointing in the flow direction (dy = +1 downwards, −1 upwards). */
function pump(x: number, y: number, dy: number, color: Paint): Prim[] {
  return [
    { t: "circle", cx: x, cy: y, r: 5, fill: "bg", stroke: color, sw: 1.1 },
    { t: "polygon", points: `${x - 3.5},${y - 2.5 * dy} ${x + 3.5},${y - 2.5 * dy} ${x},${y + 4.5 * dy}`, fill: color },
  ];
}

/**
 * ComfoFond-L Q: short supply / return pipes from the coil to the ground probes, with the circulation pump on the
 * supply pipe, ending in «EWS» below the coil.
 */
function groundProbePipes(x: number, y: number): Prim[] {
  const top = y + 13;
  const bottom = y + 44;
  const prims: Prim[] = [
    { t: "line", x1: x - 3, y1: top, x2: x - 3, y2: bottom, stroke: brine, sw: 1.4 },
    { t: "line", x1: x + 3, y1: top, x2: x + 3, y2: bottom, stroke: brine, sw: 1.4 },
    ...pump(x - 3, y + 28, -1, brine),
    { t: "text", x, y: bottom + 9, text: "EWS", size: 7, anchor: "middle", fill: brine, bold: true },
  ];
  return prims;
}

/**
 * ComfoClime: cooling coil (evaporator) in the supply air right of the unit, heating coil (condenser) in the exhaust
 * air left of it, connected below the unit by the refrigerant circuit: evaporator → compressor → condenser →
 * expansion valve → evaporator.
 */
function refrigerantCircuit(xEvaporator: number, ySupply: number, xCondenser: number, yExhaust: number, yBelow: number): Prim[] {
  const inner = yBelow;
  const outer = yBelow + 14;
  const line = (x1: number, y1: number, x2: number, y2: number): Prim => ({ t: "line", x1, y1, x2, y2, stroke: "ink", sw: 1 });
  const prims: Prim[] = [
    // Suction and hot gas (inner path, with the compressor).
    line(xEvaporator - 3, ySupply + 13, xEvaporator - 3, inner),
    line(xEvaporator - 3, inner, xCondenser + 3, inner),
    line(xCondenser + 3, inner, xCondenser + 3, yExhaust + 13),
    // Liquid (outer path, with the expansion valve).
    line(xCondenser - 3, yExhaust + 13, xCondenser - 3, outer),
    line(xCondenser - 3, outer, xEvaporator + 3, outer),
    line(xEvaporator + 3, outer, xEvaporator + 3, ySupply + 13),
  ];
  // Compressor on the hot gas line (flow to the condenser, left), expansion valve on the liquid line.
  prims.push(...compressor(xCondenser + (xEvaporator - xCondenser) * 0.35, inner), ...expansionValve(xCondenser + (xEvaporator - xCondenser) * 0.65, outer));
  return prims;
}

/**
 * The ventilation unit: heat recovery (3.3.18) and two fans (3.4.1); ComfoFond-L Q in the outdoor air as
 * heating / cooling coil with its ground probe pipes and pump; ComfoClime as cooling coil in the supply air and
 * heating coil in the exhaust air, connected by the refrigerant circuit below the unit.
 */
export function deviceSymbols(layout: SchemaLayout, name: string, lines: string[], attachments: DeviceExtras): Prim[] {
  const { device, airY } = layout;
  const cx = device.x + device.w / 2;
  const cy = device.y + device.h / 2;
  const prims: Prim[] = [
    { t: "rect", x: device.x, y: device.y, w: device.w, h: device.h, fill: "bg", stroke: "ink", sw: 1.5, rx: 4 },
    { t: "text", x: cx, y: device.y + 15, text: name, size: 10.5, anchor: "middle", fill: "ink", bold: true },
    ...heatRecovery(cx, cy),
    // Fans at the air outlets of the unit: supply fan on the supply line (flow to the right), extract fan on the
    // extract line before the exhaust air (flow to the left).
    ...fan(device.x + device.w - 22, airY.supply, 1),
    ...fan(device.x + 22, airY.extract, -1),
  ];
  // Filters at the air inlets of the unit (outdoor air left, extract air right), class above.
  if (attachments.filters) {
    for (const [fx, y, dir, f] of [
      [device.x + 34, airY.supply, 1, attachments.filters.supply],
      [device.x + device.w - 34, airY.extract, -1, attachments.filters.extract],
    ] as const) {
      prims.push(...drawSymbol("filter", fx, y, "ink", dir, f.letter).prims);
      prims.push({ t: "text", x: fx, y: y - 19, text: f.text, size: 7, anchor: "middle", fill: "ink" });
    }
  }
  const below = device.y + device.h;
  if (attachments.fond) prims.push(...groundProbePipes(device.x - 16, airY.supply), ...coil(device.x - 16, airY.supply, "both"));
  if (attachments.clime) {
    // Circuit first, so the coils cover the pipe ends.
    prims.push(
      ...refrigerantCircuit(device.x + device.w + 16, airY.supply, device.x - 16, airY.extract, below + 10),
      ...coil(device.x + device.w + 16, airY.supply, "cooling"),
      ...coil(device.x - 16, airY.extract, "heating"),
    );
  }
  // Attachment names below the unit (below the refrigerant circuit).
  const textTop = below + (attachments.clime ? 43 : 13);
  lines.forEach((line, i) => prims.push({ t: "text", x: cx, y: textTop + i * 11, text: `+ ${line}`, size: 9, anchor: "middle", fill: "muted" }));
  // Control units, sensors, interfaces on a dashed control line from the unit, below the texts; pieces below.
  const controls = attachments.controls ?? [];
  if (controls.length) {
    const rowY = textTop + lines.length * 11 + 14;
    const x0 = device.x + 8;
    const step = 30;
    const dashed = (x1: number, y1: number, x2: number, y2: number): Prim => ({ t: "line", x1, y1, x2, y2, stroke: "ink", sw: 0.8, dash: "3 2" });
    prims.push(dashed(x0, below, x0, rowY), dashed(x0, rowY, x0 + 12 + (controls.length - 1) * step, rowY));
    controls.forEach((c, i) => {
      const x = x0 + 12 + i * step;
      prims.push(...controlSymbol(c.kind, x, rowY, c.short));
      if (c.count > 1) prims.push({ t: "text", x, y: rowY + 16, text: `${c.count}×`, size: 7, anchor: "middle", fill: "muted" });
    });
  }
  return prims;
}

/** Short duct system names for the schema. */
const ductTypes: [RegExp, string][] = [
  [/^Spirorohre/, "Spiro"],
  [/^ComfoTube Therm/, "Therm"],
  [/^ComfoTube/, "ComfoTube"],
  [/^ComfoPipe Plus/, "ComfoPipe+"],
  [/^ComfoPipe/, "ComfoPipe"],
];

/**
 * Short text of a duct above it in the schema: type and nominal size, e.g. «Spiro DN 160», «ComfoTube flat 51»,
 * «2× ComfoTube DN 75»; ducts without product: material and diameter / cross-section.
 */
export function ductLabel(node: NetNode, material: (m: DuctMaterial) => string): string {
  if (node.type !== "duct") return "";
  const product = findProduct(node.product);
  let text: string;
  if (product) {
    const family = product.family ?? product.name;
    const type = ductTypes.find(([re]) => re.test(family))?.[1] ?? family;
    const size = /flat 51/.test(product.name) ? "flat 51" : `DN ${/DN ?(\d+)/.exec(product.name)?.[1] ?? /\d+/.exec(product.name)?.[0] ?? product.inner?.diameter ?? "?"}`;
    text = `${type} ${size}`;
  } else {
    const size = node.diameter ? `DN ${node.diameter}` : node.width && node.height ? `${node.width}×${node.height}` : "";
    text = [material(node.material), size].filter(Boolean).join(" ");
  }
  return node.count > 1 ? `${node.count}× ${text}` : text;
}

/** Short «Auslass + cover» text of a terminal, e.g. «CLD breit + Roma breit». */
export function terminalParts(node: NetNode, measuredPrefix: string): string {
  if (node.type !== "terminal") return "";
  const casing = findProduct(node.product);
  const short = (name: string) =>
    name
      .replace(/^Comfo(Case|Grid|Valve)\s+/, "")
      .replace(/\s+für ComfoCase .*$/, "")
      .replace(/\s*\(.*\)$/, "");
  const caseName = casing ? short(casing.family ?? casing.name) : "";
  const cover = node.cover?.startsWith(measuredPrefix) ? node.cover.slice(measuredPrefix.length) : (findProduct(node.cover)?.name ?? "");
  return [caseName, cover && short(cover)].filter(Boolean).join(" + ");
}
