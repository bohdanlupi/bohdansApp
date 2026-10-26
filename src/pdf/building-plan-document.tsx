import { Document, Image, Line, Page, Polygon, Svg, Text, Text as SvgText, View } from "@react-pdf/renderer";
import React from "react";

import { evaluateEnvelope, pointAt } from "@/lib/building/envelope";
import { roomMetrics } from "@/lib/building/model";
import type { BuildingModel, PlanInfo } from "@/lib/building/schema";
import { roomUsageByCode } from "@/lib/building/sia2024-data";
import { formatNumber } from "@/lib/number-input";
import type { FirmSettings } from "@/lib/supabase/types";

import { formatDate } from "./format";
import { type KwlTranslate, winAnsi } from "./kwl-document";
import { colors, styles } from "./letterhead";

const n = (value: number | null | undefined, decimals = 0) =>
  value === null || value === undefined || !Number.isFinite(value) ? "-" : formatNumber(value, decimals);

export type PlanImage = { plan: PlanInfo; data: Buffer };

/**
 * Gebäudemodell plan sheets: one A3 landscape page per Geschoss with the plan preview, the traced rooms (heated red,
 * passive blue; number, name and area), the envelope segments coloured by adjacency, openings and north arrow, plus
 * the room table of the Geschoss. Geometry is in snapshot pixels, so the SVG uses the snapshot size as its viewBox.
 */
export function BuildingPlanDocument({
  firm,
  t,
  project,
  model,
  images,
}: {
  firm: FirmSettings;
  t: KwlTranslate;
  project: { number: string; name: string };
  model: BuildingModel;
  images: PlanImage[];
}) {
  const s = (key: string, values?: Record<string, string | number>) => winAnsi(t(`building.planPdf.${key}`, values));
  const floors = [...model.floors].sort((a, b) => b.level - a.level).filter((f) => images.some((i) => i.plan.floor === f.key));
  const pageW = 1190.55; // A3 landscape [pt]
  const pageH = 841.89;
  const margin = 28;
  const tableW = 300;
  const drawW = pageW - 2 * margin - tableW - 16;
  const drawH = pageH - 2 * margin - 40;

  return (
    <Document title={`${s("title")} ${project.number}`} author={firm.name}>
      {floors.map((floor) => {
        const { plan, data } = images.find((i) => i.plan.floor === floor.key)!;
        const rooms = model.rooms.filter((r) => r.floor === floor.key);
        const envelope = model.envelopes.find((e) => e.floor === floor.key) ?? null;
        const segments = evaluateEnvelope(envelope, rooms, floor, plan);
        const fit = Math.min(drawW / plan.width, drawH / plan.height);
        const w = plan.width * fit;
        const h = plan.height * fit;
        const px = (pt: number) => pt / fit; // pt on paper → snapshot px
        const font = px(7);
        const stroke = px(1.2);
        const metrics = rooms.map((r) => roomMetrics(r, floor, plan));
        const heated = metrics.filter((m) => m.room.kind === "heated");
        const area = heated.every((m) => m.area !== null) ? heated.reduce((sum, m) => sum + (m.area ?? 0), 0) : null;
        const adjacencyColor = { outside: "#1d4ed8", unheated: "#64748b", ground: "#92400e" } as const;
        const compassAngle = plan.north === null ? null : plan.north + 90;
        return (
          <Page key={floor.key} size="A3" orientation="landscape" style={{ padding: margin, fontFamily: "Helvetica", fontSize: 8, color: colors.text }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={{ ...styles.bold, fontSize: 12 }}>{winAnsi(`${s("title")} · ${floor.name}`)}</Text>
              <Text style={{ color: colors.muted }}>{winAnsi(`${project.number} ${project.name} · ${firm.name} · ${formatDate(new Date())}`)}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 16 }}>
              <View style={{ width: w, height: h, position: "relative", borderWidth: 0.5, borderColor: colors.line }}>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
                <Image src={{ data, format: "png" }} style={{ position: "absolute", left: 0, top: 0, width: w, height: h }} />
                <Svg viewBox={`0 0 ${plan.width} ${plan.height}`} width={w} height={h} style={{ position: "absolute", left: 0, top: 0 }}>
                  {metrics.map((m) => (
                    <Polygon
                      key={m.room.id}
                      points={m.room.polygon.map((p) => p.join(",")).join(" ")}
                      fill={m.room.kind === "heated" ? "#ef4444" : "#0ea5e9"}
                      fillOpacity={0.15}
                      stroke={m.room.kind === "heated" ? "#dc2626" : "#0284c7"}
                      strokeWidth={stroke}
                    />
                  ))}
                  {segments.map((sg) => {
                    const mid = pointAt(sg, 0.5);
                    return (
                      <React.Fragment key={sg.vertex.id}>
                        <Line x1={sg.from[0]} y1={sg.from[1]} x2={sg.to[0]} y2={sg.to[1]} stroke={adjacencyColor[sg.vertex.adjacency]} strokeWidth={stroke * 2.2} strokeDasharray={sg.vertex.adjacency === "unheated" ? `${px(6)} ${px(3)}` : undefined} />
                        {sg.openings.map((o) => {
                          const a = pointAt(sg, o.fromT);
                          const b = pointAt(sg, o.toT);
                          return <Line key={o.opening.id} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={o.opening.kind === "door" ? "#d97706" : "#22d3ee"} strokeWidth={stroke * 4.5} />;
                        })}
                        {sg.length !== null && sg.lengthPx * fit > 40 && (
                          <SvgText x={mid[0] + sg.outward[0] * px(9)} y={mid[1] + sg.outward[1] * px(9)} textAnchor="middle" style={{ fontSize: font * 0.85, fill: "#1e3a8a" }}>
                            {winAnsi([sg.orientation, `${n(sg.length, 2)} m`].filter(Boolean).join(" · "))}
                          </SvgText>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {metrics.map((m) => (
                    <React.Fragment key={`${m.room.id}-label`}>
                      <SvgText x={m.centroid[0]} y={m.centroid[1] - font * 0.3} textAnchor="middle" style={{ fontSize: font, fontWeight: 700, fill: "#111827" }}>
                        {winAnsi([m.room.number, m.room.name].filter(Boolean).join(" "))}
                      </SvgText>
                      <SvgText x={m.centroid[0]} y={m.centroid[1] + font * 0.9} textAnchor="middle" style={{ fontSize: font * 0.9, fill: "#111827" }}>
                        {m.area === null ? "" : winAnsi(`${n(m.area, 2)} m²`)}
                      </SvgText>
                    </React.Fragment>
                  ))}
                </Svg>
                {compassAngle !== null && (
                  <View style={{ position: "absolute", right: 6, top: 6, width: 26, height: 26 }}>
                    <Svg viewBox="0 0 26 26" width={26} height={26}>
                      <Polygon points="13,2 17,14 13,11 9,14" fill="#1d4ed8" transform={`rotate(${compassAngle} 13 13)`} />
                      <SvgText x={13} y={24} textAnchor="middle" style={{ fontSize: 7, fill: "#1d4ed8" }}>
                        N
                      </SvgText>
                    </Svg>
                  </View>
                )}
              </View>
              <View style={{ width: tableW }}>
                <Text style={{ ...styles.bold, fontSize: 9, marginBottom: 4 }}>{s("rooms")}</Text>
                <View style={{ flexDirection: "row", backgroundColor: colors.headerFill, paddingVertical: 2, fontSize: 7 }}>
                  {[
                    [s("number"), 34],
                    [s("name"), 110],
                    [s("kind"), 46],
                    ["A [m²]", 44, "right"],
                    ["V [m³]", 44, "right"],
                  ].map(([label, width, align], i) => (
                    <Text key={i} style={{ width: width as number, textAlign: (align as "right") ?? "left", paddingHorizontal: 2, ...styles.bold }}>
                      {label as string}
                    </Text>
                  ))}
                </View>
                {metrics
                  .sort((a, b) => a.room.number.localeCompare(b.room.number, "de-CH", { numeric: true }))
                  .map((m) => (
                    <View key={m.room.id} style={{ flexDirection: "row", paddingVertical: 1.5, borderBottomWidth: 0.5, borderBottomColor: colors.line, fontSize: 7 }}>
                      <Text style={{ width: 34, paddingHorizontal: 2 }}>{winAnsi(m.room.number)}</Text>
                      <Text style={{ width: 110, paddingHorizontal: 2 }}>{winAnsi([m.room.name, roomUsageByCode(m.room.usage)?.code].filter(Boolean).join(" · "))}</Text>
                      <Text style={{ width: 46, paddingHorizontal: 2 }}>{s(`kinds.${m.room.kind}`)}</Text>
                      <Text style={{ width: 44, paddingHorizontal: 2, textAlign: "right" }}>{n(m.area, 2)}</Text>
                      <Text style={{ width: 44, paddingHorizontal: 2, textAlign: "right" }}>{n(m.volume, 1)}</Text>
                    </View>
                  ))}
                <View style={{ flexDirection: "row", paddingVertical: 2, borderTopWidth: 0.8, borderTopColor: colors.text, fontSize: 7 }}>
                  <Text style={{ width: 190, paddingHorizontal: 2, ...styles.bold }}>{s("heatedTotal", { count: heated.length })}</Text>
                  <Text style={{ width: 44, paddingHorizontal: 2, textAlign: "right", ...styles.bold }}>{n(area, 2)}</Text>
                  <Text style={{ width: 44 }} />
                </View>
                <Text style={{ fontSize: 7, color: colors.muted, marginTop: 8 }}>
                  {winAnsi(
                    [
                      plan.scale ? s("scale", { px: n(1 / plan.scale, 1) }) : s("uncalibrated"),
                      s("storey", { h: n(floor.height, 2), hs: n(floor.storeyHeight ?? (floor.height === null ? null : floor.height + 0.3), 2) }),
                      envelope ? s("envelope", { n: envelope.vertices.length }) : s("noEnvelope"),
                    ].join(" · "),
                  )}
                </Text>
                <Text style={{ fontSize: 7, color: colors.muted, marginTop: 4 }}>{s("legend")}</Text>
              </View>
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
