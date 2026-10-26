import { Document, Text, View } from "@react-pdf/renderer";

import type { BuildingModel } from "@/lib/building/schema";
import type { Sia3801Result, ZoneResult } from "@/lib/building/sia3801";
import { usageCategories } from "@/lib/building/sia3801-data";
import { formatNumber } from "@/lib/number-input";
import type { FirmSettings } from "@/lib/supabase/types";

import { formatDate } from "./format";
import { Heading, KeyValues, type KwlTranslate, SubHeading, winAnsi } from "./kwl-document";
import { AddressAndMeta, colors, LetterPage, type LogoSource, styles } from "./letterhead";

const n = (value: number | null | undefined, decimals = 0) =>
  value === null || value === undefined || !Number.isFinite(value) ? "-" : formatNumber(value, decimals);

type Column = { label: string; width: number; align?: "left" | "right" };

function Table({ columns, rows, footer, fontSize = 7.5 }: { columns: Column[]; rows: string[][]; footer?: string[]; fontSize?: number }) {
  const cell = (c: Column, text: string, i: number, bold = false) => (
    <Text key={i} style={{ width: c.width, textAlign: c.align ?? "left", paddingHorizontal: 2, ...(bold ? styles.bold : {}) }}>
      {winAnsi(text)}
    </Text>
  );
  return (
    <View style={{ fontSize }}>
      <View fixed style={{ flexDirection: "row", backgroundColor: colors.headerFill, paddingVertical: 2 }}>
        {columns.map((c, i) => cell(c, c.label, i, true))}
      </View>
      {rows.map((row, r) => (
        <View key={r} wrap={false} style={{ flexDirection: "row", paddingVertical: 1.5, borderBottomWidth: 0.5, borderBottomColor: colors.line }}>
          {columns.map((c, i) => cell(c, row[i] ?? "", i))}
        </View>
      ))}
      {footer && (
        <View wrap={false} style={{ flexDirection: "row", paddingVertical: 2, borderTopWidth: 0.8, borderTopColor: colors.text }}>
          {columns.map((c, i) => cell(c, footer[i] ?? "", i, true))}
        </View>
      )}
    </View>
  );
}

/** Heizwärmebedarf after SIA 380/1: climate, building result, per zone the inputs, monthly balance and element list. */
export function Sia3801Document({
  firm,
  logo,
  t,
  pageLabel,
  projectLabel,
  dateLabel,
  project,
  model,
  result,
}: {
  firm: FirmSettings;
  logo: LogoSource | null;
  t: KwlTranslate;
  pageLabel: (page: number, total: number) => string;
  projectLabel: string;
  dateLabel: string;
  project: { number: string; name: string };
  model: BuildingModel;
  result: Sia3801Result;
}) {
  const s = (key: string, values?: Record<string, string | number>) => winAnsi(t(`building.sia3801.${key}`, values));
  const z = (key: string) => winAnsi(t(`building.zones.${key}`));
  const months = t("building.sia3801.months").split(",");
  const title = s("pdfTitle");
  const station = result.station;

  const building: [string, string][] = [
    [s("climate"), station ? `${station.name} (${s(`sets.${result.climateSet}`)}, ${n(station.altitude)} m, θe,avg ${n(station.thetaMean, 1)} °C)` : "-"],
    [s("building.areaE"), `${n(result.areaE, 1)} m²`],
    [s("building.ath"), `${n(result.ath, 1)} m² (A_th/A_E ${result.areaE > 0 ? n(result.ath / result.areaE, 2) : "-"})`],
    [s("building.qH"), `${n(result.qH)} kWh/a`],
    [s("building.qHSpecific"), `${n(result.qHSpecific, 1)} kWh/m²`],
    [s("building.limit"), result.limit === null ? "-" : `${n(result.limit, 1)} kWh/m² – ${result.ok ? s("building.ok") : s("building.notOk")}`],
    [s("building.target"), result.target === null ? "-" : `${n(result.target, 1)} kWh/m²`],
  ];

  const monthColumns: Column[] = [
    { label: s("cols.month"), width: 36 },
    { label: "θe", width: 32, align: "right" },
    ...(["qT", "qV", "qIEl", "qIP", "qS", "qG", "gamma", "eta", "qUg", "qH"] as const).map((c) => ({ label: s(`cols.${c}`), width: c === "gamma" || c === "eta" ? 34 : 44, align: "right" as const })),
  ];
  const elementColumns: Column[] = [
    { label: s("elements.room"), width: 34 },
    { label: s("elements.kind"), width: 54 },
    { label: s("elements.construction"), width: 120 },
    { label: s("elements.orientation"), width: 26 },
    { label: s("elements.adjacency"), width: 64 },
    { label: "A [m²]", width: 44, align: "right" },
    { label: "U", width: 36, align: "right" },
    { label: "b", width: 28, align: "right" },
    { label: "Q_T [kWh]", width: 50, align: "right" },
    { label: "Q_s [kWh]", width: 50, align: "right" },
  ];

  const zoneBlock = (zr: ZoneResult) => {
    const usage = usageCategories[zr.zone.category];
    const facts: [string, string][] = [
      [s("zone.category"), `${usage.label} · ${z(`states.${zr.zone.state}`)}`],
      [s("zone.thetaInt"), `${n(zr.thetaInt, 1)} °C · ${z(`regulations.${zr.zone.regulation}`)} · ${z(`constructions.${zr.zone.construction}`)}`],
      [s("zone.rooms", { count: zr.rooms.length }), zr.rooms.map((r) => r.number).join(", ")],
      [s("building.areaE"), `${n(zr.areaE, 1)} m²`],
      [s("building.ath"), `${n(zr.ath, 1)} m² (A_th/A_E ${n(zr.hullRatio, 2)})`],
      [s("zone.airflow"), `${n(zr.airflow, 2)} m³/(h m²)`],
      ["H / τ", `${n(zr.h)} W/K / ${n(zr.tau)} h`],
      [s("building.qHSpecific"), `${n(zr.qHSpecific, 1)} kWh/m²`],
      [s("building.limit"), zr.limit === null ? "-" : `${n(zr.limit, 1)} kWh/m² – ${zr.ok ? s("building.ok") : s("building.notOk")}`],
      [s("building.target"), zr.target === null ? "-" : `${n(zr.target, 1)} kWh/m²`],
    ];
    const perM2 = (v: number) => (zr.areaE > 0 ? n(v / zr.areaE, 1) : "-");
    const rows = zr.months.map((m, i) => [months[i], n(m.thetaE, 1), n(m.qT), n(m.qV), n(m.qIEl), n(m.qIP), n(m.qS), n(m.qG), n(m.gamma, 2), n(m.eta, 2), n(m.qUg), n(m.qH)]);
    const y = zr.year;
    return (
      <View key={zr.zone.id}>
        <Heading>{winAnsi(zr.zone.name)}</Heading>
        <View style={{ fontSize: 8.5 }}>
          <KeyValues rows={facts.map(([a, b]) => [a, winAnsi(b)])} />
        </View>
        {zr.warnings.length > 0 && <Text style={{ fontSize: 7, color: colors.muted, marginTop: 3 }}>{zr.warnings.map((w) => s(`warnings.${w}`)).join(" · ")}</Text>}
        <SubHeading>{s("pdfMonths")}</SubHeading>
        <Table columns={monthColumns} rows={rows} footer={[s("cols.year"), "", n(y.qT), n(y.qV), n(y.qIEl), n(y.qIP), n(y.qS), n(y.qG), "", "", n(y.qUg), n(y.qH)]} fontSize={7} />
        <Text style={{ fontSize: 7, color: colors.muted, marginTop: 2 }}>
          {winAnsi(`kWh/m²: Q_T ${perM2(y.qT)} · Q_V ${perM2(y.qV)} · Q_i ${perM2(y.qIEl + y.qIP)} · Q_s ${perM2(y.qS)} · Q_ug ${perM2(y.qUg)} · Q_H ${perM2(y.qH)}`)}
        </Text>
        <SubHeading>{s("elements.title", { count: zr.elements.length })}</SubHeading>
        <Table
          fontSize={6.5}
          columns={elementColumns}
          rows={zr.elements.map((e) => [e.roomNumber, s(`elements.kinds.${e.kind}`), e.construction, e.orientation, s(`elements.adjacencies.${e.adjacency}`), n(e.area, 2), e.u === null ? "?" : n(e.u, 3), n(e.b, 2), n(e.qT), e.qS === null ? "" : n(e.qS)])}
          footer={[s("cols.year"), "", "", "", "", n(zr.ath, 1), "", "", n(y.qT), n(y.qS)]}
        />
      </View>
    );
  };

  return (
    <Document title={title} author={firm.name}>
      <LetterPage firm={firm} logo={logo} pageLabel={pageLabel}>
        <AddressAndMeta
          recipient={[]}
          meta={[
            [projectLabel, `${project.number} ${project.name}`],
            [dateLabel, formatDate(new Date())],
          ]}
        />
        <Text style={styles.title}>{title}</Text>
        <Heading>{s("pdfBuilding")}</Heading>
        <View style={{ fontSize: 8.5 }}>
          <KeyValues rows={building.map(([a, b]) => [a, winAnsi(b)])} />
        </View>
        {result.warnings.length > 0 && (
          <Text style={{ fontSize: 7, color: colors.muted, marginTop: 4 }}>{result.warnings.map((w) => s(`warnings.${w}`)).join(" · ")}</Text>
        )}
        {result.zones.map(zoneBlock)}
        <Text style={{ fontSize: 7, color: colors.muted, marginTop: 10 }}>{s("pdfNote")}</Text>
        {model.notes.trim() && (
          <>
            <Heading>{winAnsi(t("building.notes"))}</Heading>
            <Text style={{ fontSize: 8.5 }}>{winAnsi(model.notes)}</Text>
          </>
        )}
      </LetterPage>
    </Document>
  );
}
