"use client";

import { useTranslations } from "next-intl";

import { NativeSelect } from "@/components/form";
import { Label } from "@/components/ui/label";
import { exhaustBaseDistance, exhaustDiagramMaxFlow, exhaustDistance } from "@/lib/kwl/calc";
import { intakeMaxVelocity, intakeMinHeight, intakeVelocity } from "@/lib/kwl/sia3825";

import { fmt, Notice, Result, Section } from "@/components/planning/fields";
import { NumberParam } from "@/components/planning/plan-ui";
import { planInput, type WidgetProps } from "./types";

const diagramFlows = [50, 100, 200, 300, 500, 1000, 1800];

/** 5.3.2 / Annex E: outdoor air intake and exhaust outlet – distance (Figure 17), height, grille velocity. */
export function IntakeWidget(props: WidgetProps) {
  const t = useTranslations("kwlPlan.intake");
  const p = props.plan.params;
  // One device per dwelling: the largest dwelling; central unit: all dwellings with simultaneity.
  const flows = props.calcs.map((c) => Math.max(c.result.summary.supply, c.result.summary.extract));
  const defaultFlow =
    (p.unit === "multi" ? flows.reduce((s, q) => s + q, 0) * (p.simultaneity ?? 1) : Math.max(0, ...flows)) || null;
  const flow = planInput(props, "intake.flow", defaultFlow);
  const above = planInput(props, "intake.above", 1);
  const vertical = planInput(props, "intake.vertical", 0);
  const horizontal = planInput(props, "intake.horizontal", null);
  const height = planInput(props, "intake.height", null);
  const area = planInput(props, "intake.area", null);
  const position = above.value === 0 ? "below" : "above";
  const result = flow.value ? exhaustDistance(flow.value, position, vertical.value ?? 0) : null;
  const distanceOk = result && horizontal.value !== null ? horizontal.value >= result.horizontal : null;
  const minHeight = p.publicIntake ? intakeMinHeight.public : p.unit === "multi" ? intakeMinHeight.multiDwelling : null;
  const v = flow.value && area.value ? intakeVelocity(flow.value, area.value) : null;
  const vMax = intakeMaxVelocity(p.fog);

  return (
    <Section title={t("title")} description={t("description")}>
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <NumberParam label={t("flow")} value={flow.value} editable={props.editable} onChange={flow.set} />
        <div className="space-y-1.5">
          <Label htmlFor="intake-position">{t("position")}</Label>
          <NativeSelect id="intake-position" value={position} disabled={!props.editable} onChange={(e) => above.set(e.target.value === "above" ? 1 : 0)}>
            <option value="above">{t("above")}</option>
            <option value="below">{t("below")}</option>
          </NativeSelect>
        </div>
        <NumberParam label={t("vertical")} value={vertical.value} decimals={2} editable={props.editable} onChange={vertical.set} />
        <NumberParam label={t("horizontal")} value={horizontal.value} decimals={2} editable={props.editable} onChange={horizontal.set} />
        <NumberParam label={t("height")} value={height.value} decimals={2} editable={props.editable} onChange={height.set} />
        <NumberParam label={t("area")} value={area.value} decimals={3} editable={props.editable} onChange={area.set} />
      </div>
      {flow.value && flow.value > exhaustDiagramMaxFlow ? (
        <Notice>{t("tooLarge", { max: fmt(exhaustDiagramMaxFlow) })}</Notice>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Result label={t("required")} value={fmt(result?.horizontal, 2)} unit="m" tone={distanceOk === null ? undefined : distanceOk ? "ok" : "bad"} />
          <Result
            label={t("heightCheck")}
            value={minHeight === null ? "" : `≥ ${fmt(minHeight, 1)}`}
            unit="m"
            tone={minHeight === null || height.value === null ? undefined : height.value >= minHeight ? "ok" : "bad"}
            hint={minHeight === null ? t("heightNone") : undefined}
          />
          <Result label={t("velocity")} value={fmt(v, 2)} unit="m/s" tone={v === null ? undefined : v <= vMax ? "ok" : "bad"} hint={t("velocityHint", { max: fmt(vMax, 1) })} />
        </div>
      )}
      <DistanceChart
        point={horizontal.value !== null && vertical.value !== null ? { x: horizontal.value, y: position === "above" ? vertical.value : -vertical.value } : null}
        flow={flow.value}
        labels={{ horizontal: t("axisHorizontal"), vertical: t("axisVertical"), above: t("above"), below: t("below") }}
      />
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
    </Section>
  );
}

function DistanceChart({
  point,
  flow,
  labels,
}: {
  point: { x: number; y: number } | null;
  flow: number | null;
  labels: { horizontal: string; vertical: string; above: string; below: string };
}) {
  const W = 480;
  const H = 420;
  const pad = { left: 42, right: 60, top: 22, bottom: 16 };
  const x = (m: number) => pad.left + (m / 3.5) * (W - pad.left - pad.right);
  const y = (m: number) => pad.top + ((4 - m) / 11) * (H - pad.top - pad.bottom);
  const current = flow && flow <= exhaustDiagramMaxFlow ? exhaustBaseDistance(flow) : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl text-foreground" role="img" aria-label={labels.horizontal}>
      {[4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6, -7].map((m) => (
        <g key={m}>
          <line x1={pad.left} x2={W - pad.right} y1={y(m)} y2={y(m)} className={m === 0 ? "stroke-muted-foreground" : "stroke-border"} />
          <text x={pad.left - 5} y={y(m) + 3.5} textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
            {m}
          </text>
        </g>
      ))}
      {[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((m) => (
        <g key={m}>
          <line x1={x(m)} x2={x(m)} y1={y(4)} y2={y(-7)} className="stroke-border" />
          <text x={x(m)} y={pad.top - 6} textAnchor="middle" className="fill-muted-foreground text-[10px] tabular-nums">
            {m.toFixed(1)}
          </text>
        </g>
      ))}
      {diagramFlows.map((q) => {
        const d = exhaustBaseDistance(q);
        return (
          <g key={q}>
            <line x1={x(0)} y1={y(d)} x2={x(d)} y2={y(0)} className="stroke-muted-foreground/70" strokeDasharray="5 3" />
            <line x1={x(0)} y1={y(-2 * d)} x2={x(d)} y2={y(0)} className="stroke-muted-foreground/70" strokeDasharray="5 3" />
            <text x={x(d) + 2} y={y(0) - 3} className="fill-muted-foreground text-[9px]">
              {q}
            </text>
          </g>
        );
      })}
      {current !== null && (
        <g>
          <line x1={x(0)} y1={y(current)} x2={x(current)} y2={y(0)} className="stroke-brand" strokeWidth={2} />
          <line x1={x(0)} y1={y(-2 * current)} x2={x(current)} y2={y(0)} className="stroke-brand" strokeWidth={2} />
        </g>
      )}
      {point && point.x <= 3.5 && point.y <= 4 && point.y >= -7 && <circle cx={x(point.x)} cy={y(point.y)} r={5} className="fill-destructive" />}
      <text x={W - pad.right + 4} y={y(3)} className="fill-muted-foreground text-[10px]">
        {labels.above}
      </text>
      <text x={W - pad.right + 4} y={y(-5)} className="fill-muted-foreground text-[10px]">
        {labels.below}
      </text>
      <text x={(pad.left + W - pad.right) / 2} y={10} textAnchor="middle" className="fill-muted-foreground text-[10px]">
        {labels.horizontal}
      </text>
      <text x={10} y={H / 2} transform={`rotate(-90 10 ${H / 2})`} textAnchor="middle" className="fill-muted-foreground text-[10px]">
        {labels.vertical}
      </text>
    </svg>
  );
}
