// Symbols of the Prinzipschema after SIA 410 (1988), as drawing primitives shared by the web view (SVG) and the
// PDF (react-pdf):
//   3.1.7 flow direction (arrow on the duct)       3.2.1 / 3.2.2 supply outlet / extract inlet grille
//   3.3.1 weather louvre                            3.3.4 balancing damper (Einstellklappe)
//   3.3.6 silencer                                  3.3.8 filter (G / F / A)
//   3.3.15 / 3.3.16 heating / cooling coil          3.3.18 recuperative heat exchanger
//   3.3.19 flow distributor (Répartiteur)           3.4.1 fan
//   3.4.9 throttling orifice (Drosselblende)
// Ducts are drawn as single coloured lines (usual in a Prinzipschema; SIA 410 3.1.1 draws double lines in plans).

import type { NetNode } from "./network";
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

/** Symbol of a network element; `top` = extent above the line (for the label above it). */
export function nodeSymbol(node: NetNode, air: AirKind, x: number, y: number): { prims: Prim[]; top: number } {
  const color = airColors[air] as Paint;
  const dir = flowDirection(air);
  const product = findProduct(node.product);
  const kind = product?.kind;
  const outer = air === "outdoor" || air === "exhaust";

  switch (node.type) {
    case "duct":
      // 3.1.7: flow direction on the duct.
      return { prims: [arrowHead(x, y, dir, color)], top: 5 };
    case "bend":
      return { prims: [{ t: "path", d: `M${x - 6},${y} A6,6 0 0 1 ${x},${y - 6}`, fill: "none", stroke: color, sw: 2 }], top: 7 };
    case "tee":
      return { prims: [{ t: "circle", cx: x, cy: y, r: 3.5, fill: color }], top: 4 };
    case "distributor": {
      // 3.3.19 flow distributor: frame with double sides and rungs.
      const prims: Prim[] = [box(x, y, 16, 32)];
      prims.push({ t: "line", x1: x - 5, y1: y - 16, x2: x - 5, y2: y + 16, stroke: "ink", sw: 0.8 }, { t: "line", x1: x + 5, y1: y - 16, x2: x + 5, y2: y + 16, stroke: "ink", sw: 0.8 });
      for (let i = -2; i <= 2; i++) prims.push({ t: "line", x1: x - 5, y1: y + i * 6, x2: x + 5, y2: y + i * 6, stroke: "ink", sw: 0.8 });
      return { prims, top: 16 };
    }
    case "terminal": {
      // 3.2.1 supply outlet / 3.2.2 extract inlet: grille with the air flowing out of / into the duct.
      const bar: Prim = { t: "line", x1: x - 2, y1: y - 9, x2: x - 2, y2: y + 9, stroke: "ink", sw: 2 };
      if (air === "supply") return { prims: [bar, { t: "line", x1: x, y1: y, x2: x + 12, y2: y, stroke: color, sw: 1.6 }, arrowHead(x + 14, y, 1, color)], top: 9 };
      return { prims: [bar, { t: "line", x1: x + 18, y1: y, x2: x + 6, y2: y, stroke: color, sw: 1.6 }, arrowHead(x + 4, y, -1, color)], top: 9 };
    }
    default: {
      if (kind === "silencer") {
        // 3.3.6 silencer: frame divided into four cells.
        const prims: Prim[] = [box(x, y, 12, 32)];
        for (const k of [-8, 0, 8]) prims.push({ t: "line", x1: x - 6, y1: y + k, x2: x + 6, y2: y + k, stroke: "ink", sw: 0.8 });
        return { prims, top: 16 };
      }
      if (kind === "filter") {
        // 3.3.8 filter with its class letter.
        return {
          prims: [
            box(x, y, 12, 30),
            { t: "path", d: `M${x - 6},${y - 15} L${x + 6},${y} L${x - 6},${y + 15}`, fill: "none", stroke: "ink", sw: 0.9 },
            { t: "text", x: x - 2.5, y: y + 3, text: filterLetter(product?.name ?? ""), size: 7, anchor: "middle", fill: "ink", bold: true },
          ],
          top: 15,
        };
      }
      if ((kind === "valve" || kind === "fitting") && /comfoset|drossel/i.test(`${product?.family ?? ""} ${product?.name ?? ""}`)) {
        // 3.4.9 throttling orifice.
        return {
          prims: [box(x, y, 10, 26), { t: "line", x1: x, y1: y - 13, x2: x, y2: y - 3, stroke: "ink", sw: 1 }, { t: "line", x1: x, y1: y + 3, x2: x, y2: y + 13, stroke: "ink", sw: 1 }],
          top: 13,
        };
      }
      if (kind === "valve") {
        // 3.3.4 balancing damper.
        return {
          prims: [box(x, y, 22, 9), { t: "line", x1: x - 6, y1: y + 4, x2: x + 6, y2: y - 4, stroke: "ink", sw: 1 }, { t: "circle", cx: x, cy: y, r: 1.8, fill: "ink" }],
          top: 5,
        };
      }
      if (kind === "grille" || (outer && !product)) return { prims: louvre(x, y), top: 15 };
      return { prims: [box(x, y, 16, 16)], top: 8 };
    }
  }
}

/** Coil: frame with diagonal; heating 3.3.15 «+», cooling 3.3.16 «−», combined heating / cooling both. */
function coil(x: number, y: number, mode: "cooling" | "both"): Prim[] {
  const prims: Prim[] = [box(x, y, 10, 26), { t: "line", x1: x - 5, y1: y + 13, x2: x + 5, y2: y - 13, stroke: "ink", sw: 0.8 }];
  prims.push({ t: "text", x: x - 2, y: y - 5, text: "-", size: 8, anchor: "middle", fill: "ink", bold: true });
  if (mode === "both") prims.push({ t: "text", x: x + 2, y: y + 10, text: "+", size: 7, anchor: "middle", fill: "ink", bold: true });
  return prims;
}

/**
 * The ventilation unit: heat recovery (3.3.18) and two fans (3.4.1); ComfoFond-L Q in the outdoor air as
 * heating / cooling coil, ComfoClime in the supply air as cooling coil, both next to the unit.
 */
export function deviceSymbols(layout: SchemaLayout, name: string, lines: string[], attachments: { fond: boolean; clime: boolean }): Prim[] {
  const { device, airY } = layout;
  const cx = device.x + device.w / 2;
  const cy = device.y + device.h / 2;
  const prims: Prim[] = [
    { t: "rect", x: device.x, y: device.y, w: device.w, h: device.h, fill: "bg", stroke: "ink", sw: 1.5, rx: 4 },
    { t: "text", x: cx, y: device.y + 15, text: name, size: 10.5, anchor: "middle", fill: "ink", bold: true },
    // Heat recovery: square with cross and the two air paths.
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
  // Fans: supply fan on the supply line (flow to the right), extract fan on the extract line (flow to the left).
  for (const [y, dir] of [
    [airY.supply, 1],
    [airY.extract, -1],
  ] as const) {
    const fx = device.x + device.w - 22;
    prims.push({ t: "circle", cx: fx, cy: y, r: 10, fill: "bg", stroke: "ink", sw: 1.3 });
    prims.push({ t: "polygon", points: `${fx - 5 * dir},${y - 7} ${fx + 8 * dir},${y} ${fx - 5 * dir},${y + 7}`, fill: "none", stroke: "ink", sw: 1.1 });
  }
  if (attachments.fond) prims.push(...coil(device.x - 16, airY.supply, "both"));
  if (attachments.clime) prims.push(...coil(device.x + device.w + 16, airY.supply, "cooling"));
  lines.forEach((line, i) => prims.push({ t: "text", x: cx, y: device.y + device.h + 13 + i * 11, text: `+ ${line}`, size: 9, anchor: "middle", fill: "muted" }));
  return prims;
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
