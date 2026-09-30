import { Document, G, Image, Line, Page, Path, Rect, Svg } from "@react-pdf/renderer";

import type { SchemaRevision } from "@/lib/kwl/schema-plan";
import type { Medium } from "@/lib/sanitary/network";
import { insulationStyle } from "@/lib/sanitary/pipes";
import { drawSymbol, mediumColors, type SanitarySchema, type SymbolKey } from "@/lib/sanitary/schema";
import type { FirmSettings } from "@/lib/supabase/types";

import { MARGIN, PAD, PdfPrims, type PlankopfLabels, schemaSheet, svgText, TB_H, TB_W, TitleBlock } from "./kwl-schema-document";
import type { LogoSource } from "./letterhead";

// Prinzipschema of a Sanitäranlage as a plan: the same sheet, frame and LUPI title block as the Lüftung schema
// (kwl-schema-document.tsx), the Strangschema, and a legend of the lines, insulation and symbols it uses.

const ink = "#111111";

export type SanitaryLegend = {
  title: string;
  media: Record<Medium, string>;
  symbols: Record<SymbolKey, string>;
  insulation: (mm: number, shared: boolean) => string;
  sizes: string;
};

function Legend({ x, y, w, h, schema, labels }: { x: number; y: number; w: number; h: number; schema: SanitarySchema; labels: SanitaryLegend }) {
  const ROW = 17;
  const COL = 230;
  const media: Medium[] = ["pwc", "pwh", "pwhc"];
  const entries = [
    ...media.map((m) => ({ medium: m })),
    ...schema.insulation.map((i) => ({ insulation: i })),
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
          const style = insulationStyle(e.insulation.mm);
          const width = e.insulation.shared ? 14 : 9;
          return (
            <G key={`${e.insulation.mm}-${e.insulation.shared}`}>
              <Line x1={cx} y1={cy} x2={cx + 30} y2={cy} stroke={style.edge} strokeWidth={width} strokeDasharray="1.2 2.2" />
              <Line x1={cx} y1={cy} x2={cx + 30} y2={cy} stroke={style.fill} strokeWidth={width - 2.4} />
              {svgText(cx + 40, cy + 3, labels.insulation(e.insulation.mm, e.insulation.shared), 8)}
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
  const { format, scale } = schemaSheet(schema);
  const W = format.w;
  const H = format.h;
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
          <TitleBlock x={tbX} y={tbY} project={project} system={system} phase={phase} format={format.name} revisions={revisions} firm={firm} labels={plankopf} />
        </Svg>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
        {logo && <Image src={logo} style={{ position: "absolute", left: tbX + 10, top: tbY + 80, width: 200, height: 68, objectFit: "contain", objectPosition: "left" }} />}
      </Page>
    </Document>
  );
}
