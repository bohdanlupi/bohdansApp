"use client";

import { Check, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import { findRoomType, spiLimit } from "@/lib/kwl/calc";
import type { PlanParams } from "@/lib/kwl/plan-schema";
import { airChangeFlow, baseAirChange, externalPressureCheck, fourSteps, newBuildingAirChange } from "@/lib/kwl/sia3825";
import { cn } from "@/lib/utils";

import { fmt, Notice, Section } from "../fields";
import type { WidgetCalc, WidgetProps } from "./types";

/** All checks of one dwelling calculation against SIA 382/5. */
export function dwellingChecks(calc: WidgetCalc, params: PlanParams) {
  const { data, result } = calc;
  const steps = fourSteps(data.rooms, params.operation === "demand");
  const area = result.summary.area;
  const base = airChangeFlow(area, data.height, baseAirChange);
  const firstMonths = airChangeFlow(area, data.height, newBuildingAirChange);
  // Normal ventilation per room with supply at least the base ventilation of that room (5.2.3.3).
  const supplyRoomsBelowBase = result.rows.filter((r) => (r.supply ?? 0) > 0 && (r.supply ?? 0) < (r.minSupply ?? 0)).length;
  const drops = result.drops;
  const drop = drops.supply !== null || drops.extract !== null ? (drops.supply ?? 0) + (drops.extract ?? 0) : null;
  const pressure = externalPressureCheck(params.system, params.operation === "demand", drop);
  const tooSmall =
    (result.device && ((result.deviceResult.supply && !result.deviceResult.supply.nominalStage) || (result.deviceResult.extract && !result.deviceResult.extract.nominalStage))) ||
    result.datasheet?.supply.ok === false ||
    result.datasheet?.extract.ok === false;
  return {
    steps,
    supplyOk: result.summary.supply >= steps.governing,
    extractOk: result.summary.extract >= steps.governing,
    balanced: result.summary.imbalance === 0,
    base,
    baseOk: result.summary.supply >= result.summary.minSupply && supplyRoomsBelowBase === 0,
    supplyRoomsBelowBase,
    firstMonths,
    firstMonthsOk: Math.max(result.summary.supply, result.deviceResult.partyFlow ?? 0) >= firstMonths,
    drop,
    pressure,
    spi: result.deviceResult.spi,
    spiOk: result.deviceResult.spi === null ? null : result.deviceResult.spi < spiLimit,
    tooSmall: Boolean(tooSmall),
  };
}

function Mark({ ok, label }: { ok: boolean | null; label?: string }) {
  if (ok === null) return <span className="text-muted-foreground">–</span>;
  return ok ? (
    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
      <Check className="size-4" />
      {label}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-destructive">
      <TriangleAlert className="size-4" />
      {label}
    </span>
  );
}

/** Bauprojekt: overview of all dwelling calculations with the checks of SIA 382/5. */
export function DwellingsWidget({ calcs, plan, projectId }: WidgetProps) {
  const t = useTranslations("kwlPlan.dwellings");
  const base = `/projekte/${projectId}/lueftung/wohnungen`;

  return (
    <Section
      title={t("title")}
      description={t("description")}
      actions={
        <Link href={base} className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("open")}
        </Link>
      }
    >
      {calcs.length === 0 ? (
        <Notice tone="info">{t("empty")}</Notice>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-1.5 text-left font-medium">{t("name")}</th>
                <th className="px-2 text-right font-medium">{t("step3")}</th>
                <th className="px-2 text-right font-medium">{t("used")}</th>
                <th className="px-2 text-left font-medium">{t("flows")}</th>
                <th className="px-2 text-left font-medium">{t("base")}</th>
                <th className="px-2 text-left font-medium">{t("pressure")}</th>
                <th className="px-2 text-left font-medium">SPI</th>
                <th className="px-2 text-left font-medium">{t("device")}</th>
              </tr>
            </thead>
            <tbody>
              {calcs.map((calc) => {
                const c = dwellingChecks(calc, plan.params);
                return (
                  <tr key={calc.id} className="border-b align-top last:border-0">
                    <td className="py-1.5">
                      <Link href={`${base}/${calc.id}`} className="font-medium underline-offset-2 hover:underline">
                        {calc.name}
                      </Link>
                    </td>
                    <td className="px-2 text-right tabular-nums">{fmt(c.steps.governing)}</td>
                    <td className="px-2 text-right tabular-nums">
                      {fmt(calc.result.summary.supply)} / {fmt(calc.result.summary.extract)}
                    </td>
                    <td className="px-2">
                      <Mark ok={c.supplyOk && c.extractOk && c.balanced} label={!c.balanced ? t("unbalanced") : undefined} />
                    </td>
                    <td className="px-2">
                      <Mark ok={c.baseOk} label={`${fmt(c.base)} m³/h`} />
                    </td>
                    <td className="px-2">
                      {c.pressure.status === null ? (
                        <span className="text-muted-foreground">–</span>
                      ) : (
                        <Mark ok={c.pressure.status !== "exceeded"} label={`${fmt(c.drop)} Pa`} />
                      )}
                    </td>
                    <td className="px-2">
                      <Mark ok={c.spiOk} label={c.spi === null ? undefined : fmt(c.spi, 2)} />
                    </td>
                    <td className={cn("px-2", c.tooSmall && "text-destructive")}>{calc.result.device?.name ?? "–"}</td>
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

/** Ausführungsprojekt: design values per room = target values for balancing and commissioning. */
export function TargetsWidget({ calcs }: WidgetProps) {
  const t = useTranslations("kwlPlan.targets");
  const tRooms = useTranslations("kwl");

  return (
    <Section title={t("title")} description={t("description")}>
      {calcs.length === 0 ? (
        <Notice tone="info">{t("empty")}</Notice>
      ) : (
        calcs.map((calc) => (
          <details key={calc.id} className="rounded-lg border" open={calcs.length === 1}>
            <summary className="cursor-pointer px-3 py-2 font-medium">
              {calc.name}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({fmt(calc.result.summary.supply)} / {fmt(calc.result.summary.extract)} m³/h
                {calc.result.device ? ` · ${calc.result.device.name}` : ""})
              </span>
            </summary>
            <div className="overflow-x-auto px-3 pb-3">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-1 text-left font-medium">{tRooms("rooms.number")}</th>
                    <th className="text-left font-medium">{tRooms("rooms.name")}</th>
                    <th className="px-2 text-right font-medium">{t("supplyMin")}</th>
                    <th className="px-2 text-right font-medium">{t("supply")}</th>
                    <th className="px-2 text-right font-medium">{t("extractMin")}</th>
                    <th className="px-2 text-right font-medium">{t("extract")}</th>
                  </tr>
                </thead>
                <tbody>
                  {calc.result.rows
                    .filter((r) => r.supply || r.extract)
                    .map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-1">{r.number}</td>
                        <td>
                          {r.name}
                          {r.type && <span className="ml-1 text-xs text-muted-foreground">{findRoomType(r.type)?.code}</span>}
                        </td>
                        <td className="px-2 text-right text-muted-foreground tabular-nums">{fmt(r.minSupply)}</td>
                        <td className="px-2 text-right font-medium tabular-nums">{fmt(r.supply)}</td>
                        <td className="px-2 text-right text-muted-foreground tabular-nums">{fmt(r.minExtract)}</td>
                        <td className="px-2 text-right font-medium tabular-nums">{fmt(r.extract)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("device", {
                  supply: calc.result.deviceResult.supply?.nominalStage?.stage ?? "–",
                  extract: calc.result.deviceResult.extract?.nominalStage?.stage ?? "–",
                })}
              </p>
            </div>
          </details>
        ))
      )}
    </Section>
  );
}
