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
  designVelocity,
  ductAirs,
  type DuctAir,
  type DuctLocation,
  ductLocations,
  insulationRequirement,
  maxVelocity,
  reducedInsulation,
  smallSystemLimits,
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
  const limit = maxVelocity(flow ?? 0);
  const recommended = designVelocity(flow ?? 0, standard);
  const v = velocity ?? recommended;
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
          <NumberField id="duct-velocity" value={velocity} decimals={2} label={t("velocity")} placeholder={fmt(recommended, 1)} onChange={setVelocity} className="h-8 rounded-lg" />
          <p className="text-xs text-muted-foreground">{t("velocityHint", { limit: fmt(limit, 1), recommended: fmt(recommended, 1) })}</p>
          {v > limit && <p className="text-xs text-destructive">{t("velocityTooHigh", { limit: fmt(limit, 1) })}</p>}
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

/** EN-105 Table 1 (= SIA 382/1 Table 23) and Figure 1 (reduction for small systems with ducts < 6 m). */
function Insulation() {
  const t = useTranslations("kwl.tools.insulation");
  const [air, setAir] = useState<DuctAir>("outdoorExhaust");
  const [location, setLocation] = useState<DuctLocation>("inside");
  const [delta, setDelta] = useState<number | null>(10);
  const [preheated, setPreheated] = useState(false);
  const [small, setSmall] = useState(false);
  const [length, setLength] = useState<number | null>(3);
  const required = insulationRequirement(air, location, delta ?? 0, preheated);
  const reduced = small && length !== null && length < smallSystemLimits.maxLengthM ? reducedInsulation(required, length) : null;

  return (
    <Section title={t("title")} description={t("description")}>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="insulation-air">{t("air")}</Label>
          <NativeSelect id="insulation-air" value={air} onChange={(e) => setAir(e.target.value as DuctAir)}>
            {ductAirs.map((a) => (
              <option key={a} value={a}>
                {t(`airs.${a}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="insulation-location">{t("location")}</Label>
          <NativeSelect id="insulation-location" value={location} onChange={(e) => setLocation(e.target.value as DuctLocation)}>
            {ductLocations.map((l) => (
              <option key={l} value={l}>
                {t(`locations.${l}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        {air === "supplyExtract" && location === "inside" ? (
          <div className="space-y-2">
            <Label htmlFor="insulation-delta">{t("delta")}</Label>
            <NumberField id="insulation-delta" value={delta} decimals={1} label={t("delta")} onChange={setDelta} className="h-8 rounded-lg" />
          </div>
        ) : air === "outdoorExhaust" && location === "inside" ? (
          <label className="flex items-center gap-2 self-end pb-1.5 text-sm">
            <input type="checkbox" checked={preheated} onChange={(e) => setPreheated(e.target.checked)} />
            {t("preheated")}
          </label>
        ) : (
          <div />
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="mt-0.5" checked={small} onChange={(e) => setSmall(e.target.checked)} />
          {t("small", { flow: smallSystemLimits.maxFlow, min: smallSystemLimits.minTemp, max: smallSystemLimits.maxTemp })}
        </label>
        {small && (
          <div className="space-y-2">
            <Label htmlFor="insulation-length">{t("length")}</Label>
            <NumberField id="insulation-length" value={length} decimals={1} label={t("length")} onChange={setLength} className="h-8 rounded-lg" />
          </div>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Result label={t("required")} value={fmt(required, 0) || "0"} unit="mm" hint={t("requiredHint")} />
        {reduced !== null && <Result label={t("reduced")} value={fmt(reduced, 0) || "0"} unit="mm" hint={t("reducedHint")} />}
      </div>
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
    </Section>
  );
}
