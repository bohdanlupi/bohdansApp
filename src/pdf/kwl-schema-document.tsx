import type { ReactNode } from "react";

import { Circle, Document, G, Image, Line, Page, Path, Polygon, Rect, Svg, Text } from "@react-pdf/renderer";

import type { NetNode } from "@/lib/kwl/network";
import type { DuctMaterial } from "@/lib/kwl/pressure";
import { measuredCoverPrefix } from "@/lib/kwl/products";
import { type InsulationClass, insulationClasses, insulationStyles } from "@/lib/kwl/insulation";
import { airColors, type AirKind, edgePath, type SchemaLayout } from "@/lib/kwl/schema-layout";
import type { SchemaRevision } from "@/lib/kwl/schema-plan";
import { type DeviceExtras, deviceSymbols, drawSymbol, elementLabel, insulationBands, type LegendKey, nodeSymbol, type Paint, type Prim, terminalParts } from "@/lib/kwl/schema-symbols";
import type { FirmSettings } from "@/lib/supabase/types";

import { winAnsi } from "./kwl-document";
import type { LogoSource } from "./letterhead";

// Prinzipschema of a ventilation system as a plan: sheet like the Sanitär and Heizung plans (height 297 / 420 /
// 594 mm, width a multiple of 210 mm, wider than high), frame, the schema, a legend of the symbols it uses over the
// LUPI title block (Plankopf, after vorlagen/Vorlage_Plankopf.pdf: project, address, logo + firm, Anlage, SIA phase, plan type, format, trade,
// revision list A–F).

const ink = "#111111";
const muted = "#666666";
const blue = "#0000ff";

const pdfPaint = (p: Paint | undefined) => (p === undefined ? undefined : p === "ink" ? ink : p === "bg" ? "#ffffff" : p === "muted" ? muted : p);

const MM = 72 / 25.4;
/** Plan sheets: height 297, 420 or 594 mm, width a multiple of 210 mm (folds to A4), always wider than high. */
const HEIGHTS = [297, 420, 594];
const WIDTH_STEP = 210;
/** Frame distance from the sheet edge and padding inside the frame [pt]. */
export const MARGIN = 14;
export const PAD = 12;
/** Title block of the template (same physical size on every format) [pt]. */
export const TB_W = 566;
export const TB_H = 213;

/** Legend box above the title block (same width): title band, entries in rows of LEGEND_ROW, drawn LEGEND_SCALE up. */
const LEGEND_SCALE = 1.25;
const LEGEND_ROW = 21;
const LEGEND_HEAD = 28;
const LEGEND_PAD = 10;
/** Entries draw their line or symbol at 0…30 (local units, centre line y = 0) and the text from 40. */
const LEGEND_TEXT_X = 40;
const LEGEND_TEXT = 8;
const LEGEND_NOTE = 7.5;
/** Line distance of a label wrapped onto two rows (local units). */
const LEGEND_LINE = 10;

/** Advance widths of Helvetica (1/1000 em) for ASCII 32–126; other characters count as 556. */
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667,
  722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556,
  278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const textWidth = (text: string, size: number) =>
  ([...text].reduce((s, c) => {
    const code = c.charCodeAt(0);
    return s + (code >= 32 && code <= 126 ? HELVETICA[code - 32] : c === "·" ? 278 : 556);
  }, 0) *
    size) /
  1000;

/** Text lines of a label in `width` (local units): one line, else wrapped at the word closest to the middle. */
function wrapLabel(text: string, size: number, width: number): string[] {
  if (textWidth(text, size) <= width) return [text];
  const words = text.split(" ");
  let best: string[] = [text];
  let bestWidth = Infinity;
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
    const w = Math.max(...lines.map((l) => textWidth(l, size)));
    if (w < bestWidth) [best, bestWidth] = [lines, w];
  }
  return best;
}

/** One legend entry: its line or symbol (drawn at 0…30 around y = 0) and label; a note has no symbol, smaller grey text. */
export type LegendItem = { key: string; label: string; symbol?: ReactNode; note?: boolean };
type LegendCell = { item: LegendItem; lines: string[]; col: number; row: number };
export type LegendBox = { colW: number; h: number; cells: LegendCell[] };

/**
 * Legend box for the items: two columns (more only when the rows would not fit the sheet height above the title
 * block). Labels too long for a column wrap onto two rows; those entries go last, to the bottom of the right column.
 */
export function legendBox(items: LegendItem[], sheetH: number): LegendBox {
  const inner = TB_W - 2 * LEGEND_PAD;
  const maxRows = Math.max(1, Math.floor((sheetH - 2 * MARGIN - 2 * PAD - TB_H - LEGEND_HEAD - 2) / LEGEND_ROW));
  let box: LegendBox = { colW: inner, h: LEGEND_HEAD + 2, cells: [] };
  for (let columns = 2; columns <= 6; columns++) {
    const colW = inner / columns;
    const room = colW / LEGEND_SCALE - 6;
    const measured = items.map((item) => ({ item, lines: item.note ? wrapLabel(item.label, LEGEND_NOTE, room) : wrapLabel(item.label, LEGEND_TEXT, room - LEGEND_TEXT_X) }));
    const ordered = [...measured.filter((m) => m.lines.length === 1), ...measured.filter((m) => m.lines.length > 1)];
    const slots = ordered.reduce((s, m) => s + m.lines.length, 0);
    // Fewest rows that take all entries column by column (an entry is never split between two columns).
    for (let rows = Math.max(1, Math.ceil(slots / columns)); ; rows++) {
      const cells: LegendCell[] = [];
      let col = 0;
      let row = 0;
      for (const m of ordered) {
        if (row + m.lines.length > rows) [col, row] = [col + 1, 0];
        cells.push({ ...m, col, row });
        row += m.lines.length;
      }
      if (col < columns) {
        box = { colW, h: LEGEND_HEAD + rows * LEGEND_ROW + 2, cells };
        break;
      }
    }
    if ((box.h - LEGEND_HEAD - 2) / LEGEND_ROW <= maxRows) break;
  }
  return box;
}

/** The legend box at (x, y): frame, title and the entries. */
export function Legend({ x, y, box, title }: { x: number; y: number; box: LegendBox; title: string }) {
  return (
    <G>
      <Rect x={x} y={y} width={TB_W} height={box.h} fill="#ffffff" stroke={ink} strokeWidth={0.8} />
      {svgText(x + LEGEND_PAD, y + 18, title, 12.5, { bold: true })}
      <Line x1={x} y1={y + 26} x2={x + TB_W} y2={y + 26} stroke={ink} strokeWidth={0.4} />
      {box.cells.map(({ item, lines, col, row }) => {
        // Origin on the centre line of the entry (between its rows when wrapped), scaled up by LEGEND_SCALE.
        const cy = y + LEGEND_HEAD + 11 + (row + (lines.length - 1) / 2) * LEGEND_ROW;
        const top = (-(lines.length - 1) * LEGEND_LINE) / 2 + 3;
        return (
          <G key={item.key} transform={`translate(${x + LEGEND_PAD + col * box.colW}, ${cy}) scale(${LEGEND_SCALE})`}>
            {item.symbol}
            {lines.map((l, i) => (
              <G key={i}>{item.note ? svgText(0, top + i * LEGEND_LINE, l, LEGEND_NOTE, { fill: muted }) : svgText(LEGEND_TEXT_X, top + i * LEGEND_LINE, l, LEGEND_TEXT)}</G>
            ))}
          </G>
        );
      })}
    </G>
  );
}

/**
 * Scale and offset of the schema on a W × H sheet whose bottom right holds the legend box over the title block
 * (column TB_W × colH): centred left of that column at full height, or above it at full width – whichever is larger.
 */
export function placeSchema(W: number, H: number, layout: { width: number; height: number }, colH: number, maxScale: number) {
  const left = { w: W - 2 * MARGIN - 3 * PAD - TB_W, h: H - 2 * MARGIN - 2 * PAD };
  const above = { w: W - 2 * MARGIN - 2 * PAD, h: H - 2 * MARGIN - 3 * PAD - colH };
  const fit = (a: { w: number; h: number }) => Math.min(a.w / layout.width, a.h / layout.height, maxScale);
  const area = fit(above) >= fit(left) ? above : left;
  const scale = fit(area);
  return { scale, dx: MARGIN + PAD + (area.w - layout.width * scale) / 2, dy: MARGIN + PAD + (area.h - layout.height * scale) / 2 };
}

/**
 * Sheet [mm], legend box and placement of a schema (Lüftung, Sanitär, Heizung): the lowest height that draws it at
 * `minScale` – left of the legend + title block column at full height, or above it at full width – and the narrower
 * width it needs in steps of 210 mm, at least one step wider than high.
 */
export function planSheet(layout: { width: number; height: number }, items: LegendItem[], { minScale, maxScale }: { minScale: number; maxScale: number }) {
  const widthMm = (pt: number, hMm: number) => Math.max(Math.floor(hMm / WIDTH_STEP) + 1, Math.ceil(pt / MM / WIDTH_STEP - 1e-9)) * WIDTH_STEP;
  const candidates = HEIGHTS.flatMap((hMm) => {
    const h = hMm * MM;
    const legend = legendBox(items, h);
    const left = Math.min((h - 2 * MARGIN - 2 * PAD) / layout.height, maxScale);
    const above = Math.min((h - 2 * MARGIN - 3 * PAD - legend.h - TB_H) / layout.height, maxScale);
    return [
      { hMm, scale: left, wMm: widthMm(layout.width * left + 2 * MARGIN + 3 * PAD + TB_W, hMm) },
      { hMm, scale: above, wMm: widthMm(Math.max(layout.width * above, TB_W) + 2 * MARGIN + 2 * PAD, hMm) },
    ];
  });
  const fitting = candidates.filter((c) => c.scale >= minScale).sort((a, b) => a.hMm - b.hMm || a.wMm - b.wMm);
  const { hMm, wMm } = fitting[0] ?? candidates.filter((c) => c.hMm === HEIGHTS[HEIGHTS.length - 1]).sort((a, b) => b.scale - a.scale)[0];
  const w = wMm * MM;
  const h = hMm * MM;
  const legend = legendBox(items, h);
  return { wMm, hMm, w, h, legend, ...placeSchema(w, h, layout, legend.h + TB_H, maxScale), name: `${hMm} × ${wMm}` };
}

export function PdfPrims({ prims }: { prims: Prim[] }) {
  return (
    <G>
      {prims.map((p, i) => {
        switch (p.t) {
          case "rect":
            return <Rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={p.rx} fill={pdfPaint(p.fill)} stroke={pdfPaint(p.stroke)} strokeWidth={p.sw} />;
          case "line":
            return <Line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={pdfPaint(p.stroke)} strokeWidth={p.sw} strokeDasharray={p.dash} />;
          case "circle":
            return <Circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={pdfPaint(p.fill)} stroke={pdfPaint(p.stroke)} strokeWidth={p.sw} />;
          case "path":
            return <Path key={i} d={p.d} fill={pdfPaint(p.fill)} stroke={pdfPaint(p.stroke)} strokeWidth={p.sw} strokeDasharray={p.dash} />;
          case "polygon":
            return <Polygon key={i} points={p.points} fill={pdfPaint(p.fill)} stroke={pdfPaint(p.stroke)} strokeWidth={p.sw} />;
          case "text":
            return (
              <Text key={i} x={p.x} y={p.y} textAnchor={p.anchor ?? "start"} fill={pdfPaint(p.fill)} style={{ fontSize: p.size, fontFamily: p.bold ? "Helvetica-Bold" : "Helvetica" }}>
                {winAnsi(p.text)}
              </Text>
            );
        }
      })}
    </G>
  );
}

export const svgText = (x: number, y: number, value: string, size: number, opts: { anchor?: "start" | "middle" | "end"; fill?: string; bold?: boolean } = {}) => (
  <Text x={x} y={y} textAnchor={opts.anchor ?? "start"} fill={opts.fill ?? ink} style={{ fontSize: size, fontFamily: opts.bold ? "Helvetica-Bold" : "Helvetica" }}>
    {winAnsi(value)}
  </Text>
);

export type SchemaLabels = {
  device: string;
  deviceLines: string[];
  attachments: DeviceExtras;
  /** Short air types (AUL, ZUL, ABL, FOL) and their names for the legend. */
  airShort: Record<AirKind, string>;
  air: Record<AirKind, string>;
  /** Material name of ducts without product. */
  material: (m: DuctMaterial) => string;
  legendTitle: string;
  legend: Record<LegendKey, string>;
  /** Insulation classes for the legend («Dämmung 30 mm», «Brandschutzdämmung EI30»). */
  insulation: Record<InsulationClass, string>;
};

/** The schema in its own coordinates (layout units). */
function SchemaDrawing({ layout, labels, info }: { layout: SchemaLayout; labels: SchemaLabels; info: (node: NetNode) => string }) {
  const { width, device, airY } = layout;
  const bands = insulationBands(layout);
  return (
    <G>
      {layout.floors.map((f, i) => (
        <G key={`${f.air}-${f.floor}-${i}`}>
          <Rect x={width - 60} y={f.y0} width={56} height={Math.max(f.y1 - f.y0, 10)} rx={3} fill="#f1f1f1" />
          {svgText(width - 32, (f.y0 + f.y1) / 2 + 4, f.floor || "–", 10, { anchor: "middle", fill: muted })}
        </G>
      ))}
      {bands.edges.map((b, i) => (
        <Path key={`ie${i}`} d={b.d} fill="none" stroke={b.stroke} strokeWidth={b.width} strokeDasharray={b.dash} />
      ))}
      {bands.fills.map((b, i) => (
        <Path key={`if${i}`} d={b.d} fill="none" stroke={b.stroke} strokeWidth={b.width} />
      ))}
      {layout.edges.map((e, i) => (
        <Path key={i} d={edgePath(e)} fill="none" stroke={airColors[e.air]} strokeWidth={1.8} />
      ))}
      <PdfPrims prims={deviceSymbols(layout, labels.device, labels.deviceLines, labels.attachments)} />
      {svgText(device.x + 6, airY.supply + 28, labels.airShort.outdoor, 9.5, { fill: airColors.outdoor, bold: true })}
      {svgText(device.x + 6, airY.extract + 28, labels.airShort.exhaust, 9.5, { fill: airColors.exhaust, bold: true })}
      {svgText(device.x + device.w - 6, airY.supply + 28, labels.airShort.supply, 9.5, { anchor: "end", fill: airColors.supply, bold: true })}
      {svgText(device.x + device.w - 6, airY.extract + 28, labels.airShort.extract, 9.5, { anchor: "end", fill: airColors.extract, bold: true })}
      {layout.nodes.map(({ node, air, x, y }) => {
        const { prims, top } = nodeSymbol(node, air, x, y);
        return (
          <G key={node.id}>
            <PdfPrims prims={prims} />
            {elementLabel(node, labels.material) && svgText(x, y - top - 15, elementLabel(node, labels.material), 8, { anchor: "middle" })}
            {node.type !== "terminal" && svgText(x, y - top - 5, info(node), 8, { anchor: "middle", fill: muted })}
          </G>
        );
      })}
      {layout.labels.map((l) => {
        const node = layout.nodes.find((x) => x.node.id === l.nodeId)?.node;
        const parts = node ? terminalParts(node, measuredCoverPrefix) : "";
        const r = node ? info(node) : "";
        return (
          <G key={l.nodeId}>
            {svgText(l.x, l.y + 1, l.text, 10)}
            {svgText(l.x, l.y + 13, [parts, r].filter(Boolean).join(" · "), 7.5, { fill: muted })}
          </G>
        );
      })}
    </G>
  );
}

/** Scale of the schema: at least 0.94 (smallest texts, 7.5–8 units, ≈ 7 pt on paper), at most 1.6. */
const MIN_SCALE = 0.94;
const MAX_SCALE = 1.6;
const legendAirs: AirKind[] = ["outdoor", "supply", "extract", "exhaust"];

/** Legend entries: air types (line colours), insulation classes, then the symbols. */
function legendItems(keys: LegendKey[], insulation: InsulationClass[], labels: SchemaLabels): LegendItem[] {
  return [
    ...legendAirs.map((a) => ({
      key: a,
      label: `${labels.airShort[a]}  ${labels.air[a]}`,
      symbol: <Line x1={0} y1={0} x2={30} y2={0} stroke={airColors[a]} strokeWidth={2} />,
    })),
    ...insulation.map((c) => {
      const style = insulationStyles[c];
      return {
        key: c,
        label: labels.insulation[c],
        symbol: (
          <G>
            <Line x1={0} y1={0} x2={30} y2={0} stroke={style.edge} strokeWidth={style.width} strokeDasharray="1.2 2.2" />
            <Line x1={0} y1={0} x2={30} y2={0} stroke={style.fill} strokeWidth={style.width - 2.4} />
            <Line x1={0} y1={0} x2={30} y2={0} stroke="#555555" strokeWidth={1.2} />
          </G>
        ),
      };
    }),
    ...keys.map((key) => {
      // Symbols scaled to the row height (at most 80 %), on a short grey line where they sit on a duct.
      const onLine = ["flow", "bend", "tee", "reducer", "supplyTerminal", "extractTerminal"].includes(key);
      const { prims, top } = drawSymbol(key, 0, 0, "#555555", 1);
      const size = Math.min(0.8, 13 / (2 * top));
      return {
        key,
        label: labels.legend[key],
        symbol: (
          <G>
            {onLine && <Line x1={0} y1={0} x2={30} y2={0} stroke="#555555" strokeWidth={1.2} />}
            <G transform={`translate(15, 0) scale(${size})`}>
              <PdfPrims prims={prims} />
            </G>
          </G>
        ),
      };
    }),
  ];
}

export type PlankopfLabels = {
  plan: string;
  trade: string;
  index: string;
  initials: string;
  date: string;
  comment: string;
  parcel: string;
};

/** Title block after the LUPI template (A3: 566 × 213 pt, bottom right inside the frame). */
export function TitleBlock({
  x,
  y,
  project,
  system,
  phase,
  format,
  revisions,
  firm,
  labels,
  tradeColor = blue,
}: {
  x: number;
  y: number;
  project: { name: string; street: string | null; zip: string | null; city: string | null; parcel: string | null };
  system: string;
  phase: string;
  format: string;
  revisions: SchemaRevision[];
  firm: FirmSettings;
  labels: PlankopfLabels;
  /** Colour of the trade in the title block (Lüftung blue, Sanitär the green of the LUPI logo). */
  tradeColor?: string;
}) {
  const L = 226; // logo column
  const R = x + L; // right part
  const rows = { head: 70, r1: 22, r2: 22, th: 14 };
  const y1 = y + rows.head;
  const y2 = y1 + rows.r1;
  const y3 = y2 + rows.r2;
  const y4 = y3 + rows.th;
  const revH = (y + TB_H - y4) / 6;
  const cols = [R, R + 34, R + 68, R + 119, x + TB_W];
  const line = (x1: number, ya: number, x2: number, yb: number, w = 0.6) => <Line x1={x1} y1={ya} x2={x2} y2={yb} stroke={ink} strokeWidth={w} />;
  const address = [project.street, [project.zip, project.city].filter(Boolean).join(" "), project.parcel ? `${labels.parcel} ${project.parcel}` : ""].filter(Boolean).join(", ");
  const shown = revisions.slice(-6);
  const fmtDate = (d: string) => d.split("-").reverse().join(".");
  const firmLines = [firm.name, [firm.street, [firm.zip, firm.city].filter(Boolean).join(" ")].filter(Boolean).join(", "), [firm.phone, firm.email].filter(Boolean).join(" - ")].filter(Boolean);

  return (
    <G>
      <Rect x={x} y={y} width={TB_W} height={TB_H} fill="#ffffff" stroke={ink} strokeWidth={0.8} />
      {svgText(x + 10, y + 30, project.name, 21)}
      {svgText(x + 10, y + 58, address, 14)}
      {line(x, y1, x + TB_W, y1)}
      {line(R, y1, R, y + TB_H)}
      {/* Anlage | SIA phase */}
      {svgText(R + 5, y1 + 16, system, 12.5)}
      {line(R + 170, y1, R + 170, y3)}
      {svgText(R + 175, y1 + 16, phase, 12.5)}
      {line(R, y2, x + TB_W, y2)}
      {/* Plan type | format | trade */}
      {svgText(R + 5, y2 + 16, labels.plan, 12.5)}
      {line(R + 119, y2, R + 119, y3)}
      {/* «A3» … or a free sheet «420 × 1050» (mm), smaller to fit the cell. */}
      {svgText(R + 145, y2 + 16, format, format.length > 4 ? 7.5 : 12.5, { anchor: "middle" })}
      {svgText(R + 175, y2 + 16, labels.trade, 12.5, { fill: tradeColor })}
      {line(R, y3, x + TB_W, y3)}
      {/* Revision list */}
      {[labels.index, labels.initials, labels.date, labels.comment].map((h, i) => (
        <G key={h}>{svgText(cols[i] + 3, y3 + 10, h, 7)}</G>
      ))}
      {line(R, y4, x + TB_W, y4)}
      {cols.slice(1, 4).map((cx) => (
        <G key={cx}>{line(cx, y3, cx, y + TB_H)}</G>
      ))}
      {Array.from({ length: 6 }, (_, i) => {
        const r = shown[i];
        const ry = y4 + i * revH;
        return (
          <G key={i}>
            {i > 0 && line(R, ry, x + TB_W, ry, 0.4)}
            {svgText(cols[0] + 3, ry + revH - 4, r?.index ?? String.fromCharCode(65 + i + Math.max(0, revisions.length - 6)), 7.5)}
            {svgText(cols[1] + 3, ry + revH - 4, r?.initials ?? "...", 7.5)}
            {svgText(cols[2] + 3, ry + revH - 4, r ? fmtDate(r.date) : "...", 7.5)}
            {svgText(cols[3] + 3, ry + revH - 4, r?.comment ?? "...", 7.5)}
          </G>
        );
      })}
      {/* Firm below the logo */}
      {firmLines.map((l, i) => (
        <G key={i}>{svgText(x + 10, y + TB_H - 10 - (firmLines.length - 1 - i) * 13, l, 10)}</G>
      ))}
    </G>
  );
}

export function KwlSchemaDocument({
  layout,
  labels,
  info,
  legend,
  plankopf,
  project,
  system,
  phase,
  revisions,
  firm,
  logo,
}: {
  layout: SchemaLayout;
  labels: SchemaLabels;
  info: (node: NetNode) => string;
  legend: LegendKey[];
  plankopf: PlankopfLabels;
  project: { name: string; street: string | null; zip: string | null; city: string | null; parcel: string | null };
  system: string;
  phase: string;
  revisions: SchemaRevision[];
  firm: FirmSettings;
  logo: LogoSource | null;
}) {
  const insulation = insulationClasses.filter((c) => layout.edges.some((e) => e.insulation === c));
  const items = legendItems(legend, insulation, labels);
  const sheet = planSheet(layout, items, { minScale: MIN_SCALE, maxScale: MAX_SCALE });
  const { scale, dx, dy, legend: box } = sheet;
  const W = sheet.w;
  const H = sheet.h;
  const tbX = W - MARGIN - TB_W;
  const tbY = H - MARGIN - TB_H;

  return (
    <Document title={`${plankopf.plan} ${system}`}>
      <Page size={[W, H]} style={{ fontFamily: "Helvetica" }}>
        {/* A hair smaller than the sheet, so react-pdf does not try to wrap it onto a second page. */}
        <Svg width={W} height={H - 1} viewBox={`0 0 ${W} ${H - 1}`} style={{ position: "absolute", top: 0, left: 0 }}>
          <Rect x={MARGIN} y={MARGIN} width={W - 2 * MARGIN} height={H - 2 * MARGIN} fill="none" stroke={ink} strokeWidth={0.8} />
          <G transform={`translate(${dx}, ${dy}) scale(${scale})`}>
            <SchemaDrawing layout={layout} labels={labels} info={info} />
          </G>
          <Legend x={tbX} y={tbY - box.h} box={box} title={labels.legendTitle} />
          <TitleBlock x={tbX} y={tbY} project={project} system={system} phase={phase} format={sheet.name} revisions={revisions} firm={firm} labels={plankopf} />
        </Svg>
        {/* Logo in the logo column of the title block (after the drawing, which fills the block white). */}
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
        {logo && <Image src={logo} style={{ position: "absolute", left: tbX + 10, top: tbY + 80, width: 200, height: 68, objectFit: "contain", objectPosition: "left" }} />}
      </Page>
    </Document>
  );
}
