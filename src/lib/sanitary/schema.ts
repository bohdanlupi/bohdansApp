// Prinzipschema (Strangschema) of a Sanitäranlage, as drawing primitives shared by the web view and the PDF:
//
//   floors (top first) ──────────────────────────────────────────────  Stockwerkverteilungen / Apparategruppen
//                         │ Strang 1   │ Strang 2 …                    right of each Strang, at their storey
//   Verteilleitung ═══════╧════════════╧═══════════                     PWC / PWH / PWH-C as three parallel lines
//   Zentrale: Hausanschluss → Wasserzähler → Filter → Verteilbatterie → Sicherheitsgruppe → Wassererwärmer → pump
//
// Symbols after SN EN 806-1 (SVGW W3 Anhang 4); colours: PWC green, PWH red, PWH-C violet. The Wassererwärmer is
// neutral, all other parts are Nussbaum (pump Biral). Insulation as highlighter bands behind the lines; «Rohr an
// Rohr» as one band around PWH and PWH-C.

import type { Paint, Prim } from "@/lib/kwl/schema-symbols";
import { floorOrder } from "@/lib/kwl/schema-layout";

import type { Medium, SanitaryData, SanNode, SystemResult } from "./network";
import { consumerLu } from "./network";
import { insulationStyle, type PipeSize } from "./pipes";

export const mediumColors: Record<Medium, `#${string}`> = { pwc: "#00a651", pwh: "#e3001b", pwhc: "#9b30d9" };
/** Offset of each line from the first one (PWC) [units]. */
const OFF: Record<Medium, number> = { pwc: 0, pwh: 14, pwhc: 28 };
/** Distance of the outermost line (PWH-C) from the first one. */
const SPAN = OFF.pwhc;
const MEDIA: Medium[] = ["pwc", "pwh", "pwhc"];

const DX = 96; // Verteilleitung section
const DX2 = 100; // Stockwerkverteilung section
const RH = 48; // row of a Stockwerkverteilung
const LABEL_W = 180; // consumer text
const LEFT = 64; // storey names
const LANE = 56;

export type SchemaText = {
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
  | "heater";

export type SchemaBand = { d: string; fill: string; edge: string; width: number; mm: number; shared: boolean };
export type SchemaLine = { d: string; medium: Medium; nodeId: string | null };
export type SchemaGroup = { nodeId: string | null; prims: Prim[] };

export type SanitarySchema = {
  width: number;
  height: number;
  bands: SchemaBand[];
  lines: SchemaLine[];
  groups: SchemaGroup[];
  /** Symbols used (for the legend) and insulation thicknesses. */
  used: SymbolKey[];
  insulation: { mm: number; shared: boolean }[];
};

type Pt = [number, number];
const pathD = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${round(x)},${round(y)}`).join(" ");
const round = (v: number) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------
// Symbols (SN EN 806-1), drawn along a line: horizontal (flow dir ±1) or vertical (upwards)
// ---------------------------------------------------------------------------

/** Maps local coordinates (u along the line, v across) to the sheet. */
function frame(x: number, y: number, vertical: boolean, dir = 1) {
  return (u: number, v: number): Pt => (vertical ? [x + v, y - u * dir] : [x + u * dir, y + v]);
}
const pts = (list: Pt[]) => list.map(([a, b]) => `${round(a)},${round(b)}`).join(" ");

export function drawSymbol(key: SymbolKey, x: number, y: number, vertical = false, dir = 1, color: Paint = "ink"): Prim[] {
  const f = frame(x, y, vertical, dir);
  const poly = (list: Pt[], fill: Paint = "bg", sw = 1): Prim => ({ t: "polygon", points: pts(list.map(([u, v]) => f(u, v))), fill, stroke: "ink", sw });
  const line = (u1: number, v1: number, u2: number, v2: number, sw = 1, stroke: Paint = "ink"): Prim => {
    const [x1, y1] = f(u1, v1);
    const [x2, y2] = f(u2, v2);
    return { t: "line", x1, y1, x2, y2, stroke, sw };
  };
  const rect = (u: number, v: number, w: number, h: number, fill: Paint = "bg"): Prim => {
    const [ax, ay] = f(u, v);
    const [bx, by] = f(u + w, v + h);
    return { t: "rect", x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay), fill, stroke: "ink", sw: 1 };
  };
  const text = (u: number, v: number, s: string, size = 6): Prim => {
    const [tx, ty] = f(u, v);
    return { t: "text", x: tx, y: ty + size * 0.35, text: s, size, anchor: "middle", fill: "ink", bold: true };
  };
  const side = vertical ? -1 : 1;
  const bowtie = (fill: Paint = "bg") => [poly([[-7, -5], [0, 0], [-7, 5]], fill), poly([[7, -5], [0, 0], [7, 5]], fill), line(-7, -5, -7, 5), line(7, -5, 7, 5)];
  switch (key) {
    case "shutoff":
      return bowtie();
    case "shutoffDrain":
      // Absperrventil with Entleerventil: the outlet arrow below the valve.
      return [...bowtie(), line(0, 0, 0, 9, 0.8), poly([[0, 13], [-2.5, 8.5], [2.5, 8.5]], "ink", 0.5)];
    case "check":
      // Rückflussverhinderer: filled triangle in flow direction against a bar.
      return [poly([[-5, -5], [4, 0], [-5, 5]], "ink"), line(4.5, -5.5, 4.5, 5.5, 1.2)];
    case "regValve":
      // Zirkulationsregelventil: valve with the filled triangle above.
      // Vertical lines: the triangle on the right, clear of the line next to it.
      return [...bowtie(), poly([[-5, -12 * side], [5, -12 * side], [0, -2 * side]], "ink")];
    case "meter":
      return [rect(-7, -6, 14, 12), line(-7, -2.5, 7, -2.5, 0.7), text(0, 2, "m³", 4.8)];
    case "filter":
      return [rect(-6, -9, 12, 18), { ...line(0, -7, 0, 7, 0.8), dash: "2 1.5" } as Prim];
    case "reducer":
      return [...bowtie(), line(0, -4, 0, -13, 0.8), poly([[0, -3.5], [-2, -7.5], [2, -7.5]], "ink", 0.4), line(-3, -13, 3, -13, 0.8)];
    case "redfil":
      // Druckminderer mit Filter (Redfil): the reducing valve with the filter cup below.
      return [...bowtie(), line(0, -4, 0, -13, 0.8), poly([[0, -3.5], [-2, -7.5], [2, -7.5]], "ink", 0.4), line(-3, -13, 3, -13, 0.8), rect(-5, 5, 10, 12), { ...line(0, 7, 0, 15, 0.7), dash: "2 1.5" } as Prim];
    case "safety":
      // Sicherheitsventil federbelastet, on a short branch above the line, with the funnel.
      return [
        line(0, 0, 0, -8, 1),
        poly([[-4, -8], [4, -8], [0, -14]], "bg"),
        poly([[-4, -20], [4, -20], [0, -14]], "bg"),
        line(0, -20, 3, -24, 0.8),
        line(3, -24, -3, -26, 0.8),
        line(-3, -26, 3, -28, 0.8),
        line(4, -14, 10, -14, 0.8),
        line(10, -14, 10, -8, 0.8),
        poly([[7, -8], [13, -8], [10, -4]], "bg", 0.7),
      ];
    case "pump": {
      const [cx, cy] = f(0, 0);
      return [{ t: "circle", cx, cy, r: 8, fill: "bg", stroke: "ink", sw: 1.1 }, line(-5.5, -5.8, 8, 0, 1), line(-5.5, 5.8, 8, 0, 1)];
    }
    case "mixer": {
      const [cx, cy] = f(0, 0);
      return [{ t: "circle", cx, cy, r: 5, fill: "ink" }];
    }
    case "softener":
      return [rect(-10, -9, 20, 18), text(0, 0, "E", 8)];
    case "consumer": {
      // Apparate- und Armaturenanschluss mit Absperrung: circle, lower half filled.
      const [cx, cy] = f(0, 0);
      return [
        { t: "circle", cx, cy, r: 4.5, fill: "bg", stroke: "ink", sw: 1 },
        { t: "path", d: `M${cx - 4.5},${cy} A4.5,4.5 0 0 0 ${cx + 4.5},${cy} Z`, fill: color === "ink" ? "ink" : color },
      ];
    }
    case "battery":
      return [rect(-3, -8, 6, 16, "ink")];
    case "heater":
      return [rect(-12, -14, 24, 28), text(0, 0, "WE", 7)];
  }
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

type Hang = { node: SanNode; floor: string; rows: number; depth: number; anchor: number };
/** Where a line leaves the line before it; `continues`: that line goes on past this branch (T-junction). */
type From = { x: number; lane: number; continues: boolean };
type Column = { x: number; lane: number; from: From; chain: SanNode[]; hangs: Hang[]; width: number };
type Seg = { node: SanNode; lane: number; x0: number; x1: number; drop: boolean; from: From };

/** Size text of a line: Optipress by its outer diameter, Optiflex with «F» (PE-RT 1-LU pipe «F16x3.8»). */
const sizeText = (s: PipeSize | null | undefined) => (!s ? "" : s.system === "optiflex" ? (s.key === "of-16x3.8" ? "F16x3.8" : `F${s.od}`) : `${s.od}`);
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
    const width = Math.max(130, ...hangs.map((h) => 40 + (h.depth + 1) * DX2 + LABEL_W));
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
    const h = 34 + Math.max(1, rowsAt.get(f) ?? 1) * RH + 10;
    floorY.set(f, { y0: y, y1: y + h, row: y + 34 });
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
    const style = insulationStyle(mm);
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
  const sizes = (n: SanNode) => {
    const r = res(n);
    if (!r) return "";
    return [r.pwc && sizeText(r.pwc.size), r.pwh && sizeText(r.pwh.size), r.pwhc && sizeText(r.pwhc.size)].filter(Boolean).join(" / ");
  };
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
    const r = res(s.node);
    const mid = s.x1 - DX / 2;
    label(s.node.id, mid, yL - 16, [s.node.label, s.node.length ? `${fmt1(s.node.length)} m` : ""].filter(Boolean).join(" · "), 7.5, { anchor: "middle", bold: true });
    label(s.node.id, mid, yL - 6, [sizes(s.node), r?.circ ? `${Math.round(r.circ.flow)} l/h` : ""].filter(Boolean).join(" · "), 7, { anchor: "middle", muted: true });
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
    const placeHang = (n: SanNode, d: number, start: (m: Medium) => number, yRow: number): number => {
      const endX = c.x + 30 + (d + 1) * DX2;
      if (n.type === "consumer") {
        const x = Math.max(start("pwc") + 26, c.x + 44);
        for (const m of ["pwc", "pwh"] as const) {
          if (!carries(n, m)) continue;
          draw(n.id, m, [[start(m), yRow + OFF[m]], [x, yRow + OFF[m]]]);
          used.add("consumer");
          group(n.id, drawSymbol("consumer", x + 4.5, yRow + OFF[m], false, 1, mediumColors[m]));
        }
        const lu = consumerLu(n.appliances);
        label(n.id, x + 14, yRow + 3, n.label || "–", 8);
        label(n.id, x + 14, yRow + 13, `${lu.cold} / ${lu.warm} ${labels.lu}`, 7, { muted: true });
        return 1;
      }
      const paths: Partial<Record<Medium, Pt[]>> = {};
      for (const m of mediaOf(n)) {
        paths[m] = [[start(m), yRow + OFF[m]], [endX, yRow + OFF[m]]];
        draw(n.id, m, paths[m]!);
      }
      bandsOf(n, paths);
      label(n.id, endX - 4, yRow - 4, [sizes(n), n.length ? `${fmt1(n.length)} m` : ""].filter(Boolean).join(" · "), 6.8, { anchor: "end", muted: true });
      const x0 = start("pwhc") + 16;
      if (n.meter) ["pwc", "pwh"].forEach((m, i) => carries(n, m as Medium) && symbol(n.id, "meter", x0 + 10 + i * 20, yRow + OFF[m as Medium]));
      if (n.shutoff && !n.meter) ["pwc", "pwh"].forEach((m, i) => carries(n, m as Medium) && symbol(n.id, "shutoff", x0 + 10 + i * 18, yRow + OFF[m as Medium]));
      if (circuitEnds.has(n.id)) circulationEnd(n, endX, yRow);
      let rows = 0;
      n.children.forEach((child, i) => {
        const cy = yRow + rows * RH;
        if (i === 0) {
          rows += placeHang(child, d + 1, () => endX, cy);
          return;
        }
        // Branch down from the end of this pipe, the lines turning in reverse order (like the Verteilleitung).
        const bx = (m: Medium) => endX + SPAN - OFF[m];
        for (const m of mediaOf(child)) {
          if (!carries(n, m)) continue;
          draw(child.id, m, [[endX, yRow + OFF[m]], [bx(m), yRow + OFF[m]]]);
          if (carries(n.children[0], m)) dot(bx(m), yRow + OFF[m], m);
        }
        rows += placeHang(child, d + 1, bx, cy);
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
        const r = res(s);
        // Section text right of the lines, just above the storey it starts from.
        const ly = i ? tops[i - 1] - 20 : yL - 148;
        label(s.id, c.x + SPAN + 10, ly, [s.label && i ? s.label : "", sizes(s), s.length ? `${fmt1(s.length)} m` : ""].filter(Boolean).join(" · "), 7, { muted: true });
        if (r?.circ) label(s.id, c.x + SPAN + 10, ly + 9, `${Math.round(r.circ.flow)} l/h`, 7, { muted: true });
        if (circuitEnds.has(s.id)) {
          group(s.id, [{ t: "line", x1: c.x + OFF.pwhc, y1: y1 + OFF.pwhc, x2: c.x + OFF.pwh, y2: y1 + OFF.pwhc, stroke: mediumColors.pwhc, sw: 1.6 }]);
          dot(c.x + OFF.pwh, y1 + OFF.pwhc, "pwhc");
        }
      });
      // Foot of the Strang: Absperrventile mit Entleerung, Rückflussverhinderer and Regulierventil on the PWH-C.
      const fr = res(foot);
      for (const m of mediaOf(foot)) symbol(foot.id, "shutoffDrain", c.x + OFF[m], yL - 28 - OFF[m] * 1.5, true);
      if (fr?.pwhc) {
        symbol(foot.id, "check", c.x + OFF.pwhc, yL - 96, true, -1);
        symbol(foot.id, "regValve", c.x + OFF.pwhc, yL - 122, true);
        label(foot.id, c.x + SPAN + 16, yL - 118, foot.regValve === "manual" ? "24026" : "36030", 6.5, { muted: true });
      }
      label(foot.id, c.x + 10, tops[tops.length - 1] - 14, foot.label || `${labels.strang} ${fr?.strang ?? ""}`, 8.5, { anchor: "middle", bold: true });

      const colTop = Math.min(...c.hangs.map(hangY), tops[tops.length - 1]);
      for (const h of c.hangs) {
        const yRow = hangY(h);
        // T-junction on the Strang unless the Strang ends in this row.
        for (const m of mediaOf(h.node)) if (yRow > colTop) dot(c.x + OFF[m], yRow + OFF[m], m);
        placeHang(h.node, 0, (m) => c.x + OFF[m], yRow);
      }
    } else {
      // Column without Strang: the group rises from the Verteilleitung straight to its storey.
      for (const h of c.hangs) {
        const yRow = hangY(h);
        for (const m of mediaOf(h.node)) {
          draw(h.node.id, m, [...riseFrom(m), [c.x + OFF[m], yRow + OFF[m]]]);
          if (c.from.continues) dot(c.x + OFF[m], yFrom + OFF[m], m);
        }
        placeHang(h.node, 0, (m) => c.x + OFF[m], yRow);
      }
    }
  }

  // --- Zentrale ----------------------------------------------------------------------------------------------------
  drawCentral(data, result, labels, zentrale, lane0, { symbol, label, draw, dot, group });

  return {
    width,
    height,
    bands,
    lines,
    groups,
    used: [...used],
    insulation: [...new Map(bands.map((b) => [`${b.mm}|${b.shared}`, { mm: b.mm, shared: b.shared }])).values()].sort((a, b) => a.mm - b.mm || Number(a.shared) - Number(b.shared)),
  };
}

// ---------------------------------------------------------------------------
// Zentrale
// ---------------------------------------------------------------------------

type CentralGeometry = { trunkItems: SymbolKey[]; xVB: number; spX: number; feedItems: SymbolKey[]; x0: number; height: number };

function centralGeometry(data: SanitaryData, result: SystemResult): CentralGeometry {
  const c = data.central;
  const trunkItems: SymbolKey[] = [];
  if (c.meter) trunkItems.push("shutoff", "meter", "shutoff");
  if (c.filter === "fine") trunkItems.push("filter");
  if (c.filter === "redfil") trunkItems.push("redfil");
  if (c.reducer && c.filter !== "redfil") trunkItems.push("reducer");
  if (c.softener === "all") trunkItems.push("softener");
  const xVB = LEFT + 70 + trunkItems.length * 46;
  const feedItems: SymbolKey[] = ["shutoff"];
  if (c.safetyGroup) feedItems.push("check", "safety");
  if (c.softener === "heater") feedItems.push("softener");
  const spX = xVB + 36 + feedItems.length * 40;
  const hasHot = result.lu.warm > 0 || data.network.some((n) => n.pwh);
  const x0 = hasHot ? spX + 250 : xVB + 60;
  return { trunkItems, xVB, spX, feedItems, x0, height: 190 };
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
  },
) {
  const { symbol, label, draw, dot } = api;
  const c = data.central;
  const Yt = Y + 150;
  const trunk = result.central.trunk?.size;
  // Hausanschluss → Verteilbatterie.
  draw(null, "pwc", [[LEFT - 20, Yt], [g.xVB, Yt]]);
  label(null, LEFT - 18, Yt - 22, labels.house, 8.5, { bold: true });
  label(null, LEFT - 18, Yt - 12, [result.house.dn ? `DN ${result.house.dn}` : "", trunk ? `/ ${trunk.od}` : ""].filter(Boolean).join(" "), 7, { muted: true });
  g.trunkItems.forEach((k, i) => {
    const x = LEFT + 60 + i * 46;
    symbol(null, k, x, Yt);
    if (k === "meter") label(null, x, Yt + 22, labels.meter, 6.5, { anchor: "middle", muted: true });
    if (k === "softener") label(null, x, Yt + 22, labels.softener, 6.5, { anchor: "middle", muted: true });
  });
  // Verteilbatterie: bar from the PWC Verteilung down to the trunk.
  api.group(null, [{ t: "rect", x: g.xVB - 3, y: Y - 8, w: 6, h: Yt - Y + 16, fill: "ink" }]);
  label(null, g.xVB - 8, Y + 40, labels.battery, 6.5, { anchor: "end", muted: true });
  // PWC to the Verteilung.
  draw(null, "pwc", [[g.xVB, Y], [g.x0, Y]]);
  symbol(null, "shutoff", g.xVB + 22, Y);
  if (result.central.supply) label(null, g.xVB + 50, Y - 6, sizeText(result.central.supply.size), 7, { muted: true });
  const hasHot = g.x0 > g.xVB + 60;
  if (!hasHot) return;
  // Cold feed of the heater with the Sicherheitsgruppe.
  draw(null, "pwc", [[g.xVB, Yt], [g.spX, Yt]]);
  g.feedItems.forEach((k, i) => {
    const x = g.xVB + 30 + i * 40;
    symbol(null, k, x, Yt);
    if (k === "softener") label(null, x, Yt + 22, labels.softener, 6.5, { anchor: "middle", muted: true });
  });
  if (result.central.feed) label(null, g.spX - 14, Yt - 6, sizeText(result.central.feed.size), 7, { anchor: "end", muted: true });
  // Wassererwärmer (neutral).
  const top = Y + 48;
  api.group(null, [
    { t: "rect", x: g.spX, y: top, w: 90, h: Yt + 20 - top, rx: 6, fill: "bg", stroke: "ink", sw: 1.4 },
    { t: "text", x: g.spX + 45, y: top + 34, text: c.heaterLabel || labels.heater, size: 8.5, anchor: "middle", fill: "ink", bold: true },
    { t: "text", x: g.spX + 45, y: top + 48, text: [c.heaterVolume ? `${c.heaterVolume} l` : "", `${fmt1(data.settings.tHot)} °C`].filter(Boolean).join(" · "), size: 7.5, anchor: "middle", fill: "muted" },
  ]);
  // PWH out of the heater to the Verteilung, PWH-C back through the pump group.
  const xH = g.spX + 30;
  const xC = g.spX + 70;
  draw(null, "pwh", [[xH, top], [xH, Y + OFF.pwh], [g.x0, Y + OFF.pwh]]);
  if (c.mixer) {
    symbol(null, "mixer", xH + 20, Y + OFF.pwh);
    draw(null, "pwc", [[xH + 20, Y], [xH + 20, Y + OFF.pwh - 5]]);
    dot(xH + 20, Y, "pwc");
  }
  if (result.pump) {
    draw(null, "pwhc", [[g.x0, Y + OFF.pwhc], [xC, Y + OFF.pwhc], [xC, top]]);
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
}

export { sizeText };
