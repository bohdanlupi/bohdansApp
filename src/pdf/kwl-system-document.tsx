import { Circle, Document, G, Line, Path, Polygon, Rect, Svg, Text, View } from "@react-pdf/renderer";

import { hasOptions, optionsList } from "@/lib/kwl/attachments";
import { spiLimit, spiTarget } from "@/lib/kwl/calc";
import type { NetNode, Quantity, RoomFlow, SystemData, SystemResult, systemChecks } from "@/lib/kwl/network";
import type { DeviceCheck } from "@/lib/kwl/network-device";
import { bendAngles, findProduct, measuredCoverPrefix } from "@/lib/kwl/products";
import { type AirKind, airColors, type SchemaLayout } from "@/lib/kwl/schema-layout";
import { formatNumber } from "@/lib/number-input";
import type { FirmSettings } from "@/lib/supabase/types";

import { formatDate } from "./format";
import { Heading, KeyValues, type KwlTranslate, type PressureCheck, SubHeading, winAnsi } from "./kwl-document";
import { AddressAndMeta, colors, LetterPage, styles, type LogoSource } from "./letterhead";

const n = (value: number | null | undefined, decimals = 0) =>
  value === null || value === undefined || !Number.isFinite(value) ? "" : formatNumber(value, decimals);
const cell = { paddingVertical: 2, paddingHorizontal: 2 };
type Lists = "outdoor" | "supply" | "extract" | "exhaust";

/** Lüftungsanlage: device and results, Prinzipschema, elements per air type, strands and quantities. */
export function KwlSystemDocument({
  firm,
  logo,
  t: translate,
  pageLabel,
  projectLabel,
  dateLabel,
  project,
  name,
  data,
  rooms,
  dwellings,
  result,
  device,
  checks,
  pressure,
  layout,
  quantities,
}: {
  firm: FirmSettings;
  logo: LogoSource | null;
  /** Translator for the whole messages (keys «kwlSystem.…», «kwlDevice.…»). */
  t: KwlTranslate;
  pageLabel: (page: number, total: number) => string;
  projectLabel: string;
  dateLabel: string;
  project: { number: string; name: string };
  name: string;
  data: SystemData;
  rooms: RoomFlow[];
  dwellings: string[];
  result: SystemResult;
  device: DeviceCheck;
  checks: ReturnType<typeof systemChecks>;
  pressure: PressureCheck;
  layout: SchemaLayout;
  quantities: Quantity[];
}) {
  const t: KwlTranslate = (key, values) => winAnsi(translate(key, values));
  const s = (key: string, values?: Record<string, string | number>) => t(`kwlSystem.${key}`, values);
  const title = `${s("pdfTitle")} · ${name}`;
  const fondDp = device.attachments?.fond?.dp ?? null;
  const supplyTotal = result.external.supply !== null || fondDp !== null ? (result.external.supply ?? 0) + (fondDp ?? 0) : null;
  const total = supplyTotal !== null || result.external.extract !== null ? (supplyTotal ?? 0) + (result.external.extract ?? 0) : null;
  const product = findProduct(data.device);
  const attachmentList = hasOptions(data.deviceOptions)
    ? optionsList(data.device, data.deviceOptions, {
        erv: t("kwlDevice.ervShort"),
        fond: "ComfoFond-L Q",
        fondFilter: t("kwlDevice.fondFilter"),
        fondLeft: t("kwlDevice.fondLeft"),
        fondRight: t("kwlDevice.fondRight"),
      })
    : [];
  const attachments = attachmentList.join(", ");
  const roomName = (node: NetNode) => rooms.find((r) => r.calcId === node.calcId && r.roomId === node.roomId)?.name ?? node.label;
  const meta: [string, string][] = [
    [projectLabel, `${project.number} ${project.name}`],
    [s("name"), name],
    [dateLabel, formatDate(new Date())],
  ];
  const notices = [
    device.source === "datasheet" && (device.supply.ok === false || device.extract.ok === false) ? s("deviceTooSmall") : null,
    checks.missing.length ? s("missingTerminals", { rooms: checks.missing.map((m) => `${m.room} (${s(`air.${m.side}`)})`).join(", ") }) : null,
    checks.fast ? s("tooFast", { count: checks.fast }) : null,
    checks.overRange.length ? s("overRange", { items: checks.overRange.map((a) => `${a.label} ${n(a.flow)}/${n(a.max)} m³/h`).join(", ") }) : null,
    checks.noData ? s("noDataHint", { count: checks.noData }) : null,
    device.attachmentFlowWarning
      ? t("kwlDevice.flowWarning", {
          detail: [
            device.attachments?.clime && `${device.attachments.clime.name} ${device.attachments.clime.flowRange[0]}–${device.attachments.clime.flowRange[1]} m³/h`,
            device.attachments?.fond?.maxFlow && `${device.attachments.fond.name} <= ${device.attachments.fond.maxFlow} m³/h`,
          ]
            .filter(Boolean)
            .join(", "),
        })
      : null,
  ].filter((x): x is string => !!x);

  return (
    <Document title={`${title} ${project.number}`} author={firm.name}>
      {/* Page 1: device and results */}
      <LetterPage firm={firm} logo={logo} pageLabel={pageLabel}>
        <AddressAndMeta recipient={[]} meta={meta} />
        <Text style={styles.title}>{title}</Text>

        <Heading>{s("pdfSystem")}</Heading>
        <KeyValues
          rows={[
            [s("device"), product ? `Zehnder ${product.name}` : s("noDevice")],
            ...(attachments ? ([[t("kwlDevice.attachments"), attachments]] as [string, string][]) : []),
            [s("servedDwellings"), dwellings.join(", ") || "–"],
            [s("supply"), n(result.supply.flow)],
            [s("extract"), n(result.extract.flow)],
          ]}
        />

        <Heading>{s("results")}</Heading>
        <KeyValues
          rows={[
            [s("externalSupply"), `${n(supplyTotal)} Pa${fondDp !== null ? ` (${t("kwl.device.inclFondPdf", { dp: n(fondDp) })})` : ""}`],
            [s("externalExtract"), `${n(result.external.extract)} Pa`],
            [s("sumExternal"), `${n(total)} Pa`],
            ...(pressure.status ? ([[s("pdfTable7"), t(`kwl.device.pressure.${pressure.status}`, { total: n(total), limit: pressure.limit ?? "", target: pressure.target ?? "" })]] as [string, string][]) : []),
          ]}
        />
        {device.source === "datasheet" && (
          <>
            <SubHeading>{s("pdfDeviceCheck")}</SubHeading>
            <KeyValues
              rows={[
                [t("kwl.device.datasheet.supply"), `${n(device.supply.maxPressure)} Pa – ${device.supply.ok ? s("pdfOk") : s("pdfNotOk")}`],
                [t("kwl.device.datasheet.extract"), `${n(device.extract.maxPressure)} Pa – ${device.extract.ok ? s("pdfOk") : s("pdfNotOk")}`],
                [t("kwl.device.datasheet.power"), `${n(device.powerW)} W`],
                [
                  s("spi"),
                  device.spi === null
                    ? "–"
                    : `${formatNumber(device.spi, 2)} W/(m³/h) – ${s("pdfSpiCheck", { limit: formatNumber(spiLimit, 2), target: formatNumber(spiTarget, 2), status: s(`pdfSpi.${device.spiStatus ?? "limit"}`) })}`,
                ],
                ...(device.attachments?.fond ? ([[s("pdfFond"), `+${n(device.attachments.fond.dp)} Pa, ${s("pdfPump", { w: n(device.attachments.fond.pumpW) })}`]] as [string, string][]) : []),
                ...(device.attachments?.clime
                  ? ([[device.attachments.clime.name, `${n(device.attachments.clime.heatingKW, 1)} / ${n(device.attachments.clime.coolingKW, 1)} kW (${s("pdfHeatCool")})`]] as [string, string][])
                  : []),
              ]}
            />
          </>
        )}
        {notices.length > 0 && (
          <View style={{ marginTop: 6 }}>
            {notices.map((x) => (
              <Text key={x} style={{ fontSize: 8, color: "#9a3412", marginBottom: 2 }}>
                • {x}
              </Text>
            ))}
          </View>
        )}

        <Heading>{s("paths")}</Heading>
        <View style={{ flexDirection: "row" }}>
          {(["supply", "extract"] as const).map((side, i) => (
            <View key={side} style={{ flex: 1, marginLeft: i ? 12 : 0 }}>
              <View style={{ flexDirection: "row", backgroundColor: colors.headerFill, ...styles.bold, fontSize: 7 }}>
                <Text style={{ ...cell, flex: 1 }}>{s(`air.${side}`)}</Text>
                <Text style={{ ...cell, width: 36, textAlign: "right" }}>m³/h</Text>
                <Text style={{ ...cell, width: 40, textAlign: "right" }}>{s("pathPa")}</Text>
                <Text style={{ ...cell, width: 44, textAlign: "right" }}>{s("throttle")}</Text>
              </View>
              {result[side].leaves.map((l) => (
                <View key={l.id} wrap={false} style={{ flexDirection: "row", fontSize: 7.5, borderBottomWidth: 0.5, borderBottomColor: colors.line, ...(l.id === result[side].criticalLeaf ? styles.bold : {}) }}>
                  <Text style={{ ...cell, flex: 1 }}>{winAnsi(l.roomLabel)}</Text>
                  <Text style={{ ...cell, width: 36, textAlign: "right" }}>{n(l.flow)}</Text>
                  <Text style={{ ...cell, width: 40, textAlign: "right" }}>{n(l.path, 1)}</Text>
                  <Text style={{ ...cell, width: 44, textAlign: "right" }}>{l.throttle > 0.05 ? n(l.throttle, 1) : ""}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
        <Text style={{ fontSize: 7, color: colors.muted, marginTop: 3 }}>{s("pathsHint")}</Text>
      </LetterPage>

      {/* Page 2: Prinzipschema */}
      <LetterPage firm={firm} logo={logo} pageLabel={pageLabel} orientation="landscape">
        <Text style={{ ...styles.bold, fontSize: 11, marginBottom: 6 }}>
          {s("schema")} · {winAnsi(name)}
        </Text>
        <PdfSchema
          layout={layout}
          labels={{
            device: product?.name ?? s("device"),
            deviceLines: attachmentList,
            outdoor: s("air.outdoor"),
            supply: s("air.supply"),
            extract: s("air.extract"),
            exhaust: s("air.exhaust"),
          }}
          info={(node) => {
            const r = nodeResult(result, node.id);
            return r ? `${n(r.flow)} m³/h · ${n(r.dp, 1)} Pa` : "";
          }}
        />
        <Text style={{ fontSize: 7, color: colors.muted, marginTop: 4 }}>{s("pdfSchemaHint")}</Text>
      </LetterPage>

      {/* Page 3: elements and quantities */}
      <LetterPage firm={firm} logo={logo} pageLabel={pageLabel}>
        <Heading>{s("pdfElements")}</Heading>
        {(["outdoor", "supply", "extract", "exhaust"] as Lists[]).map((list) => (
          <ElementTable key={list} list={list} roots={data[list]} result={result} s={s} roomName={roomName} />
        ))}

        <Heading>{s("quantities")}</Heading>
        <View style={{ flexDirection: "row", backgroundColor: colors.headerFill, ...styles.bold, fontSize: 7 }}>
          <Text style={{ ...cell, width: 40, textAlign: "right" }}>{s("quantity")}</Text>
          <Text style={{ ...cell, width: 34 }}>{s("unit")}</Text>
          <Text style={{ ...cell, width: 70 }}>{s("article")}</Text>
          <Text style={{ ...cell, flex: 1 }}>{s("product")}</Text>
        </View>
        {quantities.map((q, i) => (
          <View key={i} wrap={false} style={{ flexDirection: "row", fontSize: 7.5, borderBottomWidth: 0.5, borderBottomColor: colors.line }}>
            <Text style={{ ...cell, width: 40, textAlign: "right" }}>{n(q.quantity, q.unit === "m" ? 1 : 0)}</Text>
            <Text style={{ ...cell, width: 34 }}>{q.unit}</Text>
            <Text style={{ ...cell, width: 70 }}>{q.articles[0] ?? s("rPosition")}</Text>
            <Text style={{ ...cell, flex: 1 }}>{winAnsi(q.manufacturer && !q.label.includes(q.manufacturer) ? `${q.manufacturer} · ${q.label}` : q.label)}</Text>
          </View>
        ))}
        {data.notes.trim() && (
          <View wrap={false}>
            <Heading>{s("pdfNotes")}</Heading>
            <Text style={{ fontSize: 8.5 }}>{winAnsi(data.notes)}</Text>
          </View>
        )}
      </LetterPage>
    </Document>
  );
}

const nodeResult = (result: SystemResult, id: string) =>
  result.supply.nodes.get(id) ?? result.extract.nodes.get(id) ?? result.outdoor.nodes.get(id) ?? result.exhaust.nodes.get(id);

/** Elements of one list as an indented table (tree depth). */
function ElementTable({
  list,
  roots,
  result,
  s,
  roomName,
}: {
  list: Lists;
  roots: NetNode[];
  result: SystemResult;
  s: KwlTranslate;
  roomName: (node: NetNode) => string;
}) {
  if (!roots.length) return null;
  const rows: { node: NetNode; depth: number }[] = [];
  const walk = (node: NetNode, depth: number) => {
    rows.push({ node, depth });
    node.children.forEach((c) => walk(c, depth + 1));
  };
  roots.forEach((r) => walk(r, 0));
  const productText = (node: NetNode) => {
    const p = findProduct(node.product);
    if (node.type !== "terminal") return p?.name ?? (node.diameter ? `ø ${node.diameter}` : node.width ? `${node.width}×${node.height}` : "");
    const cover = node.cover?.startsWith(measuredCoverPrefix) ? node.cover.slice(measuredCoverPrefix.length) : findProduct(node.cover)?.name;
    return [p?.name, cover].filter(Boolean).join(" + ");
  };
  const detail = (node: NetNode) => {
    if (node.type !== "duct") return node.count > 1 ? `${node.count} ${s("pdfPieces")}` : "";
    const bends = bendAngles.filter((a) => node.bendCounts[a] > 0).map((a) => `${node.bendCounts[a]}×${a}°`);
    return [`${n(node.length, 1)} m`, node.count > 1 ? `${node.count} ${s("pdfParallel")}` : "", bends.length ? `${s("pdfBends")} ${bends.join(" ")}` : ""].filter(Boolean).join(", ");
  };

  return (
    <View style={{ marginBottom: 8 }}>
      <View wrap={false} style={{ flexDirection: "row", backgroundColor: colors.headerFill, ...styles.bold, fontSize: 7, borderLeftWidth: 3, borderLeftColor: airColors[list] }}>
        <Text style={{ ...cell, width: 120 }}>{s(`lists.${list}`)}</Text>
        <Text style={{ ...cell, flex: 1 }}>{s("product")}</Text>
        <Text style={{ ...cell, width: 92 }}>{s("pdfDetail")}</Text>
        <Text style={{ ...cell, width: 30, textAlign: "right" }}>m³/h</Text>
        <Text style={{ ...cell, width: 26, textAlign: "right" }}>m/s</Text>
        <Text style={{ ...cell, width: 30, textAlign: "right" }}>Pa</Text>
        <Text style={{ ...cell, width: 42, textAlign: "right" }}>{s("pdfCumulative")}</Text>
      </View>
      {rows.map(({ node, depth }) => {
        const r = nodeResult(result, node.id);
        const label = node.type === "terminal" ? roomName(node) : node.label || s(`types.${node.type}`);
        return (
          <View key={node.id} wrap={false} style={{ flexDirection: "row", fontSize: 7, borderBottomWidth: 0.5, borderBottomColor: colors.line }}>
            <Text style={{ ...cell, width: 120, paddingLeft: 2 + Math.min(depth, 8) * 5 }}>{winAnsi(label)}</Text>
            <Text style={{ ...cell, flex: 1 }}>{winAnsi(productText(node))}</Text>
            <Text style={{ ...cell, width: 92 }}>{winAnsi(detail(node))}</Text>
            <Text style={{ ...cell, width: 30, textAlign: "right" }}>{n(r?.flow)}</Text>
            <Text style={{ ...cell, width: 26, textAlign: "right", ...(r?.velocity != null && r.velocityLimit != null && r.velocity > r.velocityLimit ? { color: "#b91c1c" } : {}) }}>
              {r?.velocity != null ? n(r.velocity, 2) : ""}
            </Text>
            <Text style={{ ...cell, width: 30, textAlign: "right" }}>{n(r?.dp, 1)}</Text>
            <Text style={{ ...cell, width: 42, textAlign: "right" }}>{n(r?.cumulative, 1)}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Prinzipschema (same layout and symbols as the editor, drawn with react-pdf primitives)
// ---------------------------------------------------------------------------

const PAGE_W = 742; // A4 landscape minus margins
const PAGE_H = 390;
const ink = "#111111";
const muted = "#666666";

function PdfSchema({
  layout,
  labels,
  info,
}: {
  layout: SchemaLayout;
  labels: { device: string; deviceLines: string[]; outdoor: string; supply: string; extract: string; exhaust: string };
  info: (node: NetNode) => string;
}) {
  const { width, height, device } = layout;
  const scale = Math.min(PAGE_W / width, PAGE_H / height, 1.4);
  const text = (x: number, y: number, value: string, size: number, opts: { anchor?: "start" | "middle" | "end"; fill?: string; bold?: boolean } = {}) => (
    <Text x={x} y={y} textAnchor={opts.anchor ?? "start"} fill={opts.fill ?? ink} style={{ fontSize: size, fontFamily: opts.bold ? "Helvetica-Bold" : "Helvetica" }}>
      {winAnsi(value)}
    </Text>
  );

  return (
    <Svg width={width * scale} height={height * scale} viewBox={`0 0 ${width} ${height}`}>
      {layout.floors.map((f, i) => (
        <G key={`${f.air}-${f.floor}-${i}`}>
          <Rect x={width - 60} y={f.y0} width={56} height={Math.max(f.y1 - f.y0, 10)} rx={3} fill="#f1f1f1" />
          {text(width - 32, (f.y0 + f.y1) / 2 + 4, f.floor || "–", 10, { anchor: "middle", fill: muted })}
        </G>
      ))}

      {layout.edges.map((e, i) => {
        const midX = e.from.x + (e.to.x - e.from.x) / 2;
        const d = e.from.y === e.to.y ? `M${e.from.x},${e.from.y} H${e.to.x}` : `M${e.from.x},${e.from.y} H${midX} V${e.to.y} H${e.to.x}`;
        return <Path key={i} d={d} fill="none" stroke={airColors[e.air]} strokeWidth={1.8} />;
      })}

      <Rect x={device.x} y={device.y} width={device.w} height={device.h} rx={4} fill="#ffffff" stroke={ink} strokeWidth={1.5} />
      {text(device.x + device.w / 2, device.y + 14, labels.device, 10, { anchor: "middle", bold: true })}
      {labels.deviceLines.map((line, i) => (
        <G key={line}>{text(device.x + device.w / 2, device.y + device.h + 12 + i * 11, `+ ${line}`, 8.5, { anchor: "middle", fill: muted })}</G>
      ))}
      <G>
        <Rect x={device.x + device.w / 2 - 18} y={device.y + device.h / 2 - 18} width={36} height={36} fill="none" stroke={ink} strokeWidth={1.3} />
        <Line x1={device.x + device.w / 2 - 18} y1={device.y + device.h / 2 - 18} x2={device.x + device.w / 2 + 18} y2={device.y + device.h / 2 + 18} stroke={ink} strokeWidth={1.3} />
        <Line x1={device.x + device.w / 2 + 18} y1={device.y + device.h / 2 - 18} x2={device.x + device.w / 2 - 18} y2={device.y + device.h / 2 + 18} stroke={ink} strokeWidth={1.3} />
      </G>
      {[device.y + 34, device.y + device.h - 34].map((y, i) => {
        const cx = device.x + device.w - 22;
        return (
          <G key={i}>
            <Circle cx={cx} cy={y} r={10} fill="#ffffff" stroke={ink} strokeWidth={1.3} />
            <Polygon points={i === 0 ? `${cx - 5},${y - 6} ${cx + 7},${y} ${cx - 5},${y + 6}` : `${cx + 5},${y - 6} ${cx - 7},${y} ${cx + 5},${y + 6}`} fill="none" stroke={ink} strokeWidth={1.1} />
          </G>
        );
      })}
      {text(device.x - 4, layout.airY.supply + 14, labels.outdoor, 9.5, { anchor: "end", fill: airColors.outdoor, bold: true })}
      {text(device.x - 4, layout.airY.extract + 14, labels.exhaust, 9.5, { anchor: "end", fill: airColors.exhaust, bold: true })}
      {text(device.x + device.w + 4, layout.airY.supply + 14, labels.supply, 9.5, { fill: airColors.supply, bold: true })}
      {text(device.x + device.w + 4, layout.airY.extract + 14, labels.extract, 9.5, { fill: airColors.extract, bold: true })}

      {layout.nodes.map(({ node, air, x, y }) => (
        <G key={node.id}>
          <PdfSymbol node={node} air={air} x={x} y={y} />
          {node.type !== "terminal" && text(x, y - 12, info(node), 8, { anchor: "middle", fill: muted })}
        </G>
      ))}

      {layout.labels.map((l) => {
        const node = layout.nodes.find((x) => x.node.id === l.nodeId)?.node;
        const parts = node ? terminalParts(node) : "";
        const r = node ? info(node) : "";
        return (
          <G key={l.nodeId}>
            {text(l.x, l.y + 4, l.text, 10)}
            {text(l.x, l.y + 15, [parts, r].filter(Boolean).join(" · "), 7.5, { fill: muted })}
          </G>
        );
      })}
    </Svg>
  );
}

function PdfSymbol({ node, air, x, y }: { node: NetNode; air: AirKind; x: number; y: number }) {
  const color = airColors[air];
  const kind = findProduct(node.product)?.kind;
  const box = (w: number, h: number, extra?: React.ReactNode) => (
    <G>
      <Rect x={x - w / 2} y={y - h / 2} width={w} height={h} fill="#ffffff" stroke={ink} strokeWidth={1.2} />
      {extra}
    </G>
  );
  const hatch = (w: number, h: number) => (
    <G>
      {Array.from({ length: Math.floor((h - w) / 7) + 1 }, (_, i) => (
        <Line key={i} x1={x - w / 2} y1={y - h / 2 + i * 7} x2={x + w / 2} y2={y - h / 2 + i * 7 + w} stroke={ink} strokeWidth={0.6} />
      ))}
    </G>
  );

  switch (node.type) {
    case "duct":
      return <Line x1={x - 3} y1={y - 5} x2={x + 3} y2={y + 5} stroke={color} strokeWidth={1.5} />;
    case "bend":
      return <Path d={`M${x - 6},${y} A6,6 0 0 1 ${x},${y - 6}`} fill="none" stroke={color} strokeWidth={2} />;
    case "tee":
      return <Circle cx={x} cy={y} r={3.5} fill={color} />;
    case "distributor":
      return box(
        16,
        30,
        [0, 1, 2, 3].map((i) => <Line key={i} x1={x - 8} x2={x + 8} y1={y - 9 + i * 6} y2={y - 9 + i * 6} stroke={ink} strokeWidth={0.8} />),
      );
    case "terminal": {
      const out = air === "supply";
      const tip = out ? x + 16 : x + 1;
      const dir = out ? 1 : -1;
      return (
        <G>
          <Line x1={x - 2} x2={x - 2} y1={y - 8} y2={y + 8} stroke={ink} strokeWidth={2} />
          <Line x1={out ? x : x + 16} y1={y} x2={tip - dir * 5} y2={y} stroke={color} strokeWidth={1.6} />
          <Polygon points={`${tip},${y} ${tip - dir * 6},${y - 4} ${tip - dir * 6},${y + 4}`} fill={color} />
        </G>
      );
    }
    default: {
      if (kind === "silencer")
        return box(
          14,
          28,
          [1, 2].map((i) => <Line key={i} x1={x - 7} x2={x + 7} y1={y - 14 + i * 9.33} y2={y - 14 + i * 9.33} stroke={ink} strokeWidth={0.8} />),
        );
      if (kind === "filter") return box(12, 28, <Path d={`M${x - 6},${y - 14} L${x + 6},${y} L${x - 6},${y + 14}`} fill="none" stroke={ink} strokeWidth={0.9} />);
      if (kind === "valve" || kind === "terminal") return box(22, 10, <Circle cx={x} cy={y} r={2} fill={ink} />);
      if (air === "outdoor" || air === "exhaust") return box(12, 28, hatch(12, 28));
      return box(16, 16);
    }
  }
}

/** Short «Auslass + cover» text, as in the editor. */
function terminalParts(node: NetNode): string {
  if (node.type !== "terminal") return "";
  const casing = findProduct(node.product);
  const short = (name: string) =>
    name
      .replace(/^Comfo(Case|Grid|Valve)\s+/, "")
      .replace(/\s+für ComfoCase .*$/, "")
      .replace(/\s*\(.*\)$/, "");
  const caseName = casing ? short(casing.family ?? casing.name) : "";
  const cover = node.cover?.startsWith(measuredCoverPrefix) ? node.cover.slice(measuredCoverPrefix.length) : (findProduct(node.cover)?.name ?? "");
  return [caseName, cover && short(cover)].filter(Boolean).join(" + ");
}
