import { Document, G, Image, Line, Page, Path, Rect, Svg } from "@react-pdf/renderer";

import { type GenerationSchema, legendSymbol, type PipeKind, pipeColors, pipeDashed, type SymbolKey, symbolRefs } from "@/lib/heating/generation-schema";
import type { SchemaRevision } from "@/lib/kwl/schema-plan";
import type { FirmSettings } from "@/lib/supabase/types";

import { MARGIN, PAD, PdfPrims, type PlankopfLabels, svgText, TB_H, TB_W, TitleBlock } from "./kwl-schema-document";
import type { LogoSource } from "./letterhead";
import { sanitarySheet } from "./sanitary-schema-document";

// Prinzipschema Wärmeerzeugung (242) as a plan: frame and LUPI title block like the Lüftung and Sanitär schemas, the
// schema of src/lib/heating/generation-schema.ts and a legend of the pipes and SIA 410 symbols it uses. Sheet as the
// Sanitär plan: height 297 / 420 / 594 mm, width a multiple of 210 mm (folds to A4).

const ink = "#111111";
/** Red of the trade Heizung in the title block (the Vorlauf red of the schema). */
const HEATING_RED = "#e3001b";

const LEGEND_ROW = 17;
const LEGEND_COL = 300;

export type HeatingLegend = {
  title: string;
  pipes: Record<PipeKind, string>;
  symbols: Record<SymbolKey, string>;
  /** Note on the «~» references (built from SIA 410 parts). */
  note: string;
};

type Entry = { pipe: PipeKind } | { key: SymbolKey } | { note: string };

const legendEntries = (schema: GenerationSchema, labels: HeatingLegend): Entry[] => [
  ...schema.pipes.map((pipe) => ({ pipe })),
  ...schema.used.map((key) => ({ key })),
  { note: labels.note },
];

function Legend({ x, y, w, h, entries, labels }: { x: number; y: number; w: number; h: number; entries: Entry[]; labels: HeatingLegend }) {
  const rows = Math.max(1, Math.floor((h - 26) / LEGEND_ROW));
  const columns = Math.min(Math.ceil(entries.length / rows), Math.max(1, Math.floor(w / LEGEND_COL)));
  return (
    <G>
      {svgText(x, y + 12, labels.title, 10, { bold: true })}
      {entries.slice(0, rows * columns).map((e, i) => {
        const cx = x + Math.floor(i / rows) * LEGEND_COL;
        const cy = y + 32 + (i % rows) * LEGEND_ROW;
        if ("pipe" in e) {
          return (
            <G key={e.pipe}>
              <Line x1={cx} y1={cy} x2={cx + 30} y2={cy} stroke={pipeColors[e.pipe]} strokeWidth={2} strokeDasharray={pipeDashed(e.pipe) ? "6 3" : undefined} />
              {svgText(cx + 40, cy + 3, labels.pipes[e.pipe], 8)}
            </G>
          );
        }
        if ("note" in e) return <G key="note">{svgText(cx, cy + 3, e.note, 7.5, { fill: "#666666" })}</G>;
        return (
          <G key={e.key}>
            {/* legendSymbol draws into a 40 × 30 box; scaled to the row height. */}
            <G transform={`translate(${cx}, ${cy - 8}) scale(0.53)`}>
              <PdfPrims prims={legendSymbol(e.key)} />
            </G>
            {svgText(cx + 40, cy + 3, `${labels.symbols[e.key]}  (SIA 410 ${symbolRefs[e.key]})`, 8)}
          </G>
        );
      })}
    </G>
  );
}

export function HeatingSchemaDocument({
  schema,
  legend,
  plankopf,
  project,
  plant,
  phase,
  revisions,
  firm,
  logo,
}: {
  schema: GenerationSchema;
  legend: HeatingLegend;
  plankopf: PlankopfLabels;
  project: { name: string; street: string | null; zip: string | null; city: string | null; parcel: string | null };
  plant: string;
  phase: string;
  revisions: SchemaRevision[];
  firm: FirmSettings;
  logo: LogoSource | null;
}) {
  const entries = legendEntries(schema, legend);
  const sheet = sanitarySheet(schema, entries.length);
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
    <Document title={`${plankopf.plan} ${plant}`}>
      <Page size={[W, H]} style={{ fontFamily: "Helvetica" }}>
        <Svg width={W} height={H - 1} viewBox={`0 0 ${W} ${H - 1}`} style={{ position: "absolute", top: 0, left: 0 }}>
          <Rect x={MARGIN} y={MARGIN} width={W - 2 * MARGIN} height={H - 2 * MARGIN} fill="none" stroke={ink} strokeWidth={0.8} />
          <G transform={`translate(${dx}, ${dy}) scale(${scale})`}>
            {schema.lines.map((l, i) => (
              <Path key={`l${i}`} d={l.d} fill="none" stroke={pipeColors[l.kind]} strokeWidth={l.width} strokeDasharray={pipeDashed(l.kind) ? "6 3" : undefined} />
            ))}
            {schema.groups.map((g, i) => (
              <PdfPrims key={`g${i}`} prims={g.prims} />
            ))}
          </G>
          <Legend x={MARGIN + PAD} y={tbY} w={tbX - MARGIN - 2 * PAD} h={TB_H - PAD} entries={entries} labels={legend} />
          <TitleBlock x={tbX} y={tbY} project={project} system={plant} phase={phase} format={sheet.name} revisions={revisions} firm={firm} labels={plankopf} tradeColor={HEATING_RED} />
        </Svg>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
        {logo && <Image src={logo} style={{ position: "absolute", left: tbX + 10, top: tbY + 80, width: 200, height: 68, objectFit: "contain", objectPosition: "left" }} />}
      </Page>
    </Document>
  );
}
