import { Document, Text, View } from "@react-pdf/renderer";

import type { FloorResult, FloorSystemData } from "@/lib/heating/floor";
import type { Construction, HeatLoadData, HeatLoadResult, HeatSite } from "@/lib/heating/heat-load";
import { formatNumber } from "@/lib/number-input";
import type { FirmSettings } from "@/lib/supabase/types";

import { formatDate } from "./format";
import { Heading, KeyValues, type KwlTranslate, SubHeading, winAnsi } from "./kwl-document";
import { AddressAndMeta, colors, LetterPage, type LogoSource, styles } from "./letterhead";

const n = (value: number | null | undefined, decimals = 0) =>
  value === null || value === undefined || !Number.isFinite(value) ? "-" : formatNumber(value, decimals);

type Column = { label: string; width: number; align?: "left" | "right" };

/** Compact table: header row plus rows of pre-formatted cells; optional bold footer. */
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

type Common = {
  firm: FirmSettings;
  logo: LogoSource | null;
  t: KwlTranslate;
  pageLabel: (page: number, total: number) => string;
  projectLabel: string;
  dateLabel: string;
  project: { number: string; name: string };
  name: string;
};

/** Wärmebedarf / Norm-Heizlast after SIA 384/2: basics, room list with building total, element details per room. */
export function HeatLoadDocument({ firm, logo, t, pageLabel, projectLabel, dateLabel, project, name, data, site, catalog, result }: Common & {
  data: HeatLoadData;
  site: HeatSite;
  catalog: Construction[];
  result: HeatLoadResult;
}) {
  const s = (key: string, values?: Record<string, string | number>) => winAnsi(t(`heatLoad.${key}`, values));
  const title = `${s("pdfTitle")} · ${winAnsi(name)}`;
  const r = result.site;
  const basics: [string, string][] = [
    [s("site.station"), site.station ?? "-"],
    [s("site.altitude"), site.altitude === null ? "-" : `${site.altitude} m`],
    [s("site.thetaEClm"), `${n(r.thetaEClm, 1)} °C`],
    [s("site.altitudeCorrection"), `${n(r.altitudeCorrection, 2)} K`],
    [s("site.inertiaCorrection"), `${n(r.inertia, 2)} K (${s(`inertia.${site.inertia}`)})`],
    [s("site.thetaE0"), `${n(r.thetaE0, 0)} °C`],
    [s("site.thetaMean"), `${n(r.thetaMean, 1)} °C`],
    [s("site.rhoCp"), `${n(r.rhoCp, 4)} Wh/m³K`],
    [s("site.airtight"), s(`airtight.${site.airtight}`)],
    [s("site.groundwater"), `${s(`groundwater.${site.groundwater}`)} (f_GW ${n(r.fGW, 2)})`],
    [s("concept"), s(`concepts.${data.concept}`)],
    [s("fiz"), n(result.fiz, 2)],
  ];
  const heated = data.rooms.map((room, i) => ({ room, res: result.rooms[i] }));
  const columns: Column[] = [
    { label: s("room.number"), width: 38 },
    { label: s("room.name"), width: 110 },
    { label: s("room.floor"), width: 30 },
    { label: "θ [°C]", width: 34, align: "right" },
    { label: "A [m²]", width: 40, align: "right" },
    { label: "Φ_T [W]", width: 44, align: "right" },
    { label: "Φ_V [W]", width: 44, align: "right" },
    { label: "Φ_g [W]", width: 38, align: "right" },
    { label: "Φ_HL [W]", width: 48, align: "right" },
    { label: "W/m²", width: 36, align: "right" },
    { label: "n_min", width: 32, align: "right" },
  ];
  const rows = heated.map(({ room, res }) =>
    room.kind === "passive"
      ? [room.number, `${room.name} (${s("kinds.passive")})`, room.floor, n(res.passiveTemp, 1), n(res.area, 1), "", "", "", "", "", ""]
      : [room.number, room.name, room.floor, n(room.thetaInt, 1), n(res.area, 1), n(res.phiTotal), n(res.phiV), n(res.gains), n(res.phiHL), n(res.specific, 1), n(res.nMin, 2)],
  );
  const elementColumns: Column[] = [
    { label: s("el.construction"), width: 120 },
    { label: s("el.orientation"), width: 26 },
    { label: s("el.adjacency"), width: 70 },
    { label: s("el.area"), width: 42, align: "right" },
    { label: "U/ψ/χ", width: 40, align: "right" },
    { label: "θx [°C]", width: 38, align: "right" },
    { label: "f", width: 36, align: "right" },
    { label: "H [W/K]", width: 44, align: "right" },
    { label: "Φ [W]", width: 44, align: "right" },
  ];

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
        <Heading>{s("pdfBasics")}</Heading>
        <View style={{ fontSize: 8.5 }}>
          <KeyValues rows={basics.map(([a, b]) => [a, winAnsi(b)])} />
        </View>
        <Heading>{s("rooms")}</Heading>
        <Table columns={columns} rows={rows} />
        <Heading>{s("pdfBuilding")}</Heading>
        <View style={{ fontSize: 8.5 }}>
          <KeyValues
            rows={[
              [s("pdfDoc.phiT"), `${n(result.phiT)} W`],
              [s("pdfDoc.phiTNeighbours"), `${n(result.phiTNeighbours)} W`],
              [s("pdfDoc.phiV"), `${n(result.fiz, 2)} × ${n(result.phiV)} W = ${n(result.fiz * result.phiV)} W`],
              [s("pdfDoc.gains"), `${n(result.gains)} W`],
              [s("result.building"), `${n(result.building)} W`],
              [s("result.specific"), `${n(result.specific, 1)} W/m² (${n(result.area, 1)} m²)`],
              [s("result.roomSum"), `${n(result.roomSum)} W`],
            ].map(([a, b]) => [a, winAnsi(b)])}
          />
        </View>
        <Text style={{ fontSize: 7, color: colors.muted, marginTop: 4 }}>{s("pdfDoc.buildingHint")}</Text>

        <Heading>{s("pdfElements")}</Heading>
        {heated.map(({ room, res }) => (
          <View key={room.id} style={{ marginBottom: 6 }}>
            <SubHeading>{winAnsi(`${room.number} ${room.name}`.trim())}</SubHeading>
            <Table
              fontSize={7}
              columns={elementColumns}
              rows={room.elements.map((e, k) => {
                const c = catalog.find((x) => x.id === e.constructionId);
                const er = res.elements[k];
                return [
                  c ? `${c.code} ${c.name}`.trim() : "-",
                  e.orientation,
                  s(`adjacency.${e.adjacency}`),
                  n(er.quantity, 2),
                  n(er.value, 3),
                  er.thetaX === null ? (e.neighbourMode === "table4" ? s("neighbour.table4") : "") : n(er.thetaX, 1),
                  er.f1 === null ? "" : n(er.f1 + er.f2, 3),
                  n(er.h, 2),
                  n(er.phi),
                ];
              })}
              footer={
                room.kind === "heated"
                  ? [s("pdfDoc.roomTotal", { nMin: n(res.nMin, 2), qv: n(res.qv, 1) }), "", "", "", "", "", "", n(res.hT.outside + res.hT.unheated + res.hT.heated + res.hT.ground, 2), n(res.phiTotal)]
                  : undefined
              }
            />
          </View>
        ))}
        {data.notes.trim() && (
          <>
            <Heading>{s("notes")}</Heading>
            <Text style={{ fontSize: 8.5 }}>{winAnsi(data.notes)}</Text>
          </>
        )}
        <Text style={{ fontSize: 7, color: colors.muted, marginTop: 10 }}>{s("normHint")}</Text>
      </LetterPage>
    </Document>
  );
}

/** Floor heating (HAKA.GERODUR): group temperatures and per distributor the rooms with spacing, output and hydraulics. */
export function FloorHeatingDocument({ firm, logo, t, pageLabel, projectLabel, dateLabel, project, name, data, result }: Common & { data: FloorSystemData; result: FloorResult }) {
  const s = (key: string, values?: Record<string, string | number>) => winAnsi(t(`floorHeating.${key}`, values));
  const title = `${s("pdfTitle")} · ${winAnsi(name)}`;
  const columns: Column[] = [
    { label: s("col.room"), width: 96 },
    { label: "Qh [W]", width: 38, align: "right" },
    { label: "A [m²]", width: 34, align: "right" },
    { label: "θ", width: 24, align: "right" },
    { label: "Rλ", width: 30, align: "right" },
    { label: "A_R", width: 28, align: "right" },
    { label: "q_h", width: 30, align: "right" },
    { label: "Δθ", width: 26, align: "right" },
    { label: "q_A", width: 30, align: "right" },
    { label: "s [cm]", width: 30, align: "right" },
    { label: "q_eff", width: 30, align: "right" },
    { label: "tu", width: 26, align: "right" },
    { label: "Q_Boden", width: 38, align: "right" },
    { label: "Q_tot [W]", width: 44, align: "right" },
    { label: "m [kg/h]", width: 40, align: "right" },
    { label: s("col.rings"), width: 30, align: "right" },
    { label: "L [m]", width: 36, align: "right" },
    { label: "R [Pa/m]", width: 38, align: "right" },
    { label: "Δp [kPa]", width: 38, align: "right" },
  ];
  return (
    <Document title={title} author={firm.name}>
      <LetterPage firm={firm} logo={logo} pageLabel={pageLabel} orientation="landscape">
        <AddressAndMeta
          recipient={[]}
          meta={[
            [projectLabel, `${project.number} ${project.name}`],
            [dateLabel, formatDate(new Date())],
          ]}
        />
        <Text style={styles.title}>{title}</Text>
        <View style={{ fontSize: 8.5 }}>
          <KeyValues
            rows={[
              [s("result.flowReturn"), result.flow === null ? "-" : `${n(result.flow)} / ${n(result.ret)} °C (${s("spread")} ${n(data.spread, 1)} K)`],
              [s("result.mean"), `${n(result.mean, 1)} °C`],
              [s("pipe"), data.pipe],
              [s("insulation"), `${data.insulation} mm`],
              [s("result.total"), `${n(result.total)} W`],
              [s("result.massFlow"), `${n(result.massFlow)} kg/h`],
              [s("result.downward"), `${n(result.downward)} W`],
            ].map(([a, b]) => [a, winAnsi(b)])}
          />
        </View>
        {data.distributors.map((d, i) => {
          const dr = result.distributors[i];
          return (
            <View key={d.id}>
              <Heading>
                {winAnsi(d.name)} · {s("distributorSummary", { rings: n(dr.rings), total: n(dr.total), massFlow: n(dr.massFlow), pressure: n(dr.maxPressure / 1000, 1) })}
              </Heading>
              <Table
                fontSize={7}
                columns={columns}
                rows={dr.rooms.map((r, k) => [
                  r.name + (r.warnings.length ? " (!)" : ""),
                  n(r.load),
                  n(r.area, 1),
                  n(r.roomTemp, 0),
                  n(r.chart, 3),
                  n(d.rooms[k].edgeArea, 1),
                  n(r.specific, 1),
                  n(r.dTheta, 1),
                  n(r.innerSpecific, 1),
                  n(r.spacing, 1),
                  n(r.installed, 1),
                  n(r.belowTemp, 1),
                  n(r.downward),
                  n(r.total),
                  n(r.massFlow, 1),
                  n(r.rings),
                  n(r.pipeLength, 1),
                  n(r.gradient),
                  n(r.pressure / 1000, 1),
                ])}
              />
              {dr.rooms.some((r) => r.warnings.length) && (
                <View style={{ fontSize: 7, color: colors.muted, marginTop: 2 }}>
                  {dr.rooms
                    .filter((r) => r.warnings.length)
                    .map((r) => (
                      <Text key={r.id}>{winAnsi(`(!) ${r.name}: ${r.warnings.map((w) => t(`floorHeating.warnings.${w}`)).join(", ")}`)}</Text>
                    ))}
                </View>
              )}
            </View>
          );
        })}
        {data.notes.trim() && (
          <>
            <Heading>{s("notes")}</Heading>
            <Text style={{ fontSize: 8.5 }}>{winAnsi(data.notes)}</Text>
          </>
        )}
        <Text style={{ fontSize: 7, color: colors.muted, marginTop: 10 }}>{s("sourceHint")}</Text>
      </LetterPage>
    </Document>
  );
}
