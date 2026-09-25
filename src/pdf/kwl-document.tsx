import { Circle, Document, G, Line, Path, Svg, Text, View } from "@react-pdf/renderer";

import { fanChart, findRoomType, type SideResult, spiLimit, spiTarget } from "@/lib/kwl/calc";
import type { KwlDevice } from "@/lib/kwl/devices";
import type { KwlEvaluation } from "@/lib/kwl/evaluate";
import type { KwlData } from "@/lib/kwl/schema";
import { formatNumber } from "@/lib/number-input";
import type { FirmSettings } from "@/lib/supabase/types";

import { formatDate } from "./format";
import { AddressAndMeta, colors, LetterPage, styles, type LogoSource } from "./letterhead";

/** Translator for the `kwl` messages namespace in the document language. */
export type KwlTranslate = (key: string, values?: Record<string, string | number>) => string;

// The built-in Helvetica only has WinAnsi glyphs: replace the few symbols the UI texts use.
const winAnsi = (text: string) => text.replace(/→/g, "->").replace(/≤/g, "<=").replace(/₂/g, "2").replace(/×/g, "x");

const n = (value: number | null | undefined, decimals = 0) =>
  value === null || value === undefined || !Number.isFinite(value) || value === 0 ? "" : formatNumber(value, decimals);

const cell = { paddingVertical: 2.5, paddingHorizontal: 2 };
const w = { number: 34, type: 82, area: 28, flow: 32 };

/** KWL-Auslegung of one dwelling: air flows, device with operating points and SPI, filters. */
export function KwlDocument({
  firm,
  logo,
  t: translate,
  pageLabel,
  projectLabel,
  dateLabel,
  project,
  name,
  data,
  result,
}: {
  firm: FirmSettings;
  logo: LogoSource | null;
  t: KwlTranslate;
  pageLabel: (page: number, total: number) => string;
  projectLabel: string;
  dateLabel: string;
  project: { number: string; name: string };
  name: string;
  data: KwlData;
  result: KwlEvaluation;
}) {
  const t: KwlTranslate = (key, values) => winAnsi(translate(key, values));
  const { rows, summary, device, deviceResult, oda, supplyFilter } = result;
  const { supply, extract, spi, partyFlow } = deviceResult;
  const yesNo = (ok: boolean) => (ok ? t("yes") : t("no"));

  const head = (
    <View style={{ flexDirection: "row", backgroundColor: colors.headerFill, ...styles.bold, fontSize: 7 }}>
      <Text style={{ ...cell, width: w.number }}>{t("rooms.number")}</Text>
      <Text style={{ ...cell, flex: 1 }}>{t("rooms.name")}</Text>
      <Text style={{ ...cell, width: w.type }}>{t("rooms.type")}</Text>
      <Text style={{ ...cell, width: w.area, textAlign: "right" }}>m²</Text>
      {(["supplyShort", "extractShort"] as const).flatMap((side) =>
        (["recommended", "minimum", "used", "party"] as const).map((col) => (
          <Text key={side + col} style={{ ...cell, width: w.flow, textAlign: "right" }}>
            {`${t(side)}\n${t(`rooms.${col}`)}`}
          </Text>
        )),
      )}
    </View>
  );

  return (
    <Document title={`${t("title")} ${project.number} ${name}`} author={firm.name}>
      <LetterPage firm={firm} logo={logo} pageLabel={pageLabel}>
        <AddressAndMeta
          recipient={[]}
          meta={[
            [projectLabel, `${project.number} ${project.name}`],
            [t("fields.name"), name],
            [dateLabel, formatDate(new Date())],
          ]}
        />
        <Text style={styles.title}>
          {t("title")} · {name}
        </Text>

        <Heading>{t("tabs.rooms")} [m³/h]</Heading>
        {head}
        {rows.map((row) => {
          const type = findRoomType(row.type);
          return (
            <View key={row.id} wrap={false} style={{ flexDirection: "row", fontSize: 7.5, borderBottomWidth: 0.5, borderBottomColor: colors.line }}>
              <Text style={{ ...cell, width: w.number }}>{row.number}</Text>
              <Text style={{ ...cell, flex: 1 }}>{row.name}</Text>
              <Text style={{ ...cell, width: w.type }}>{type ? `${type.code} ${t(`roomTypes.${type.key}`)}` : ""}</Text>
              <Text style={{ ...cell, width: w.area, textAlign: "right" }}>{n(row.area, 1)}</Text>
              {[
                [row.recommendedSupply, row.minSupply, row.supply, row.partySupply],
                [row.recommendedExtract, row.minExtract, row.extract, row.partyExtract],
              ].flatMap((values, s) =>
                values.map((v, i) => (
                  <Text key={`${s}-${i}`} style={{ ...cell, width: w.flow, textAlign: "right", ...(i === 2 ? styles.bold : { color: colors.muted }) }}>
                    {n(v)}
                  </Text>
                )),
              )}
            </View>
          );
        })}
        <View wrap={false} style={{ flexDirection: "row", fontSize: 7.5, ...styles.bold, borderTopWidth: 1, borderTopColor: colors.text }}>
          <Text style={{ ...cell, flex: 1 }}>{t("rooms.total")}</Text>
          <Text style={{ ...cell, width: w.area, textAlign: "right" }}>{n(summary.area, 1)}</Text>
          {[
            [summary.recommendedSupply, summary.minSupply, summary.supply, partyFlow],
            [summary.recommendedExtract, summary.minExtract, summary.extract, partyFlow],
          ].flatMap((values, s) =>
            values.map((v, i) => (
              <Text key={`${s}-${i}`} style={{ ...cell, width: w.flow, textAlign: "right" }}>
                {n(v)}
              </Text>
            )),
          )}
        </View>
        <View style={{ marginTop: 6, fontSize: 8.5 }}>
          <Text>{t("summary.minimumPdf", { flow: n(summary.minSupply) })}</Text>
          {summary.imbalance !== 0 && (
            <Text style={{ color: "#9a3412" }}>
              {t("summary.imbalance", {
                side: summary.imbalance > 0 ? t("extract") : t("supply"),
                difference: n(Math.abs(summary.imbalance)),
                target: n(Math.max(summary.supply, summary.extract)),
              })}
            </Text>
          )}
        </View>

        <Heading>{t("tabs.device")}</Heading>
        {device ? (
          <>
            <KeyValues
              rows={[
                [t("device.device"), device.name],
                [t("device.supplyDrop"), `${n(data.device.supplyDrop)} Pa`],
                [t("device.extractDrop"), `${n(data.device.extractDrop)} Pa`],
                [t("device.nominalStage"), `${supply?.nominalStage?.stage ?? "–"} / ${extract?.nominalStage?.stage ?? "–"}`],
                [t("summary.party"), `${n(partyFlow)} m³/h`],
                [t("device.spi"), spi === null ? t("device.spiUnknown") : `${formatNumber(spi, 2)} ${t("device.spiUnit")}`],
                ...(spi === null
                  ? []
                  : ([
                      [t("device.spiLimitPdf", { limit: formatNumber(spiLimit, 2) }), yesNo(spi < spiLimit)],
                      [t("device.spiTargetPdf", { target: formatNumber(spiTarget, 2) }), yesNo(spi < spiTarget)],
                    ] as [string, string][])),
              ]}
            />
            {((supply && !supply.nominalStage) || (extract && !extract.nominalStage)) && (
              <Text style={{ color: "#b91c1c", marginTop: 4 }}>{t("device.tooSmall")}</Text>
            )}
            <View wrap={false} style={{ marginTop: 8 }}>
              <View style={{ flexDirection: "row", backgroundColor: colors.headerFill, ...styles.bold, fontSize: 7.5 }}>
                <Text style={{ ...cell, width: 60 }}>{t("device.stage")}</Text>
                <Text style={{ ...cell, flex: 1, textAlign: "right" }}>{t("supplyShort")} m³/h</Text>
                <Text style={{ ...cell, flex: 1, textAlign: "right" }}>{t("supplyShort")} Pa</Text>
                <Text style={{ ...cell, flex: 1, textAlign: "right" }}>{t("extractShort")} m³/h</Text>
                <Text style={{ ...cell, flex: 1, textAlign: "right" }}>{t("extractShort")} Pa</Text>
                <Text style={{ ...cell, flex: 1, textAlign: "right" }}>{t("device.stagePower")}</Text>
              </View>
              {device.stages.map((stage, i) => {
                const nominal = stage.stage === supply?.nominalStage?.stage || stage.stage === extract?.nominalStage?.stage;
                return (
                  <View key={stage.stage} style={{ flexDirection: "row", fontSize: 7.5, borderBottomWidth: 0.5, borderBottomColor: colors.line, ...(nominal ? styles.bold : {}) }}>
                    <Text style={{ ...cell, width: 60 }}>{t("device.stageN", { stage: stage.stage })}</Text>
                    <Text style={{ ...cell, flex: 1, textAlign: "right" }}>{n(supply?.points[i].flow)}</Text>
                    <Text style={{ ...cell, flex: 1, textAlign: "right" }}>{n(supply?.points[i].pressure)}</Text>
                    <Text style={{ ...cell, flex: 1, textAlign: "right" }}>{n(extract?.points[i].flow)}</Text>
                    <Text style={{ ...cell, flex: 1, textAlign: "right" }}>{n(extract?.points[i].pressure)}</Text>
                    <Text style={{ ...cell, flex: 1, textAlign: "right" }}>{stage.power ?? ""}</Text>
                  </View>
                );
              })}
            </View>
            <View wrap={false} style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10 }}>
              <PdfFanChart device={device} side={supply} title={t("device.chart.supplyPdf")} />
              <PdfFanChart device={device} side={extract} title={t("device.chart.extractPdf")} />
            </View>
            <Text style={{ fontSize: 7, color: colors.muted, marginTop: 2 }}>{t("device.chart.pdfLegend")}</Text>
          </>
        ) : (
          <Text>{t("device.choose")}</Text>
        )}

        <View wrap={false}>
          <Heading>{t("tabs.filter")}</Heading>
          <KeyValues
            rows={[
              [t("filter.result.oda"), `${oda ?? "–"}${data.filter.odaOverride && data.filter.overrideReason ? ` (${data.filter.overrideReason})` : ""}`],
              [t("filter.result.ida"), data.filter.ida],
              [t("filter.result.supply"), supplyFilter ?? "–"],
              [t("filter.result.extract"), t("filter.result.extractPdf")],
            ]}
          />
        </View>

        {data.notes.trim() !== "" && (
          <View wrap={false}>
            <Heading>{t("notes.own")}</Heading>
            <Text>{data.notes}</Text>
          </View>
        )}
      </LetterPage>
    </Document>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <Text style={{ ...styles.bold, fontSize: 10.5, marginTop: 14, marginBottom: 5, color: colors.brand }}>{children}</Text>;
}

function KeyValues({ rows }: { rows: [string, string][] }) {
  return (
    <View>
      {rows.map(([label, value]) => (
        <View key={label} style={{ flexDirection: "row", paddingVertical: 1.5 }}>
          <Text style={{ width: 200, color: colors.muted }}>{label}</Text>
          <Text style={{ flex: 1 }}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

const CW = 240;
const CH = 170;
const pad = { left: 30, right: 6, top: 6, bottom: 20 };

function PdfFanChart({ device, side, title }: { device: KwlDevice; side: SideResult | null; title: string }) {
  const { curves, system } = fanChart(device, side, 36);
  const x = (v: number) => pad.left + (v / device.xMax) * (CW - pad.left - pad.right);
  const y = (p: number) => CH - pad.bottom - (p / device.yMax) * (CH - pad.top - pad.bottom);
  const path = (points: [number, number][]) => points.map(([v, p], i) => `${i ? "L" : "M"}${x(v).toFixed(1)} ${y(p).toFixed(1)}`).join(" ");
  const nominal = side?.nominalStage?.stage;
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(device.xMax * f));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(device.yMax * f));

  return (
    <View style={{ width: CW }}>
      <Text style={{ fontSize: 8, ...styles.bold, marginBottom: 2 }}>{title}</Text>
      <Svg width={CW} height={CH}>
        {yTicks.map((tick) => (
          <G key={`y${tick}`}>
            <Line x1={pad.left} x2={CW - pad.right} y1={y(tick)} y2={y(tick)} stroke="#dddddd" strokeWidth={0.5} />
            <Text x={pad.left - 3} y={y(tick) + 2} style={{ fontSize: 6 }} textAnchor="end" fill={colors.muted}>
              {String(tick)}
            </Text>
          </G>
        ))}
        {xTicks.map((tick) => (
          <G key={`x${tick}`}>
            <Line x1={x(tick)} x2={x(tick)} y1={pad.top} y2={CH - pad.bottom} stroke="#dddddd" strokeWidth={0.5} />
            <Text x={x(tick)} y={CH - pad.bottom + 8} style={{ fontSize: 6 }} textAnchor="middle" fill={colors.muted}>
              {String(tick)}
            </Text>
          </G>
        ))}
        {curves.map((c) =>
          c.points.length > 1 ? (
            <Path
              key={c.stage}
              d={path(c.points)}
              fill="none"
              stroke={c.stage === nominal ? colors.brand : "#9a9a9a"}
              strokeWidth={c.stage === nominal ? 1.4 : 0.7}
            />
          ) : null,
        )}
        {system.length > 1 && <Path d={path(system)} fill="none" stroke="#c0392b" strokeWidth={1} strokeDasharray="3 2" />}
        {side?.points.map((p) =>
          p.flow > 0 && p.flow <= device.xMax && p.pressure <= device.yMax ? (
            <Circle key={p.stage} cx={x(p.flow)} cy={y(p.pressure)} r={p.stage === nominal ? 2.4 : 1.4} fill={p.stage === nominal ? colors.brand : colors.text} />
          ) : null,
        )}
        <Text x={(pad.left + CW) / 2} y={CH - 2} style={{ fontSize: 6 }} textAnchor="middle" fill={colors.muted}>
          m³/h
        </Text>
        <Text x={4} y={pad.top + 4} style={{ fontSize: 6 }} fill={colors.muted}>
          Pa
        </Text>
      </Svg>
    </View>
  );
}
