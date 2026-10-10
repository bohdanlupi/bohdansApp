import { Document, G, Image, Line, Page, Path, Rect, Svg } from "@react-pdf/renderer";

import { type DistributionSchema, type DistributionSymbol, floorDistributor, lineColors, meterSet, returnValve, thermoValve, valveBlock, ventMark } from "@/lib/heating/distribution-layout";
import { drawSymbol } from "@/lib/heating/generation-schema";
import type { SchemaRevision } from "@/lib/kwl/schema-plan";
import type { Prim } from "@/lib/kwl/schema-symbols";
import { insulationStyle } from "@/lib/sanitary/pipes";
import type { FirmSettings } from "@/lib/supabase/types";

import { Legend, type LegendItem, MARGIN, PdfPrims, type PlankopfLabels, TB_H, TB_W, TitleBlock } from "./kwl-schema-document";
import type { LogoSource } from "./letterhead";
import { sanitarySheet } from "./sanitary-schema-document";

// Prinzipschema Wärmeverteilung (243) as a plan: frame and LUPI title block like the Prinzipschema Wärmeerzeugung, the
// Strangschema of src/lib/heating/distribution-layout.ts and a legend of the lines and symbols it uses. Sheet as the
// Sanitär plan: height 297 / 420 / 594 mm, width a multiple of 210 mm (folds to A4).

const ink = "#111111";
/** Red of the trade Heizung in the title block (the Vorlauf red of the schema). */
const HEATING_RED = "#e3001b";

export type DistributionLegend = {
  title: string;
  vl: string;
  rl: string;
  insulation: string;
  symbol: (key: DistributionSymbol) => string;
};

/** Symbol of the legend, drawn around (0, 0) on a short line (30 units). */
function legendPrims(key: DistributionSymbol): Prim[] {
  const pipe: Prim = { t: "line", x1: 0, y1: 0, x2: 30, y2: 0, stroke: "#555555", sw: 1.2 };
  switch (key) {
    case "thermoValve":
      return [pipe, ...thermoValve(15, 0)];
    case "returnValve":
      return [pipe, ...returnValve(15, 0)];
    case "vent":
      return [{ t: "rect", x: 2, y: -6, w: 16, h: 12, fill: "bg", stroke: "ink", sw: 1 }, ...ventMark(18, -3, 1)];
    case "valveBlock":
      return [{ t: "line", x1: 12, y1: 0, x2: 12, y2: 10, stroke: "#555555", sw: 1.2 }, { t: "line", x1: 18, y1: 0, x2: 18, y2: 10, stroke: "#555555", sw: 1.2 }, ...valveBlock(15, -3)];
    case "floorDistributor":
      return floorDistributor(0, -10);
    case "meterSet":
      return [pipe, { t: "line", x1: 0, y1: -8, x2: 30, y2: -8, stroke: "#555555", sw: 1.2 }, ...meterSet(15, 0, -8)];
    case "radiator":
      return [{ t: "rect", x: 4, y: -6, w: 22, h: 12, fill: "bg", stroke: "ink", sw: 1.2 }];
    case "apparatus":
      return [{ t: "rect", x: 4, y: -7, w: 22, h: 14, fill: "bg", stroke: "ink", sw: 1.2 }];
    default:
      return [pipe, ...drawSymbol(key, 15, 0)];
  }
}

function legendItems(schema: DistributionSchema, labels: DistributionLegend): LegendItem[] {
  return [
    { key: "vl", label: labels.vl, symbol: <Line x1={0} y1={0} x2={30} y2={0} stroke={lineColors.vl} strokeWidth={2} /> },
    { key: "rl", label: labels.rl, symbol: <Line x1={0} y1={0} x2={30} y2={0} stroke={lineColors.rl} strokeWidth={2} strokeDasharray="6 3" /> },
    ...(schema.insulated
      ? [
          {
            key: "insulation",
            label: labels.insulation,
            symbol: (
              <G>
                <Line x1={0} y1={0} x2={30} y2={0} stroke={insulationStyle.edge} strokeWidth={10} strokeDasharray="1.2 2.2" />
                <Line x1={0} y1={0} x2={30} y2={0} stroke={insulationStyle.fill} strokeWidth={7.6} />
              </G>
            ),
          },
        ]
      : []),
    ...schema.used.map((key) => ({
      key,
      label: labels.symbol(key),
      symbol: (
        <G transform="scale(0.8)">
          <PdfPrims prims={legendPrims(key)} />
        </G>
      ),
    })),
  ];
}

export function HeatingDistributionDocument({
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
  schema: DistributionSchema;
  legend: DistributionLegend;
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
            {schema.bands.map((b, i) => (
              <Path key={`be${i}`} d={b.d} fill="none" stroke={insulationStyle.edge} strokeWidth={b.width} strokeDasharray="1.2 2.2" />
            ))}
            {schema.bands.map((b, i) => (
              <Path key={`bf${i}`} d={b.d} fill="none" stroke={insulationStyle.fill} strokeWidth={b.width - 2.4} />
            ))}
            {schema.lines.map((l, i) => (
              <Path key={`l${i}`} d={l.d} fill="none" stroke={lineColors[l.kind]} strokeWidth={1.6} strokeDasharray={l.kind === "rl" ? "6 3" : undefined} />
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
