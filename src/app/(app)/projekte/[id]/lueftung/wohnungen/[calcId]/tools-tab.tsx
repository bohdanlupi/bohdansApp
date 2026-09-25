"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { NativeSelect } from "@/components/form";
import { Label } from "@/components/ui/label";
import {
  type BuildingStandard,
  doorWidths,
  ductFlow,
  ductSystems,
  exhaustDiagramMaxFlow,
  exhaustDistance,
  grilleHeights,
  grilleWidth,
  insulationDeltas,
  type InsulationDelta,
  insulationThickness,
  maxVelocity,
  overflowArea,
  requiredDiameter,
  type RoomRow,
} from "@/lib/kwl/calc";
import { doorGapHeight, doorGapMaxHeight } from "@/lib/kwl/sia3825";
import { cn } from "@/lib/utils";

import { fmt, Notice, NumberField, Result, Section } from "../../fields";

export function ToolsTab({
  standard,
  rows,
  totalFlow,
  transferLimit,
  editable,
  onStandardChange,
}: {
  standard: BuildingStandard;
  rows: RoomRow[];
  totalFlow: number;
  transferLimit: number;
  editable: boolean;
  onStandardChange: (standard: BuildingStandard) => void;
}) {
  const t = useTranslations("kwl.tools");
  return (
    <div className="space-y-4">
      <DuctSizing standard={standard} totalFlow={totalFlow} editable={editable} onStandardChange={onStandardChange} />
      <DoorOverflow rows={rows} dp={transferLimit} />
      <ExhaustDistance totalFlow={totalFlow} />
      <Insulation />
      <p className="text-xs text-muted-foreground">{t("notSaved")}</p>
    </div>
  );
}

function DuctSizing({
  standard,
  totalFlow,
  editable,
  onStandardChange,
}: {
  standard: BuildingStandard;
  totalFlow: number;
  editable: boolean;
  onStandardChange: (standard: BuildingStandard) => void;
}) {
  const t = useTranslations("kwl.tools.duct");
  const [flow, setFlow] = useState<number | null>(totalFlow || 30);
  const [velocity, setVelocity] = useState<number | null>(null);
  const limit = maxVelocity(flow ?? 0, standard);
  const v = velocity ?? limit;
  const needed = flow && v ? requiredDiameter(flow, v) : null;

  return (
    <Section title={t("title")} description={t("description")}>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="duct-flow">{t("flow")}</Label>
          <NumberField id="duct-flow" value={flow} decimals={0} label={t("flow")} onChange={setFlow} className="h-8 rounded-lg" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="duct-standard">{t("standard")}</Label>
          <NativeSelect id="duct-standard" value={standard} disabled={!editable} onChange={(e) => onStandardChange(e.target.value as BuildingStandard)}>
            <option value="standard">{t("standardBuilding")}</option>
            <option value="minergie">Minergie</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="duct-velocity">{t("velocity")}</Label>
          <NumberField id="duct-velocity" value={velocity} decimals={2} label={t("velocity")} placeholder={fmt(limit, 1)} onChange={setVelocity} className="h-8 rounded-lg" />
          <p className="text-xs text-muted-foreground">{t("velocityHint", { limit: fmt(limit, 1) })}</p>
        </div>
      </div>
      <Result label={t("required")} value={fmt(needed, 0)} unit={t("mmInner")} />
      <div className="grid gap-4 md:grid-cols-3">
        {ductSystems.map((system) => {
          const fitting = system.sizes.find(([, inner]) => flow && ductFlow(inner, v) >= flow);
          return (
            <table key={system.key} className="text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-1 text-left font-medium">{system.name} ø</th>
                  <th className="px-2 text-right font-medium">{t("inner")}</th>
                  <th className="text-right font-medium">{t("maxFlow", { v: fmt(v, 1) })}</th>
                </tr>
              </thead>
              <tbody>
                {system.sizes.map(([outer, inner]) => (
                  <tr key={outer} className={cn("border-b last:border-0", fitting?.[0] === outer && "bg-brand/10 font-semibold")}>
                    <td className="py-1">{outer}</td>
                    <td className="px-2 text-right tabular-nums">{inner}</td>
                    <td className="text-right tabular-nums">{fmt(ductFlow(inner, v))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })}
      </div>
    </Section>
  );
}

function DoorOverflow({ rows, dp }: { rows: RoomRow[]; dp: number }) {
  const t = useTranslations("kwl.tools.door");
  const [custom, setCustom] = useState<number | null>(null);
  const lines = [
    ...rows
      .map((r) => ({ key: r.id, label: [r.number, r.name].filter(Boolean).join(" "), flow: Math.max(r.supply ?? 0, r.extract ?? 0) }))
      .filter((r) => r.flow > 0),
    ...(custom ? [{ key: "custom", label: t("custom"), flow: custom }] : []),
  ];

  return (
    <Section title={t("title")} description={t("description", { dp })}>
      <div className="flex items-center gap-2">
        <Label htmlFor="door-flow" className="shrink-0">{t("customFlow")}</Label>
        <NumberField id="door-flow" value={custom} decimals={0} label={t("customFlow")} onChange={setCustom} className="h-8 max-w-32 rounded-lg" />
      </div>
      {lines.length === 0 ? (
        <Notice tone="info">{t("empty")}</Notice>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th rowSpan={2} className="py-1 text-left font-medium">{t("room")}</th>
                <th rowSpan={2} className="px-2 text-right font-medium">m³/h</th>
                <th rowSpan={2} className="px-2 text-right font-medium">{t("area")}</th>
                <th colSpan={doorWidths.length} className="border-l px-2 text-center font-medium">{t("gap")}</th>
                <th colSpan={grilleHeights.length} className="border-l px-2 text-center font-medium">{t("grille")}</th>
              </tr>
              <tr className="border-b">
                {doorWidths.map((w, i) => (
                  <th key={w} className={cn("px-2 text-right font-normal", i === 0 && "border-l")}>{w} cm</th>
                ))}
                {grilleHeights.map((h, i) => (
                  <th key={h} className={cn("px-2 text-right font-normal", i === 0 && "border-l")}>H = {h} mm</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const area = overflowArea(line.flow);
                return (
                  <tr key={line.key} className="border-b last:border-0">
                    <td className="py-1">{line.label}</td>
                    <td className="px-2 text-right tabular-nums">{fmt(line.flow)}</td>
                    <td className="px-2 text-right tabular-nums">{area} cm²</td>
                    {doorWidths.map((w, i) => {
                      const gap = doorGapHeight(line.flow, w, dp);
                      return (
                        <td key={w} className={cn("px-2 text-right tabular-nums", i === 0 && "border-l", gap !== null && gap > doorGapMaxHeight && "text-destructive")}>
                          {fmt(gap, 1)} mm
                        </td>
                      );
                    })}
                    {grilleHeights.map((h, i) => (
                      <td key={h} className={cn("px-2 text-right tabular-nums", i === 0 && "border-l")}>{grilleWidth(area, h)} mm</td>
                    ))}
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

function ExhaustDistance({ totalFlow }: { totalFlow: number }) {
  const t = useTranslations("kwl.tools.exhaust");
  const [flow, setFlow] = useState<number | null>(totalFlow || null);
  const [position, setPosition] = useState<"above" | "below">("above");
  const [vertical, setVertical] = useState<number | null>(0);
  const result = flow ? exhaustDistance(flow, position, vertical ?? 0) : null;

  return (
    <Section title={t("title")} description={t("description")}>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="exhaust-flow">{t("flow")}</Label>
          <NumberField id="exhaust-flow" value={flow} decimals={0} label={t("flow")} onChange={setFlow} className="h-8 rounded-lg" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="exhaust-position">{t("position")}</Label>
          <NativeSelect id="exhaust-position" value={position} onChange={(e) => setPosition(e.target.value as "above" | "below")}>
            <option value="above">{t("above")}</option>
            <option value="below">{t("below")}</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="exhaust-vertical">{t("vertical")}</Label>
          <NumberField id="exhaust-vertical" value={vertical} decimals={2} label={t("vertical")} onChange={setVertical} className="h-8 rounded-lg" />
        </div>
      </div>
      {flow && flow > exhaustDiagramMaxFlow ? (
        <Notice>{t("tooLarge", { max: fmt(exhaustDiagramMaxFlow) })}</Notice>
      ) : (
        result && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Result label={t("horizontal")} value={fmt(result.horizontal, 2)} unit="m" />
            <Result label={t("base")} value={fmt(result.base, 2)} unit="m" />
            <Result label={t("verticalOnly")} value={fmt(result.verticalOnly, 2)} unit="m" />
          </div>
        )
      )}
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
    </Section>
  );
}

function Insulation() {
  const t = useTranslations("kwl.tools.insulation");
  const [delta, setDelta] = useState<InsulationDelta>(10);
  const [length, setLength] = useState<number | null>(3);

  return (
    <Section title={t("title")} description={t("description")}>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="insulation-delta">{t("delta")}</Label>
          <NativeSelect id="insulation-delta" value={delta} onChange={(e) => setDelta(Number(e.target.value) as InsulationDelta)}>
            {insulationDeltas.map((d) => (
              <option key={d} value={d}>
                {d} K
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="insulation-length">{t("length")}</Label>
          <NumberField id="insulation-length" value={length} decimals={1} label={t("length")} onChange={setLength} className="h-8 rounded-lg" />
        </div>
        <Result label={t("thickness")} value={length === null ? "" : fmt(insulationThickness(delta, length), 0)} unit="mm" />
      </div>
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
    </Section>
  );
}
