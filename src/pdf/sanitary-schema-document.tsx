import { Document, G, Image, Line, Page, Path, Rect, Svg } from "@react-pdf/renderer";

import type { SchemaRevision } from "@/lib/kwl/schema-plan";
import type { Medium } from "@/lib/sanitary/network";
import { insulationStyle } from "@/lib/sanitary/pipes";
import { drawSymbol, isApplianceSymbol, mediumColors, type SanitarySchema, type SymbolKey } from "@/lib/sanitary/schema";
import type { FirmSettings } from "@/lib/supabase/types";

import { Legend, type LegendItem, MARGIN, PdfPrims, planSheet, type PlankopfLabels, TB_H, TB_W, TitleBlock } from "./kwl-schema-document";
import type { LogoSource } from "./letterhead";

// Prinzipschema of a Sanitäranlage as a plan: frame and LUPI title block like the Lüftung schema
// (kwl-schema-document.tsx), the Strangschema, and a legend of the lines, insulation and symbols it uses. The sheet is
// no DIN format: the schema is much wider than high, so the height is 297, 420 or 594 mm and the width a multiple of
// 210 mm (folds to A4).

const ink = "#111111";
/** Green of the «I» in the LUPI logo (public/brand/logo.png), the colour of the trade Sanitär in the title block. */
const SANITARY_GREEN = "#008001";
/** Scale of the schema: at least 0.94 (smallest texts ≈ 6 pt on paper), at most 1.25. */
const MIN_SCALE = 0.94;
const MAX_SCALE = 1.25;

/** Sheet of a Sanitär or Heizung schema (see planSheet). */
export const sanitarySheet = (layout: { width: number; height: number }, legend: LegendItem[]) => planSheet(layout, legend, { minScale: MIN_SCALE, maxScale: MAX_SCALE });

export type SanitaryLegend = {
  title: string;
  media: Record<Medium, string>;
  symbols: Record<SymbolKey, string>;
  /** One entry for the insulation band (the thicknesses are written at the Leitungen). */
  insulation: string;
  sizes: string;
};

/**
 * Symbol in its legend row (21 high): the Apparate (standing on their connections, up to 50 high) and the tall
 * symbols smaller, shifted to stay inside their row.
 */
function legendTransform(key: SymbolKey) {
  if (isApplianceSymbol(key)) return "translate(15, 10) scale(0.42)";
  const shifted: Partial<Record<SymbolKey, [number, number]>> = { redfil: [-3, 0.6], safety: [5, 0.6], heater: [0, 0.6], cabinet: [2, 0.6] };
  const [dy, k] = shifted[key] ?? [0, 0.8];
  return `translate(15, ${dy}) scale(${k})`;
}

/** Legend entries: lines, insulation band, symbols, the note on the sizes. */
function legendItems(schema: SanitarySchema, labels: SanitaryLegend): LegendItem[] {
  const media: Medium[] = ["pwc", "pwh", "pwhc"];
  return [
    ...media.map((m) => ({ key: m, label: labels.media[m], symbol: <Line x1={0} y1={0} x2={30} y2={0} stroke={mediumColors[m]} strokeWidth={2} /> })),
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
      label: labels.symbols[key],
      symbol: (
        <G>
          {!isApplianceSymbol(key) && <Line x1={0} y1={0} x2={30} y2={0} stroke="#555555" strokeWidth={1.2} />}
          <G transform={legendTransform(key)}>
            <PdfPrims prims={drawSymbol(key, 0, 0)} />
          </G>
        </G>
      ),
    })),
    { key: "note", label: labels.sizes, note: true },
  ];
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
  const sheet = sanitarySheet(schema, legendItems(schema, legend));
  const { scale, dx, dy } = sheet;
  const W = sheet.w;
  const H = sheet.h;
  const tbX = W - MARGIN - TB_W;
  const tbY = H - MARGIN - TB_H;

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
          <Legend x={tbX} y={tbY - sheet.legend.h} box={sheet.legend} title={legend.title} />
          <TitleBlock x={tbX} y={tbY} project={project} system={system} phase={phase} format={sheet.name} revisions={revisions} firm={firm} labels={plankopf} tradeColor={SANITARY_GREEN} />
        </Svg>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
        {logo && <Image src={logo} style={{ position: "absolute", left: tbX + 10, top: tbY + 80, width: 200, height: 68, objectFit: "contain", objectPosition: "left" }} />}
      </Page>
    </Document>
  );
}
