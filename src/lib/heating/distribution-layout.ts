// Prinzipschema Wärmeverteilung (Strangschema) of an Anlage, as drawing primitives shared by the web view and the PDF,
// laid out like the Sanitär Strangschema (src/lib/sanitary/schema.ts):
//
//   floors (top first) ───────────────────────────────────────────  Stockwerkverteilungen with Heizkörper and
//                          │ Strang 1   │ Strang 2 …                  FBH-Verteiler right of each Strang
//   Heizgruppe ═══════════╧════════════╧═══════════                    VL (red) and RL (blue, dashed) as two lines
//
// Each Heizgruppe of 242 starts at the bottom left of its part with a box (Schaltung, temperatures, power, required
// head of its pump); its Verteilleitungen run to the right on lanes, Stränge rise to the storeys. Symbols after SIA 410
// as in the Prinzipschema Wärmeerzeugung (generation-schema.ts).

import { floorOrder } from "@/lib/kwl/schema-layout";
import type { Prim } from "@/lib/kwl/schema-symbols";

import { type DistributionData, type DistributionResult, type GroupResult, type HeatNode, heatPipeText } from "./distribution";
import { drawSymbol as drawHeatSymbol, emitterSymbol, pipeColors, sideOf, type SymbolKey } from "./generation-schema";

export type Line2 = "vl" | "rl";
const OFF: Record<Line2, number> = { vl: 0, rl: 14 };
const SPAN = OFF.rl;
const LINES: Line2[] = ["vl", "rl"];
export const lineColors: Record<Line2, `#${string}`> = { vl: pipeColors.vl, rl: pipeColors.rl };

const DX = 96; // Verteilleitung section
const DX2 = 100; // Stockwerkverteilung section
const RH = 74; // row of a Stockwerkverteilung (lines + the text block above them)
const TEXT_LINE = 9;
const LABEL_W = 170; // terminal text
const LEFT = 64; // storey names
const LANE = 48;
const GROUP_W = 150; // group box and the start of its lines
const TERM_W = 30; // terminal symbol

export type DistributionText = {
  vl: string;
  rl: string;
  insulation: string;
  none: string;
  strang: string;
  /** Schaltung names of the groups, by circuit key. */
  circuit: (group: GroupResult) => string;
  head: string;
};

export type DistributionSymbol = SymbolKey | "thermoValve" | "floorDistributor";

export type DistLine = { d: string; kind: Line2; nodeId: string | null };
export type DistGroup = { nodeId: string | null; prims: Prim[] };
export type DistributionSchema = {
  width: number;
  height: number;
  bands: { d: string; width: number; mm: number }[];
  lines: DistLine[];
  groups: DistGroup[];
  used: DistributionSymbol[];
  insulated: boolean;
};

type Pt = [number, number];
const round = (v: number) => Math.round(v * 10) / 10;
const pathD = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${round(x)},${round(y)}`).join(" ");
const fmt1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString("de-CH");
const fmt0 = (v: number) => Math.round(v).toLocaleString("de-CH");

/** Heizkörperventil (Thermostatventil): Absperrorgan with the thermostatic head above. */
export function thermoValve(x: number, y: number): Prim[] {
  return [
    { t: "polygon", points: `${x - 6},${y - 4.5} ${x},${y} ${x - 6},${y + 4.5}`, fill: "bg", stroke: "ink", sw: 1 },
    { t: "polygon", points: `${x + 6},${y - 4.5} ${x},${y} ${x + 6},${y + 4.5}`, fill: "bg", stroke: "ink", sw: 1 },
    { t: "line", x1: x, y1: y, x2: x, y2: y - 7, stroke: "ink", sw: 0.9 },
    { t: "path", d: `M${x - 4},${y - 7} A4,4 0 0 1 ${x + 4},${y - 7} Z`, fill: "bg", stroke: "ink", sw: 0.9 },
  ];
}

/** FBH-Verteiler: box with the floor coil (2.3.9) on top, VL and RL entering from the left. */
export function floorDistributor(x: number, y: number): Prim[] {
  return [{ t: "rect", x, y: y - 6, w: TERM_W, h: SPAN + 12, fill: "bg", stroke: "ink", sw: 1.1 }, ...emitterSymbol("floor", x + TERM_W / 2, y + SPAN / 2, TERM_W - 8)];
}

type Hang = { node: HeatNode; floor: string; rows: number; depth: number; anchor: number };
type From = { x: number; lane: number; continues: boolean };
type Column = { x: number; lane: number; from: From; chain: HeatNode[]; hangs: Hang[]; width: number };
type Seg = { node: HeatNode; lane: number; x0: number; x1: number; drop: boolean; from: From };
type Start = { group: GroupResult; x: number };

export function layoutDistribution(data: DistributionData, result: DistributionResult, labels: DistributionText): DistributionSchema {
  const groups: DistGroup[] = [];
  const lines: DistLine[] = [];
  const bands: DistributionSchema["bands"] = [];
  const used = new Set<DistributionSymbol>();
  const group = (nodeId: string | null, prims: Prim[]) => prims.length && groups.push({ nodeId, prims });
  const symbol = (nodeId: string | null, key: SymbolKey, x: number, y: number, vertical = false, side: "above" | "below" | "left" | "right" = "above") => {
    used.add(key);
    const dir = vertical ? "up" : "right";
    group(nodeId, drawHeatSymbol(key, x, y, dir, { side: sideOf(dir, side) }));
  };
  const label = (nodeId: string | null, x: number, y: number, s: string, size = 7, opts: { anchor?: "start" | "middle" | "end"; muted?: boolean; bold?: boolean } = {}) =>
    s && group(nodeId, [{ t: "text", x, y, text: s, size, anchor: opts.anchor ?? "start", fill: opts.muted ? "muted" : "ink", bold: opts.bold }]);
  const dot = (x: number, y: number, k: Line2) => group(null, [{ t: "circle", cx: x, cy: y, r: 2.4, fill: lineColors[k] }]);

  const sec = (n: HeatNode) => result.sections.get(n.id);
  const isTerminal = (n: HeatNode) => n.type !== "pipe";
  const isDist = (n: HeatNode) => n.type === "pipe" && !n.riser && sec(n)?.role === "distribution";
  const floorOf = (n: HeatNode): string => {
    if (n.floor) return n.floor;
    for (const c of n.children) {
      const f = floorOf(c);
      if (f) return f;
    }
    return "";
  };
  const leaves = (n: HeatNode): number => (n.children.length ? n.children.reduce((s, c) => s + leaves(c), 0) : 1);
  const depth = (n: HeatNode): number => (n.children.length ? 1 + Math.max(...n.children.map(depth)) : 0);

  // --- Pass A: x positions, lanes, columns; one part per Heizgruppe ----------------------------------------------
  let cursor = LEFT + 20;
  let lanes = 0;
  const columns: Column[] = [];
  const segs: Seg[] = [];
  const starts: Start[] = [];

  const makeColumn = (n: HeatNode, from: From) => {
    const chain: HeatNode[] = [];
    const hangs: Hang[] = [];
    const hang = (h: HeatNode, anchor: number, floorFallback: string) => hangs.push({ node: h, floor: floorOf(h) || floorFallback, rows: leaves(h), depth: depth(h), anchor });
    if (n.type === "pipe" && n.riser) {
      let cur: HeatNode | undefined = n;
      while (cur) {
        chain.push(cur);
        const idx = chain.length - 1;
        const section: HeatNode = cur;
        const next = section.children.find((c) => c.type === "pipe" && c.riser);
        section.children.filter((c) => c !== next).forEach((c) => hang(c, idx, section.floor));
        cur = next;
      }
    } else hang(n, -1, "");
    const width = Math.max(130, ...hangs.map((h) => 40 + (h.depth + 1) * DX2 + LABEL_W));
    columns.push({ x: cursor, lane: from.lane, from, chain, hangs, width });
    cursor += width;
  };
  const placeChildren = (kids: HeatNode[], from: { x: number; lane: number }) => {
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
  for (const g of result.groups) {
    const roots = data.networks[g.group.id] ?? [];
    if (!roots.length) continue;
    starts.push({ group: g, x: cursor });
    cursor += GROUP_W;
    placeChildren(roots, { x: cursor, lane: 0 });
    cursor += 40;
  }

  // --- Floors ---------------------------------------------------------------------------------------------------
  const floorNames = [...new Set(columns.flatMap((c) => [...c.hangs.map((h) => h.floor), ...c.chain.map((s) => s.floor)]))].sort((a, b) =>
    a === "" ? 1 : b === "" ? -1 : floorOrder(a) - floorOrder(b),
  );
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
    const h = 56 + Math.max(1, rowsAt.get(f) ?? 1) * RH;
    floorY.set(f, { y0: y, y1: y + h, row: y + 56 });
    y += h;
  }
  const lane0 = y + 150;
  const laneY = (lane: number) => lane0 + lane * LANE;
  const width = Math.max(cursor + 20, 400);
  const height = laneY(lanes) + 90;

  for (const f of floorNames) {
    const band = floorY.get(f)!;
    group(null, [
      { t: "line", x1: LEFT - 50, y1: band.y1, x2: width - 10, y2: band.y1, stroke: "muted", sw: 0.5, dash: "6 4" },
      { t: "text", x: LEFT - 48, y: band.y0 + 16, text: f || "–", size: 10, fill: "muted", bold: true },
    ]);
  }

  const draw = (nodeId: string | null, k: Line2, points: Pt[]) => lines.push({ d: pathD(points), kind: k, nodeId });
  const bandsOf = (n: HeatNode, paths: Partial<Record<Line2, Pt[]>>) => {
    const r = sec(n);
    if (!r) return;
    if (paths.vl && r.insVl) bands.push({ d: pathD(paths.vl), width: 10, mm: r.insVl });
    if (paths.rl && r.insRl) bands.push({ d: pathD(paths.rl), width: 10, mm: r.insRl });
  };
  /** Text of a Leitung: size and insulation of VL / RL, then flow and Δp. */
  const lineText = (n: HeatNode): string[] => {
    const r = sec(n);
    if (!r) return [];
    const mm = (v: number) => (v ? `${v} mm` : labels.none);
    const out = r.insVl === r.insRl ? [`${labels.vl}/${labels.rl}: ${heatPipeText(r.pipe)} · ${mm(r.insVl)}`] : [`${labels.vl}: ${heatPipeText(r.pipe)} · ${mm(r.insVl)}`, `${labels.rl}: ${heatPipeText(r.pipe)} · ${mm(r.insRl)}`];
    out.push(`${fmt0(r.massFlow)} kg/h · ${fmt1(r.dp)} kPa`);
    return out;
  };
  const textBlock = (nodeId: string, x: number, yBottom: number, list: string[], anchor: "start" | "middle" | "end", title = false) =>
    list.forEach((l, i) => label(nodeId, x, yBottom - (list.length - 1 - i) * TEXT_LINE, l, i === 0 && title ? 7.5 : 7, { anchor, muted: !(i === 0 && title), bold: i === 0 && title }));
  const titleOf = (n: HeatNode, withLabel = true) => [withLabel ? n.label : "", n.length ? `${fmt1(n.length)} m` : ""].filter(Boolean).join(" · ");

  /** A terminal at x (left edge) on the row: symbol and its text (name, power, arriving Vorlauf temperature). */
  const terminal = (n: HeatNode, x: number, yRow: number) => {
    const t = result.terminals.get(n.id);
    if (n.type === "radiator") {
      used.add("thermoValve");
      used.add("radiator");
      group(n.id, [...thermoValve(x - 10, yRow + OFF.vl), { t: "rect", x, y: yRow - 5, w: TERM_W, h: SPAN + 10, fill: "bg", stroke: "ink", sw: 1.2 }]);
      symbol(n.id, "regValve", x - 10, yRow + OFF.rl);
    } else if (n.type === "floor") {
      used.add("floorDistributor");
      group(n.id, floorDistributor(x, yRow));
    } else {
      used.add("apparatus");
      group(n.id, [{ t: "rect", x, y: yRow - 6, w: TERM_W, h: SPAN + 12, fill: "bg", stroke: "ink", sw: 1.2 }]);
    }
    label(n.id, x + TERM_W + 8, yRow + 3, t?.name || n.label || "–", 8);
    if (t) label(n.id, x + TERM_W + 8, yRow + 13, `${fmt0(t.power)} W · ${fmt0(t.massFlow)} kg/h · ${fmt1(t.tArrive)} °C`, 7, { muted: true });
  };

  // --- Heizgruppen: box at the start of each part ---------------------------------------------------------------
  for (const s of starts) {
    const g = s.group;
    const yL = laneY(0);
    const bx = s.x;
    const by = yL - 10;
    group(null, [
      { t: "rect", x: bx, y: by, w: GROUP_W - 40, h: SPAN + 54, fill: "bg", stroke: "ink", sw: 1.2 },
      { t: "text", x: bx + 6, y: by + 12, text: g.group.name, size: 8, fill: "ink", bold: true },
      { t: "text", x: bx + 6, y: by + 23, text: labels.circuit(g), size: 6.5, fill: "muted" },
      { t: "text", x: bx + 6, y: by + 33, text: `${fmt1(g.supplyTemp)}/${fmt1(g.returnTemp)} °C · ${fmt1(g.power / 1000)} kW`, size: 6.5, fill: "muted" },
      { t: "text", x: bx + 6, y: by + 43, text: `${labels.head} ${fmt1(g.critical)} kPa · ${fmt0(g.massFlow)} kg/h`, size: 6.5, fill: "muted" },
    ]);
    for (const k of LINES) draw(null, k, [[bx + GROUP_W - 40, yL + OFF[k]], [bx + GROUP_W, yL + OFF[k]]]);
  }

  // --- Verteilleitung ------------------------------------------------------------------------------------------
  for (const s of segs) {
    const yL = laneY(s.lane);
    const yFrom = laneY(s.from.lane);
    const paths: Partial<Record<Line2, Pt[]>> = {};
    for (const k of LINES) {
      const pts: Pt[] = s.drop
        ? [[s.x0, yFrom + OFF[k]], [s.x0 + SPAN - OFF[k], yFrom + OFF[k]], [s.x0 + SPAN - OFF[k], yL + OFF[k]], [s.x1, yL + OFF[k]]]
        : [[s.x0, yL + OFF[k]], [s.x1, yL + OFF[k]]];
      paths[k] = pts;
      draw(s.node.id, k, pts);
      if (s.drop) dot(s.x0 + SPAN - OFF[k], yFrom + OFF[k], k);
    }
    bandsOf(s.node, paths);
    const title = titleOf(s.node);
    textBlock(s.node.id, s.x1 - DX / 2, yL - 11, [...(title ? [title] : []), ...lineText(s.node)], "middle", !!s.node.label);
    if (s.node.shutoff) for (const k of LINES) symbol(s.node.id, "ball", s.x1 - DX + 18, yL + OFF[k]);
  }

  // --- Columns (Stränge and Stockwerkverteilungen) ---------------------------------------------------------------
  for (const c of columns) {
    const yL = laneY(c.lane);
    const yFrom = laneY(c.from.lane);
    const hangY = (h: Hang) => floorY.get(h.floor)!.row + (rowIndex.get(h) ?? 0) * RH;
    const riseFrom = (k: Line2): Pt[] => [[c.from.x, yFrom + OFF[k]], [c.x + OFF[k], yFrom + OFF[k]]];

    const placeHang = (n: HeatNode, d: number, start: (k: Line2) => number, yRow: number): number => {
      const endX = c.x + 30 + (d + 1) * DX2;
      if (isTerminal(n)) {
        const x = Math.max(start("rl") + 30, c.x + 50);
        for (const k of LINES) draw(n.id, k, [[start(k), yRow + OFF[k]], [x, yRow + OFF[k]]]);
        terminal(n, x, yRow);
        return 1;
      }
      const paths: Partial<Record<Line2, Pt[]>> = {};
      for (const k of LINES) {
        paths[k] = [[start(k), yRow + OFF[k]], [endX, yRow + OFF[k]]];
        draw(n.id, k, paths[k]!);
      }
      bandsOf(n, paths);
      const title = titleOf(n);
      textBlock(n.id, endX - 4, yRow - 10, [...(title ? [title] : []), ...lineText(n)], "end", !!n.label);
      if (n.shutoff) for (const k of LINES) symbol(n.id, "ball", start("rl") + 26, yRow + OFF[k]);
      let rows = 0;
      n.children.forEach((child, i) => {
        const cy = yRow + rows * RH;
        if (i === 0) {
          rows += placeHang(child, d + 1, () => endX, cy);
          return;
        }
        const bx = (k: Line2) => endX + SPAN - OFF[k];
        for (const k of LINES) {
          draw(child.id, k, [[endX, yRow + OFF[k]], [bx(k), yRow + OFF[k]]]);
          dot(bx(k), yRow + OFF[k], k);
        }
        rows += placeHang(child, d + 1, bx, cy);
        for (const k of LINES) draw(child.id, k, [[bx(k), yRow + OFF[k]], [bx(k), cy + OFF[k]]]);
      });
      return Math.max(1, rows);
    };

    if (c.chain.length) {
      const tops: number[] = [];
      c.chain.forEach((s, i) => {
        const own = c.hangs.filter((h) => h.anchor === i).map(hangY);
        const storey = s.floor && floorY.get(s.floor) ? floorY.get(s.floor)!.row : null;
        const candidates = [...own, ...(storey !== null ? [storey] : [])];
        const prev = i ? tops[i - 1] : yL - 130;
        tops.push(Math.min(prev, candidates.length ? Math.min(...candidates) : prev - 30));
      });
      const foot = c.chain[0];
      c.chain.forEach((s, i) => {
        const y1 = tops[i];
        const paths: Partial<Record<Line2, Pt[]>> = {};
        for (const k of LINES) {
          const x = c.x + OFF[k];
          const pts: Pt[] = i ? [[x, tops[i - 1] + OFF[k]], [x, y1 + OFF[k]]] : [...riseFrom(k), [x, y1 + OFF[k]]];
          paths[k] = pts;
          draw(s.id, k, pts);
          if (!i && c.from.continues) dot(x, yFrom + OFF[k], k);
        }
        bandsOf(s, paths);
        const title = titleOf(s, i > 0);
        const lower = i ? tops[i - 1] : yL - 110;
        textBlock(s.id, c.x - 8, Math.min(lower - 10, y1 + RH - 8), [...(title ? [title] : []), ...lineText(s)], "end");
      });
      // Foot of the Strang: Absperrungen in VL and RL, Strangregulierventil in the RL.
      for (const k of LINES) symbol(foot.id, "ball", c.x + OFF[k], yL - 26 - OFF[k] * 1.5, true, "right");
      if (foot.regValve) symbol(foot.id, "regValve", c.x + OFF.rl, yL - 82, true, "right");
      label(foot.id, c.x + SPAN / 2, tops[tops.length - 1] - 14, foot.label || `${labels.strang} ${sec(foot)?.strang ?? ""}`, 8.5, { anchor: "middle", bold: true });

      const colTop = Math.min(...c.hangs.map(hangY), tops[tops.length - 1]);
      for (const h of c.hangs) {
        const yRow = hangY(h);
        for (const k of LINES) if (yRow > colTop) dot(c.x + OFF[k], yRow + OFF[k], k);
        placeHang(h.node, 0, (k) => c.x + OFF[k], yRow);
      }
    } else {
      for (const h of c.hangs) {
        const yRow = hangY(h);
        for (const k of LINES) {
          draw(h.node.id, k, [...riseFrom(k), [c.x + OFF[k], yRow + OFF[k]]]);
          if (c.from.continues) dot(c.x + OFF[k], yFrom + OFF[k], k);
        }
        placeHang(h.node, 0, (k) => c.x + OFF[k], yRow);
      }
    }
  }

  return { width, height, bands, lines, groups, used: [...used], insulated: bands.length > 0 };
}
