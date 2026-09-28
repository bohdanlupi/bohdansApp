import { Circle, Document, G, Image, Line, Page, Path, Polygon, Rect, Svg, Text } from "@react-pdf/renderer";

import type { NetNode } from "@/lib/kwl/network";
import type { DuctMaterial } from "@/lib/kwl/pressure";
import { measuredCoverPrefix } from "@/lib/kwl/products";
import { type InsulationClass, insulationClasses, insulationStyles } from "@/lib/kwl/insulation";
import { airColors, type AirKind, edgePath, insulationBands, type SchemaLayout } from "@/lib/kwl/schema-layout";
import type { SchemaRevision } from "@/lib/kwl/schema-plan";
import { type DeviceExtras, deviceSymbols, drawSymbol, ductLabel, type LegendKey, nodeSymbol, type Paint, type Prim, terminalParts } from "@/lib/kwl/schema-symbols";
import type { FirmSettings } from "@/lib/supabase/types";

import { winAnsi } from "./kwl-document";
import type { LogoSource } from "./letterhead";

// Prinzipschema of a ventilation system as a plan: ISO landscape sheet (A3, else A2 / A1 / A0 when the schema would
// get too small to read), frame, the schema, a legend of the symbols it uses and the LUPI title block (Plankopf,
// after vorlagen/Vorlage_Plankopf.pdf: project, address, logo + firm, Anlage, SIA phase, plan type, format, trade,
// revision list A–F).

const ink = "#111111";
const muted = "#666666";
const blue = "#0000ff";

const pdfPaint = (p: Paint | undefined) => (p === undefined ? undefined : p === "ink" ? ink : p === "bg" ? "#ffffff" : p === "muted" ? muted : p);

/** ISO sheets, landscape [pt]. */
const formats = [
  { name: "A3", w: 1190.55, h: 841.89 },
  { name: "A2", w: 1683.78, h: 1190.55 },
  { name: "A1", w: 2383.94, h: 1683.78 },
  { name: "A0", w: 3370.39, h: 2383.94 },
] as const;
/** Frame distance from the sheet edge and padding inside the frame [pt]. */
const MARGIN = 14;
const PAD = 12;
/** Title block of the template (same physical size on every format) [pt]. */
const TB_W = 566;
const TB_H = 213;
/** Smallest scale of the schema that keeps its smallest texts (7.5–8 units) readable on paper (≈ 6 pt). */
const MIN_SCALE = 0.75;
const MAX_SCALE = 1.3;

/** Sheet and scale for a schema: the smallest format on which it is drawn at least at MIN_SCALE. */
export function schemaSheet(layout: { width: number; height: number }) {
  const fit = (f: (typeof formats)[number]) => {
    const w = f.w - 2 * MARGIN - 2 * PAD;
    const h = f.h - 2 * MARGIN - TB_H - 3 * PAD;
    return Math.min(w / layout.width, h / layout.height, MAX_SCALE);
  };
  const format = formats.find((f) => fit(f) >= MIN_SCALE) ?? formats[formats.length - 1];
  return { format, scale: fit(format) };
}

function PdfPrims({ prims }: { prims: Prim[] }) {
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
            return <Path key={i} d={p.d} fill={pdfPaint(p.fill)} stroke={pdfPaint(p.stroke)} strokeWidth={p.sw} />;
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

const svgText = (x: number, y: number, value: string, size: number, opts: { anchor?: "start" | "middle" | "end"; fill?: string; bold?: boolean } = {}) => (
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
            {node.type === "duct" && svgText(x, y - top - 15, ductLabel(node, labels.material), 8, { anchor: "middle" })}
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

/** Legend in the band left of the title block: air types (line colours), insulation classes, then the symbols, in columns. */
function Legend({ x, y, w, h, keys, insulation, labels }: { x: number; y: number; w: number; h: number; keys: LegendKey[]; insulation: InsulationClass[]; labels: SchemaLabels }) {
  const ROW = 17;
  const COL = 190;
  const airs: AirKind[] = ["outdoor", "supply", "extract", "exhaust"];
  const entries = [...airs.map((a) => ({ air: a })), ...insulation.map((c) => ({ insulation: c })), ...keys.map((k) => ({ key: k }))];
  const rows = Math.max(1, Math.floor((h - 26) / ROW));
  const columns = Math.min(Math.ceil(entries.length / rows), Math.max(1, Math.floor(w / COL)));
  return (
    <G>
      {svgText(x, y + 12, labels.legendTitle, 10, { bold: true })}
      {entries.slice(0, rows * columns).map((e, i) => {
        const cx = x + Math.floor(i / rows) * COL;
        const cy = y + 32 + (i % rows) * ROW;
        if ("air" in e && e.air) {
          return (
            <G key={e.air}>
              <Line x1={cx} y1={cy} x2={cx + 30} y2={cy} stroke={airColors[e.air]} strokeWidth={2} />
              {svgText(cx + 40, cy + 3, `${labels.airShort[e.air]}  ${labels.air[e.air]}`, 8)}
            </G>
          );
        }
        if ("insulation" in e && e.insulation) {
          const style = insulationStyles[e.insulation];
          return (
            <G key={e.insulation}>
              <Line x1={cx} y1={cy} x2={cx + 30} y2={cy} stroke={style.edge} strokeWidth={style.width} strokeDasharray="1.2 2.2" />
              <Line x1={cx} y1={cy} x2={cx + 30} y2={cy} stroke={style.fill} strokeWidth={style.width - 2.4} />
              <Line x1={cx} y1={cy} x2={cx + 30} y2={cy} stroke="#555555" strokeWidth={1.2} />
              {svgText(cx + 40, cy + 3, labels.insulation[e.insulation], 8)}
            </G>
          );
        }
        const key = (e as { key: LegendKey }).key;
        // Symbols scaled to the row height (at most 80 %), on a short grey line where they sit on a duct.
        const onLine = ["flow", "bend", "tee", "reducer", "supplyTerminal", "extractTerminal"].includes(key);
        const { prims, top } = drawSymbol(key, 0, 0, "#555555", 1);
        const size = Math.min(0.8, 13 / (2 * top));
        return (
          <G key={key}>
            {onLine && <Line x1={cx} y1={cy} x2={cx + 30} y2={cy} stroke="#555555" strokeWidth={1.2} />}
            <G transform={`translate(${cx + 15}, ${cy}) scale(${size})`}>
              <PdfPrims prims={prims} />
            </G>
            {svgText(cx + 40, cy + 3, labels.legend[key], 8)}
          </G>
        );
      })}
    </G>
  );
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
function TitleBlock({
  x,
  y,
  project,
  system,
  phase,
  format,
  revisions,
  firm,
  labels,
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
      {svgText(R + 145, y2 + 16, format, 12.5, { anchor: "middle" })}
      {svgText(R + 175, y2 + 16, labels.trade, 12.5, { fill: blue })}
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
  const { format, scale } = schemaSheet(layout);
  const W = format.w;
  const H = format.h;
  const tbX = W - MARGIN - TB_W;
  const tbY = H - MARGIN - TB_H;
  // Schema centred in the area above the title block band.
  const areaW = W - 2 * MARGIN - 2 * PAD;
  const areaH = H - 2 * MARGIN - TB_H - 3 * PAD;
  const dx = MARGIN + PAD + (areaW - layout.width * scale) / 2;
  const dy = MARGIN + PAD + (areaH - layout.height * scale) / 2;

  return (
    <Document title={`${plankopf.plan} ${system}`}>
      <Page size={[W, H]} style={{ fontFamily: "Helvetica" }}>
        {/* A hair smaller than the sheet, so react-pdf does not try to wrap it onto a second page. */}
        <Svg width={W} height={H - 1} viewBox={`0 0 ${W} ${H - 1}`} style={{ position: "absolute", top: 0, left: 0 }}>
          <Rect x={MARGIN} y={MARGIN} width={W - 2 * MARGIN} height={H - 2 * MARGIN} fill="none" stroke={ink} strokeWidth={0.8} />
          <G transform={`translate(${dx}, ${dy}) scale(${scale})`}>
            <SchemaDrawing layout={layout} labels={labels} info={info} />
          </G>
          <Legend
            x={MARGIN + PAD}
            y={tbY}
            w={tbX - MARGIN - 2 * PAD}
            h={TB_H - PAD}
            keys={legend}
            insulation={insulationClasses.filter((c) => layout.edges.some((e) => e.insulation === c))}
            labels={labels}
          />
          <TitleBlock x={tbX} y={tbY} project={project} system={system} phase={phase} format={format.name} revisions={revisions} firm={firm} labels={plankopf} />
        </Svg>
        {/* Logo in the logo column of the title block (after the drawing, which fills the block white). */}
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
        {logo && <Image src={logo} style={{ position: "absolute", left: tbX + 10, top: tbY + 80, width: 200, height: 68, objectFit: "contain", objectPosition: "left" }} />}
      </Page>
    </Document>
  );
}
