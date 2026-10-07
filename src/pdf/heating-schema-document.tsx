import { Document, G, Image, Line, Page, Path, Rect, Svg } from "@react-pdf/renderer";

import { type GenerationSchema, legendSymbol, type PipeKind, pipeColors, pipeDashed, type SymbolKey } from "@/lib/heating/generation-schema";
import type { SchemaRevision } from "@/lib/kwl/schema-plan";
import type { FirmSettings } from "@/lib/supabase/types";

import { Legend, type LegendItem, MARGIN, PdfPrims, type PlankopfLabels, TB_H, TB_W, TitleBlock } from "./kwl-schema-document";
import type { LogoSource } from "./letterhead";
import { sanitarySheet } from "./sanitary-schema-document";

// Prinzipschema Wärmeerzeugung (242) as a plan: frame and LUPI title block like the Lüftung and Sanitär schemas, the
// schema of src/lib/heating/generation-schema.ts and a legend of the pipes and symbols (after SIA 410) it uses. Sheet as the
// Sanitär plan: height 297 / 420 / 594 mm, width a multiple of 210 mm (folds to A4).

const ink = "#111111";
/** Red of the trade Heizung in the title block (the Vorlauf red of the schema). */
const HEATING_RED = "#e3001b";

export type HeatingLegend = {
  title: string;
  pipes: Record<PipeKind, string>;
  symbols: Record<SymbolKey, string>;
};

/** Legend entries: the pipes, then the symbols (what they mean, without the SIA 410 references). */
const legendItems = (schema: GenerationSchema, labels: HeatingLegend): LegendItem[] => [
  ...schema.pipes.map((pipe) => ({
    key: pipe,
    label: labels.pipes[pipe],
    symbol: <Line x1={0} y1={0} x2={30} y2={0} stroke={pipeColors[pipe]} strokeWidth={2} strokeDasharray={pipeDashed(pipe) ? "6 3" : undefined} />,
  })),
  ...schema.used.map((key) => ({
    key,
    label: labels.symbols[key],
    // legendSymbol draws into a 40 × 30 box; scaled to the row height.
    symbol: (
      <G transform="translate(0, -8) scale(0.53)">
        <PdfPrims prims={legendSymbol(key)} />
      </G>
    ),
  })),
];

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
  const sheet = sanitarySheet(schema, legendItems(schema, legend));
  const { scale, dx, dy } = sheet;
  const W = sheet.w;
  const H = sheet.h;
  const tbX = W - MARGIN - TB_W;
  const tbY = H - MARGIN - TB_H;

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
          <Legend x={tbX} y={tbY - sheet.legend.h} box={sheet.legend} title={legend.title} />
          <TitleBlock x={tbX} y={tbY} project={project} system={plant} phase={phase} format={sheet.name} revisions={revisions} firm={firm} labels={plankopf} tradeColor={HEATING_RED} />
        </Svg>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
        {logo && <Image src={logo} style={{ position: "absolute", left: tbX + 10, top: tbY + 80, width: 200, height: 68, objectFit: "contain", objectPosition: "left" }} />}
      </Page>
    </Document>
  );
}
