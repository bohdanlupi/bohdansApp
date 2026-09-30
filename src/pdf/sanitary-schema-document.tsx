import { Document, G, Image, Line, Page, Path, Rect, Svg } from "@react-pdf/renderer";

import type { SchemaRevision } from "@/lib/kwl/schema-plan";
import type { Medium } from "@/lib/sanitary/network";
import { insulationStyle } from "@/lib/sanitary/pipes";
import { drawSymbol, mediumColors, type SanitarySchema, type SymbolKey } from "@/lib/sanitary/schema";
import type { FirmSettings } from "@/lib/supabase/types";

import { MARGIN, PAD, PdfPrims, type PlankopfLabels, svgText, TB_H, TB_W, TitleBlock } from "./kwl-schema-document";
import type { LogoSource } from "./letterhead";

// Prinzipschema of a Sanitäranlage as a plan: frame and LUPI title block like the Lüftung schema
// (kwl-schema-document.tsx), the Strangschema, and a legend of the lines, insulation and symbols it uses. The sheet is
// no DIN format: the schema is much wider than high, so the height is 297, 420 or 594 mm and the width a multiple of
// 210 mm (folds to A4).

const ink = "#111111";
const MM = 72 / 25.4;
const HEIGHTS = [297, 420, 594];
const WIDTH_STEP = 210;
/** Scale of the schema: at least 0.75 (smallest texts ≈ 5 pt on paper), at most 1. */
const MIN_SCALE = 0.75;
const MAX_SCALE = 1;

const LEGEND_ROW = 17;
const LEGEND_COL = 340;
const legendRows = Math.max(1, Math.floor((TB_H - PAD - 26) / LEGEND_ROW));

/** Entries of the legend: lines, insulation classes, symbols, the note on the sizes. */
const legendEntries = (schema: SanitarySchema) => 3 + (schema.insulated ? 1 : 0) + schema.used.length + 1;

/**
 * Sheet [mm] and scale: the lowest height that draws the schema at MIN_SCALE, the width it needs in steps of 210 mm –
 * at least the title block with all legend columns beside it.
 */
export function sanitarySheet(layout: { width: number; height: number }, legendCount = 0) {
  const fit = (hMm: number) => Math.min((hMm * MM - 2 * MARGIN - TB_H - 3 * PAD) / layout.height, MAX_SCALE);
  const hMm = HEIGHTS.find((h) => fit(h) >= MIN_SCALE) ?? HEIGHTS[HEIGHTS.length - 1];
  const scale = fit(hMm);
  const needed = (layout.width * scale + 2 * MARGIN + 2 * PAD) / MM;
  const legend = (Math.ceil(legendCount / legendRows) * LEGEND_COL + TB_W + 2 * MARGIN + 3 * PAD) / MM;
  const wMm = Math.max(2, Math.ceil(Math.max(needed, legend) / WIDTH_STEP - 1e-9)) * WIDTH_STEP;
  return { wMm, hMm, w: wMm * MM, h: hMm * MM, scale, name: `${hMm} × ${wMm}` };
}

export type SanitaryLegend = {
  title: string;
  media: Record<Medium, string>;
  symbols: Record<SymbolKey, string>;
  /** One entry for the insulation band (the thicknesses are written at the Leitungen). */
  insulation: string;
  sizes: string;
};

function Legend({ x, y, w, h, schema, labels }: { x: number; y: number; w: number; h: number; schema: SanitarySchema; labels: SanitaryLegend }) {
  const ROW = LEGEND_ROW;
  const COL = LEGEND_COL;
  const media: Medium[] = ["pwc", "pwh", "pwhc"];
  const entries = [
    ...media.map((m) => ({ medium: m })),
    ...(schema.insulated ? [{ insulation: true as const }] : []),
    ...schema.used.map((k) => ({ key: k })),
    { note: labels.sizes },
  ];
  const rows = Math.max(1, Math.floor((h - 26) / ROW));
  const columns = Math.min(Math.ceil(entries.length / rows), Math.max(1, Math.floor(w / COL)));
  return (
    <G>
      {svgText(x, y + 12, labels.title, 10, { bold: true })}
      {entries.slice(0, rows * columns).map((e, i) => {
        const cx = x + Math.floor(i / rows) * COL;
        const cy = y + 32 + (i % rows) * ROW;
        if ("medium" in e) {
          return (
            <G key={e.medium}>
              <Line x1={cx} y1={cy} x2={cx + 30} y2={cy} stroke={mediumColors[e.medium]} strokeWidth={2} />
              {svgText(cx + 40, cy + 3, labels.media[e.medium], 8)}
            </G>
          );
        }
        if ("insulation" in e) {
          return (
            <G key="insulation">
              <Line x1={cx} y1={cy} x2={cx + 30} y2={cy} stroke={insulationStyle.edge} strokeWidth={10} strokeDasharray="1.2 2.2" />
              <Line x1={cx} y1={cy} x2={cx + 30} y2={cy} stroke={insulationStyle.fill} strokeWidth={7.6} />
              {svgText(cx + 40, cy + 3, labels.insulation, 8)}
            </G>
          );
        }
        if ("note" in e) return <G key="note">{svgText(cx, cy + 3, e.note, 7.5, { fill: "#666666" })}</G>;
        return (
          <G key={e.key}>
            <Line x1={cx} y1={cy} x2={cx + 30} y2={cy} stroke="#555555" strokeWidth={1.2} />
            <G transform={`translate(${cx + 15}, ${cy}) scale(0.8)`}>
              <PdfPrims prims={drawSymbol(e.key, 0, 0)} />
            </G>
            {svgText(cx + 40, cy + 3, labels.symbols[e.key], 8)}
          </G>
        );
      })}
    </G>
  );
}

export function SanitarySchemaDocument({
  schema,
  legend,
  plankopf,
  project,
  system,
  phase,
  revisions,
  firm,
  logo,
}: {
  schema: SanitarySchema;
  legend: SanitaryLegend;
  plankopf: PlankopfLabels;
  project: { name: string; street: string | null; zip: string | null; city: string | null; parcel: string | null };
  system: string;
  phase: string;
  revisions: SchemaRevision[];
  firm: FirmSettings;
  logo: LogoSource | null;
}) {
  const sheet = sanitarySheet(schema, legendEntries(schema));
  const { scale } = sheet;
  const W = sheet.w;
  const H = sheet.h;
  const tbX = W - MARGIN - TB_W;
  const tbY = H - MARGIN - TB_H;
  const areaW = W - 2 * MARGIN - 2 * PAD;
  const areaH = H - 2 * MARGIN - TB_H - 3 * PAD;
  const dx = MARGIN + PAD + (areaW - schema.width * scale) / 2;
  const dy = MARGIN + PAD + (areaH - schema.height * scale) / 2;

  return (
    <Document title={`${plankopf.plan} ${system}`}>
      <Page size={[W, H]} style={{ fontFamily: "Helvetica" }}>
        <Svg width={W} height={H - 1} viewBox={`0 0 ${W} ${H - 1}`} style={{ position: "absolute", top: 0, left: 0 }}>
          <Rect x={MARGIN} y={MARGIN} width={W - 2 * MARGIN} height={H - 2 * MARGIN} fill="none" stroke={ink} strokeWidth={0.8} />
          <G transform={`translate(${dx}, ${dy}) scale(${scale})`}>
            {schema.bands.map((b, i) => (
              <Path key={`be${i}`} d={b.d} fill="none" stroke={b.edge} strokeWidth={b.width} strokeDasharray="1.2 2.2" />
            ))}
            {schema.bands.map((b, i) => (
              <Path key={`bf${i}`} d={b.d} fill="none" stroke={b.fill} strokeWidth={b.width - 2.4} />
            ))}
            {schema.lines.map((l, i) => (
              <Path key={`l${i}`} d={l.d} fill="none" stroke={mediumColors[l.medium]} strokeWidth={1.6} />
            ))}
            {schema.groups.map((g, i) => (
              <PdfPrims key={`g${i}`} prims={g.prims} />
            ))}
          </G>
          <Legend x={MARGIN + PAD} y={tbY} w={tbX - MARGIN - 2 * PAD} h={TB_H - PAD} schema={schema} labels={legend} />
          <TitleBlock x={tbX} y={tbY} project={project} system={system} phase={phase} format={sheet.name} revisions={revisions} firm={firm} labels={plankopf} />
        </Svg>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
        {logo && <Image src={logo} style={{ position: "absolute", left: tbX + 10, top: tbY + 80, width: 200, height: 68, objectFit: "contain", objectPosition: "left" }} />}
      </Page>
    </Document>
  );
}
