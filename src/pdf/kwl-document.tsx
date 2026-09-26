import { Circle, Document, G, Line, Path, Rect, Svg, Text, View } from "@react-pdf/renderer";

import { hasOptions, optionsLabel } from "@/lib/kwl/attachments";
import { findRoomType, spiLimit, spiTarget } from "@/lib/kwl/calc";
import { chartTicks, curveColors, deviceChart, type DeviceChartData } from "@/lib/kwl/device-chart";
import type { OperatingPoint } from "@/lib/kwl/device-operation";
import type { KwlEvaluation } from "@/lib/kwl/evaluate";
import type { KwlData } from "@/lib/kwl/schema";
import { formatNumber } from "@/lib/number-input";
import type { FirmSettings } from "@/lib/supabase/types";

import { formatDate } from "./format";
import { AddressAndMeta, colors, LetterPage, styles, type LogoSource } from "./letterhead";

/** Translator for the `kwl` messages namespace in the document language. */
export type KwlTranslate = (key: string, values?: Record<string, string | number>) => string;

/**
 * «flows»: air flows per room and filter classes – a draft before the pressure drop calculation and the device
 * choice. «full»: complete KWL-Auslegung with device, external pressures, operating points and SPI.
 */
export type KwlPdfVariant = "flows" | "full";

// The built-in Helvetica only has WinAnsi glyphs: replace the few symbols the UI texts use.
export const winAnsi = (text: string) =>
  text
    .replace(/→/g, "->")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/₂/g, "2")
    .replace(/⁻¹/g, "-1")
    .replace(/Δp/g, "dp")
    .replace(/Δ/g, "D")
    .replace(/ζ/g, "zeta")
    .replace(/×/g, "x");

const n = (value: number | null | undefined, decimals = 0) =>
  value === null || value === undefined || !Number.isFinite(value) || value === 0 ? "" : formatNumber(value, decimals);

const cell = { paddingVertical: 2.5, paddingHorizontal: 2 };

/** SIA 382/5 Table 7 check of the external pressure (computed by the route from the design criteria). */
export type PressureCheck = { status: "target" | "limit" | "exceeded" | null; limit: number | null; target: number | null };

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
  variant,
  pressure,
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
  variant: KwlPdfVariant;
  pressure: PressureCheck;
}) {
  const t: KwlTranslate = (key, values) => winAnsi(translate(key, values));
  const { rows, summary, product, datasheet, deviceResult, oda, supplyFilter } = result;
  const { supply, extract, spi, partyFlow } = deviceResult;
  const full = variant === "full";
  const complete = result.drops.source === "system";
  const yesNo = (ok: boolean) => (ok ? t("yes") : t("no"));
  const title = full ? t("title") : t("report.flowsTitle");

  // Rooms table: floor, number, name, type, area; per side recommended / minimum / used (and party in the full report).
  const cols = full ? (["recommended", "minimum", "used", "party"] as const) : (["recommended", "minimum", "used"] as const);
  const w = { floor: 36, number: 28, type: 28, area: 30, flow: full ? 32 : 38 };
  const volume = summary.area * data.height;
  const airChange = volume > 0 ? summary.supply / volume : null;
  const hasFloors = rows.some((r) => r.floor);
  const usedTypes = [...new Set(rows.map((r) => r.type))].map(findRoomType).filter((x): x is NonNullable<typeof x> => !!x);

  const head = (
    <View style={{ flexDirection: "row", backgroundColor: colors.headerFill, ...styles.bold, fontSize: 7 }}>
      {hasFloors && <Text style={{ ...cell, width: w.floor }}>{t("rooms.floor")}</Text>}
      <Text style={{ ...cell, width: w.number }}>{t("rooms.number")}</Text>
      <Text style={{ ...cell, flex: 1 }}>{t("rooms.name")}</Text>
      <Text style={{ ...cell, width: w.type }}>{t("report.typeShort")}</Text>
      <Text style={{ ...cell, width: w.area, textAlign: "right" }}>m²</Text>
      {(["supplyShort", "extractShort"] as const).flatMap((side) =>
        cols.map((col) => (
          <Text key={side + col} style={{ ...cell, width: w.flow, textAlign: "right" }}>
            {`${t(side)}\n${t(`rooms.${col}`)}`}
          </Text>
        )),
      )}
    </View>
  );
  const values = (row: { recommended: number | null; min: number | null; used: number | null; party: number | null }) =>
    full ? [row.recommended, row.min, row.used, row.party] : [row.recommended, row.min, row.used];

  return (
    <Document title={`${title} ${project.number} ${name}`} author={firm.name}>
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
          {title} · {name}
        </Text>
        {!full && <Text style={{ fontSize: 8.5, color: colors.muted, marginTop: -4, marginBottom: 6 }}>{t("report.flowsNote")}</Text>}
        {full && !complete && <Text style={{ fontSize: 8.5, color: "#9a3412", marginTop: -4, marginBottom: 6 }}>{t("report.manualDropsNote")}</Text>}

        {/* Key figures */}
        <View wrap={false} style={{ flexDirection: "row", borderWidth: 0.5, borderColor: colors.line, marginBottom: 4 }}>
          {(
            [
              [t("report.area"), `${n(summary.area, 1)} m²`],
              [t("report.volume"), `${n(volume, 0)} m³`],
              [t("report.supply"), `${n(summary.supply)} m³/h`],
              [t("report.extract"), `${n(summary.extract)} m³/h`],
              [t("report.airChange"), airChange ? `${formatNumber(airChange, 2)} h-1` : "–"],
              [t("report.base"), `${n(summary.minSupply)} m³/h`],
            ] as [string, string][]
          ).map(([label, value], i) => (
            <View key={label} style={{ flex: 1, padding: 4, borderLeftWidth: i ? 0.5 : 0, borderLeftColor: colors.line }}>
              <Text style={{ fontSize: 6.5, color: colors.muted }}>{label}</Text>
              <Text style={{ fontSize: 9.5, ...styles.bold }}>{value}</Text>
            </View>
          ))}
        </View>

        <Heading>{t("tabs.rooms")} [m³/h]</Heading>
        <View>
          {head}
          {rows.map((row) => {
            const type = findRoomType(row.type);
            return (
              <View key={row.id} wrap={false} style={{ flexDirection: "row", fontSize: 7.5, borderBottomWidth: 0.5, borderBottomColor: colors.line }}>
                {hasFloors && <Text style={{ ...cell, width: w.floor }}>{row.floor}</Text>}
                <Text style={{ ...cell, width: w.number }}>{row.number}</Text>
                <Text style={{ ...cell, flex: 1 }}>{row.name}</Text>
                <Text style={{ ...cell, width: w.type }}>{type?.code ?? ""}</Text>
                <Text style={{ ...cell, width: w.area, textAlign: "right" }}>{n(row.area, 1)}</Text>
                {[
                  values({ recommended: row.recommendedSupply, min: row.minSupply, used: row.supply, party: row.partySupply }),
                  values({ recommended: row.recommendedExtract, min: row.minExtract, used: row.extract, party: row.partyExtract }),
                ].flatMap((list, s) =>
                  list.map((v, i) => (
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
              values({ recommended: summary.recommendedSupply, min: summary.minSupply, used: summary.supply, party: partyFlow }),
              values({ recommended: summary.recommendedExtract, min: summary.minExtract, used: summary.extract, party: partyFlow }),
            ].flatMap((list, s) =>
              list.map((v, i) => (
                <Text key={`${s}-${i}`} style={{ ...cell, width: w.flow, textAlign: "right" }}>
                  {n(v)}
                </Text>
              )),
            )}
          </View>
        </View>
        {usedTypes.length > 0 && (
          <Text style={{ fontSize: 7, color: colors.muted, marginTop: 3 }}>
            {t("rooms.type")}: {usedTypes.map((type) => `${type.code} ${t(`roomTypes.${type.key}`)}`).join(" · ")}
          </Text>
        )}
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

        {full && (
          <>
            <Heading>{t("tabs.device")}</Heading>
            {product ? (
              <>
                <KeyValues
                  rows={[
                    [t("device.device"), `Zehnder ${product.name}`],
                    ...(hasOptions(result.options)
                      ? ([
                          [
                            t("device.attachmentsPdf"),
                            optionsLabel(product.key, result.options, {
                              erv: t("device.ervPdf"),
                              fond: "ComfoFond-L Q",
                              fondFilter: t("device.fondFilterPdf"),
                              fondLeft: t("device.fondLeftPdf"),
                              fondRight: t("device.fondRightPdf"),
                            }),
                          ],
                        ] as [string, string][])
                      : []),
                  ]}
                />
                <View wrap={false}>
                  <SubHeading>{t("report.pressureTitle")}</SubHeading>
                  <KeyValues
                    rows={[
                      [t("report.pressureSource"), complete && result.drops.system ? t("report.fromSystem", { name: result.drops.system.name }) : t("report.manual")],
                      [
                        t("device.supplyDrop"),
                        `${n(result.drops.supply)} Pa${result.drops.fond !== null ? ` (${t("device.inclFondPdf", { dp: n(result.drops.fond) })})` : ""}`,
                      ],
                      [t("device.extractDrop"), `${n(result.drops.extract)} Pa`],
                      ...(pressure.status
                        ? ([[t("report.table7"), t(`device.pressure.${pressure.status}`, { total: n((result.drops.supply ?? 0) + (result.drops.extract ?? 0)), limit: pressure.limit ?? "", target: pressure.target ?? "" })]] as [
                            string,
                            string,
                          ][])
                        : []),
                    ]}
                  />
                </View>
                <View wrap={false}>
                  <SubHeading>{t("report.deviceCheck")}</SubHeading>
                  <KeyValues
                    rows={[
                      ...(datasheet
                        ? ([
                            [t("device.datasheet.supply"), `${n(datasheet.supply.maxPressure)} Pa ${datasheet.supply.ok === false ? "!" : ""}`],
                            [t("device.datasheet.extract"), `${n(datasheet.extract.maxPressure)} Pa ${datasheet.extract.ok === false ? "!" : ""}`],
                            [t("device.datasheet.power"), `${n(datasheet.powerW)} W`],
                          ] as [string, string][])
                        : []),
                      [t("device.spi"), spi === null ? t("device.spiUnknown") : `${formatNumber(spi, 2)} ${t("device.spiUnit")}`],
                      ...(spi === null
                        ? []
                        : ([
                            [t("device.spiLimitPdf", { limit: formatNumber(spiLimit, 2) }), yesNo(spi < spiLimit)],
                            [t("device.spiTargetPdf", { target: formatNumber(spiTarget, 2) }), yesNo(spi < spiTarget)],
                          ] as [string, string][])),
                    ]}
                  />
                </View>
                {(datasheet?.supply.ok === false || datasheet?.extract.ok === false) && (
                  <Text style={{ color: "#b91c1c", marginTop: 4 }}>{t("device.datasheet.tooSmall")}</Text>
                )}
                {(supply?.tooSmall || extract?.tooSmall) && <Text style={{ color: "#b91c1c", marginTop: 4 }}>{t("device.tooSmall")}</Text>}
                {(supply?.k || extract?.k) && (
                  <View wrap={false} style={{ marginTop: 8 }}>
                    <SubHeading>{t("device.op.title")}</SubHeading>
                    <Text style={{ fontSize: 7, color: colors.muted, marginBottom: 2 }}>
                      {complete && result.drops.system ? t("device.op.sourceSystem", { name: result.drops.system.name }) : t("device.op.sourceManual")}
                    </Text>
                    <View style={{ flexDirection: "row", backgroundColor: colors.headerFill, ...styles.bold, fontSize: 7 }}>
                      <Text style={{ ...cell, flex: 1 }}>{t("device.op.point")}</Text>
                      {(["supplyShort", "extractShort"] as const).flatMap((side) => [
                        <Text key={`${side}c`} style={{ ...cell, width: 48 }}>{`${t(side)} ${t("device.op.curve")}`}</Text>,
                        <Text key={`${side}q`} style={{ ...cell, width: 34, textAlign: "right" }}>m³/h</Text>,
                        <Text key={`${side}p`} style={{ ...cell, width: 28, textAlign: "right" }}>Pa</Text>,
                        <Text key={`${side}w`} style={{ ...cell, width: 26, textAlign: "right" }}>W</Text>,
                      ])}
                    </View>
                    {(
                      [
                        ["normal", t("device.op.normal")],
                        ["minimum", t("device.op.minimum")],
                        ["party", t("device.op.party")],
                      ] as const
                    ).map(([key, label]) => (
                      <View key={key} style={{ flexDirection: "row", fontSize: 7.5, borderBottomWidth: 0.5, borderBottomColor: colors.line, ...(key === "normal" ? styles.bold : {}) }}>
                        <Text style={{ ...cell, flex: 1 }}>{label}</Text>
                        {[supply, extract].flatMap((op, i) => {
                          const p = op?.[key] ?? null;
                          return [
                            <Text key={`${i}c`} style={{ ...cell, width: 48 }}>{p ? (p.curve ?? t("device.op.stepless")) : "–"}</Text>,
                            <Text key={`${i}q`} style={{ ...cell, width: 34, textAlign: "right" }}>{n(p?.flow)}</Text>,
                            <Text key={`${i}p`} style={{ ...cell, width: 28, textAlign: "right" }}>{n(p?.pressure)}</Text>,
                            <Text key={`${i}w`} style={{ ...cell, width: 26, textAlign: "right" }}>{n(p?.powerW)}</Text>,
                          ];
                        })}
                      </View>
                    ))}
                    {partyFlow ? <Text style={{ fontSize: 7, color: colors.muted, marginTop: 2 }}>{t("device.op.partyCardHint", { flow: n(partyFlow) })}</Text> : null}
                  </View>
                )}
                <View wrap={false} style={{ marginTop: 10 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    {(["supply", "extract"] as const).map((key) => {
                      const op = key === "supply" ? supply : extract;
                      return op && product.device ? <PdfDeviceChart key={key} chart={deviceChart(op, product.device.measurements, complete)} title={t(`device.chart.${key}Pdf`)} /> : null;
                    })}
                  </View>
                  <Text style={{ fontSize: 7, color: colors.muted, marginTop: 2 }}>{complete ? t("device.chart.pdfLegend") : t("device.chart.pdfLegendPending")}</Text>
                </View>
              </>
            ) : (
              <Text>{t("device.choose")}</Text>
            )}
          </>
        )}

        {data.notes.trim() !== "" && (
          <View wrap={false}>
            <Heading>{t("notes.own")}</Heading>
            <Text>{winAnsi(data.notes)}</Text>
          </View>
        )}
      </LetterPage>
    </Document>
  );
}

export function Heading({ children }: { children: React.ReactNode }) {
  return <Text style={{ ...styles.bold, fontSize: 10.5, marginTop: 14, marginBottom: 5, color: colors.brand }}>{children}</Text>;
}

export function SubHeading({ children }: { children: React.ReactNode }) {
  return <Text style={{ ...styles.bold, fontSize: 8.5, marginTop: 8, marginBottom: 2 }}>{children}</Text>;
}

export function KeyValues({ rows }: { rows: [string, string][] }) {
  return (
    <View>
      {rows.map(([label, value]) => (
        <View key={label} wrap={false} style={{ flexDirection: "row", paddingVertical: 1.5 }}>
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

function PdfDeviceChart({ chart, title }: { chart: DeviceChartData; title: string }) {
  const x = (v: number) => pad.left + (v / chart.xMax) * (CW - pad.left - pad.right);
  const y = (p: number) => CH - pad.bottom - (p / chart.yMax) * (CH - pad.top - pad.bottom);
  const path = (points: [number, number][]) => points.map(([v, p], i) => `${i ? "L" : "M"}${x(v).toFixed(1)} ${y(p).toFixed(1)}`).join(" ");
  const key = (p: OperatingPoint | null, fill: string) => (p ? <Circle cx={x(p.flow)} cy={y(p.pressure)} r={2.8} fill={fill} /> : null);

  return (
    <View style={{ width: CW }}>
      <Text style={{ fontSize: 8, ...styles.bold, marginBottom: 2 }}>{title}</Text>
      <Svg width={CW} height={CH}>
        {chartTicks(chart.yMax).map((tick) => (
          <G key={`y${tick}`}>
            <Line x1={pad.left} x2={CW - pad.right} y1={y(tick)} y2={y(tick)} stroke="#dddddd" strokeWidth={0.5} />
            <Text x={pad.left - 3} y={y(tick) + 2} style={{ fontSize: 6 }} textAnchor="end" fill={colors.muted}>
              {String(tick)}
            </Text>
          </G>
        ))}
        {chartTicks(chart.xMax).map((tick) => (
          <G key={`x${tick}`}>
            <Line x1={x(tick)} x2={x(tick)} y1={pad.top} y2={CH - pad.bottom} stroke="#dddddd" strokeWidth={0.5} />
            <Text x={x(tick)} y={CH - pad.bottom + 8} style={{ fontSize: 6 }} textAnchor="middle" fill={colors.muted}>
              {String(tick)}
            </Text>
          </G>
        ))}
        {chart.curves.map((c, i) =>
          c.points.length > 1 ? (
            <G key={c.label}>
              <Path d={path(c.points)} fill="none" stroke={curveColors[i % curveColors.length]} strokeWidth={i === 0 ? 1.2 : 0.8} />
              <Text x={x(c.points[0][0]) + 2} y={y(c.points[0][1]) - 1.5} style={{ fontSize: 4.5 }} fill={curveColors[i % curveColors.length]}>
                {winAnsi(c.label)}
              </Text>
            </G>
          ) : null,
        )}
        {chart.control === "constantFlow" && chart.limit.length > 1 && <Path d={path(chart.limit)} fill="none" stroke={colors.text} strokeWidth={1.3} />}
        {chart.measurements.map((m, i) =>
          m.qv <= chart.xMax && m.pst <= chart.yMax ? <Rect key={i} x={x(m.qv) - 1.4} y={y(m.pst) - 1.4} width={2.8} height={2.8} fill="#ffffff" stroke={colors.muted} strokeWidth={0.5} /> : null,
        )}
        {chart.nominalFlow > 0 && chart.nominalFlow <= chart.xMax && <Line x1={x(chart.nominalFlow)} x2={x(chart.nominalFlow)} y1={pad.top} y2={CH - pad.bottom} stroke={colors.muted} strokeWidth={0.6} strokeDasharray="1.5 2" />}
        {chart.system && chart.system.length > 1 && <Path d={path(chart.system)} fill="none" stroke="#c0392b" strokeWidth={1} strokeDasharray="3 2" />}
        {chart.stagePoints.map((p, i) => (
          <Circle key={p.curve ?? i} cx={x(p.flow)} cy={y(p.pressure)} r={1.3} fill={curveColors[Math.max(0, chart.curves.findIndex((c) => c.label === p.curve)) % curveColors.length]} />
        ))}
        {key(chart.minimum, "#059669")}
        {key(chart.normal, colors.brand)}
        {key(chart.party, "#c0392b")}
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
