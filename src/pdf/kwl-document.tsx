import { Document, Text, View } from "@react-pdf/renderer";

import { hasOptions, optionsLabel } from "@/lib/kwl/attachments";
import { findRoomType, spiLimit, spiTarget } from "@/lib/kwl/calc";
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
  const { spi } = deviceResult;
  const full = variant === "full";
  const complete = result.drops.source === "system";
  const yesNo = (ok: boolean) => (ok ? t("yes") : t("no"));
  const title = full ? t("title") : t("report.flowsTitle");

  // Rooms table: floor, number, name, type, area; per side recommended / minimum / used.
  const cols = ["recommended", "minimum", "used"] as const;
  const w = { floor: 36, number: 28, type: 28, area: 30, flow: 38 };
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
  const values = (row: { recommended: number | null; min: number | null; used: number | null }) => [row.recommended, row.min, row.used];

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
                  values({ recommended: row.recommendedSupply, min: row.minSupply, used: row.supply }),
                  values({ recommended: row.recommendedExtract, min: row.minExtract, used: row.extract }),
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
              values({ recommended: summary.recommendedSupply, min: summary.minSupply, used: summary.supply }),
              values({ recommended: summary.recommendedExtract, min: summary.minExtract, used: summary.extract }),
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
