"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { NativeSelect } from "@/components/form";
import {
  doorGapFlow,
  doorGapHeight,
  doorGapMaxHeight,
  doorGapMaxVelocity,
  doorGapVelocity,
  transferPressureLimit,
} from "@/lib/kwl/sia3825";
import { cn } from "@/lib/utils";

import { fmt, Notice, Result, Section } from "../fields";
import { NumberParam } from "../plan-ui";
import { planInput, type WidgetProps } from "./types";

const widths = [80, 90, 100] as const;
const pressures = [1, 2, 3] as const;

/** 5.3.5.2: door gap height by air flow, door width and pressure difference (Figure 3, smooth floor). */
export function DoorGapWidget(props: WidgetProps) {
  const t = useTranslations("kwlPlan.doorGap");
  const limit = transferPressureLimit[props.plan.params.system];
  const flow = planInput(props, "door.flow", 30);
  const width = planInput(props, "door.width", 80);
  const dp = planInput(props, "door.dp", limit);
  const gap = flow.value && width.value && dp.value ? doorGapHeight(flow.value, width.value, dp.value) : null;
  const v = gap && flow.value && width.value ? doorGapVelocity(flow.value, width.value, gap) : null;
  const [calcId, setCalcId] = useState(props.calcs[0]?.id ?? "");
  const calc = props.calcs.find((c) => c.id === calcId);

  return (
    <Section title={t("title")} description={t("description", { limit })}>
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberParam label={t("flow")} value={flow.value} editable={props.editable} onChange={flow.set} />
        <NumberParam label={t("width")} value={width.value} editable={props.editable} onChange={width.set} />
        <NumberParam label={t("dp")} value={dp.value} decimals={1} editable={props.editable} onChange={dp.set} hint={t("dpHint", { limit })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Result label={t("gap")} value={fmt(gap, 1)} unit="mm" tone={gap === null ? undefined : gap <= doorGapMaxHeight ? "ok" : "bad"} />
        <Result label={t("velocity")} value={fmt(v, 2)} unit="m/s" tone={v === null ? undefined : v <= doorGapMaxVelocity ? "ok" : "bad"} hint={t("velocityHint")} />
        <Result label={t("dpCheck")} value={dp.value === null ? "" : dp.value <= limit ? t("ok") : t("tooHigh")} tone={dp.value === null ? undefined : dp.value <= limit ? "ok" : "bad"} />
      </div>
      {gap !== null && gap > doorGapMaxHeight && <Notice>{t("tooLarge")}</Notice>}
      {v !== null && v > doorGapMaxVelocity && <Notice>{t("tooFast")}</Notice>}

      <GapChart point={gap !== null && flow.value ? { gap, flow: flow.value } : null} labels={{ gap: t("axisGap"), flow: t("axisFlow"), width: (w) => t("legendWidth", { w }) }} />

      {props.calcs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{t("perRoom")}</span>
            <NativeSelect aria-label={t("perRoom")} value={calcId} onChange={(e) => setCalcId(e.target.value)} className="max-w-xs">
              {props.calcs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <table className="w-full max-w-2xl text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-1 text-left font-medium">{t("room")}</th>
                <th className="px-2 text-right font-medium">m³/h</th>
                {widths.map((w) => (
                  <th key={w} className="px-2 text-right font-medium">
                    {w} cm
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calc?.result.rows
                .filter((r) => (r.supply ?? 0) > 0 || (r.extract ?? 0) > 0)
                .map((r) => {
                  const q = Math.max(r.supply ?? 0, r.extract ?? 0);
                  return (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-1">{[r.number, r.name].filter(Boolean).join(" ")}</td>
                      <td className="px-2 text-right tabular-nums">{fmt(q)}</td>
                      {widths.map((w) => {
                        const g = doorGapHeight(q, w, dp.value ?? limit);
                        return (
                          <td key={w} className={cn("px-2 text-right tabular-nums", g !== null && g > doorGapMaxHeight && "text-destructive")}>
                            {fmt(g, 1)} mm
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
    </Section>
  );
}

function GapChart({ point, labels }: { point: { gap: number; flow: number } | null; labels: { gap: string; flow: string; width: (w: number) => string } }) {
  const W = 520;
  const H = 300;
  const pad = { left: 40, right: 60, top: 10, bottom: 34 };
  const x = (gap: number) => pad.left + ((gap - 2) / 18) * (W - pad.left - pad.right);
  const y = (q: number) => H - pad.bottom - (q / 115) * (H - pad.top - pad.bottom);
  const dash: Record<number, string | undefined> = { 80: undefined, 90: "6 3", 100: "2 3" };
  const shade: Record<number, string> = { 1: "stroke-foreground", 2: "stroke-foreground/60", 3: "stroke-foreground/35" };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-2xl text-foreground" role="img" aria-label={labels.flow}>
      <rect x={x(10)} y={pad.top} width={x(20) - x(10)} height={H - pad.top - pad.bottom} className="fill-muted/60" />
      {[0, 20, 40, 60, 80, 100].map((q) => (
        <g key={q}>
          <line x1={pad.left} x2={W - pad.right} y1={y(q)} y2={y(q)} className="stroke-border" />
          <text x={pad.left - 5} y={y(q) + 3.5} textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
            {q}
          </text>
        </g>
      ))}
      {[2, 4, 6, 8, 10, 12, 14, 16, 18, 20].map((g) => (
        <g key={g}>
          <line x1={x(g)} x2={x(g)} y1={pad.top} y2={H - pad.bottom} className="stroke-border" />
          <text x={x(g)} y={H - pad.bottom + 13} textAnchor="middle" className="fill-muted-foreground text-[10px] tabular-nums">
            {g}
          </text>
        </g>
      ))}
      {pressures.flatMap((dp) =>
        widths.map((w) => (
          <line
            key={`${dp}-${w}`}
            x1={x(2)}
            y1={y(doorGapFlow(w, 2, dp))}
            x2={x(20)}
            y2={y(Math.min(doorGapFlow(w, 20, dp), 115))}
            className={shade[dp]}
            strokeWidth={1.4}
            strokeDasharray={dash[w]}
          />
        )),
      )}
      {pressures.map((dp) => (
        <text key={dp} x={W - pad.right + 4} y={y(doorGapFlow(90, 20, dp)) + 4} className="fill-muted-foreground text-[10px]">
          Δp = {dp} Pa
        </text>
      ))}
      {point && point.gap <= 20 && (
        <circle cx={x(Math.max(point.gap, 2))} cy={y(Math.min(point.flow, 115))} r={4.5} className="fill-brand" />
      )}
      <text x={(pad.left + W - pad.right) / 2} y={H - 4} textAnchor="middle" className="fill-muted-foreground text-[10px]">
        {labels.gap}
      </text>
      <text x={10} y={(pad.top + H - pad.bottom) / 2} transform={`rotate(-90 10 ${(pad.top + H - pad.bottom) / 2})`} textAnchor="middle" className="fill-muted-foreground text-[10px]">
        {labels.flow}
      </text>
      <g transform={`translate(${pad.left + 8}, ${pad.top + 8})`}>
        {widths.map((w, i) => (
          <g key={w} transform={`translate(0, ${i * 14})`}>
            <line x1={0} x2={22} y1={0} y2={0} className="stroke-foreground" strokeWidth={1.4} strokeDasharray={dash[w]} />
            <text x={28} y={3.5} className="fill-muted-foreground text-[10px]">
              {labels.width(w)}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
