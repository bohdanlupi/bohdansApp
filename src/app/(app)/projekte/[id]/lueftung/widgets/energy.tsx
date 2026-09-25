"use client";

import { useTranslations } from "next-intl";

import { heatRecoveryMinimum, spiTarget } from "@/lib/kwl/calc";
import { airChangeFlow, fanEnergy, filterLife, newBuildingAirChange, roughDwellingFlow } from "@/lib/kwl/sia3825";
import { cn } from "@/lib/utils";

import { fmt, Result, Section } from "../fields";
import { NumberParam } from "../plan-ui";
import { planInput, type WidgetProps } from "./types";

/** Vorprojekt: estimate of the fan electricity and heat recovery requirement. */
export function EnergyWidget(props: WidgetProps) {
  const t = useTranslations("kwlPlan.energy");
  const p = props.plan.params;
  const rough = props.plan.dwellingTypes.reduce((s, x) => {
    const r = roughDwellingFlow({ rooms: x.rooms ?? 0, baths: x.baths ?? 0, wcs: x.wcs ?? 0, shortUse: x.shortUse ?? 0, closedKitchen: x.closedKitchen });
    return s + r.governing * (x.count ?? 0);
  }, 0);
  const flow = planInput(props, "energy.flow", rough || null);
  const spi = planInput(props, "energy.spi", spiTarget);
  const hours = planInput(props, "energy.hours", 8760);
  const kwh = flow.value && spi.value ? fanEnergy(spi.value, flow.value, hours.value ?? 8760) : null;
  const price = p.electricityPrice ?? 0;

  return (
    <Section title={t("title")} description={t("description")}>
      <div className="grid gap-4 sm:grid-cols-4">
        <NumberParam label={t("flow")} value={flow.value} editable={props.editable} onChange={flow.set} hint={rough ? t("flowHint", { flow: fmt(rough) }) : undefined} />
        <NumberParam label={t("spi")} value={spi.value} decimals={2} editable={props.editable} onChange={spi.set} hint={t("spiHint")} />
        <NumberParam label={t("hours")} value={hours.value} editable={props.editable} onChange={hours.set} />
        <NumberParam
          label={t("price")}
          value={p.electricityPrice}
          decimals={2}
          editable={props.editable}
          onChange={(v) => props.update((d) => ({ ...d, params: { ...d.params, electricityPrice: v } }))}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Result label={t("energy")} value={fmt(kwh)} unit="kWh/a" />
        <Result label={t("cost")} value={kwh === null ? "" : fmt(kwh * price, 0)} unit="CHF/a" />
        <Result
          label={t("heatRecovery")}
          value={`≥ ${fmt((p.standard === "minergie" ? heatRecoveryMinimum.minergie : heatRecoveryMinimum.standard) * 100)} %`}
          hint={t("heatRecoveryHint")}
        />
      </div>
    </Section>
  );
}

/** Betrieb: increased air change after completion, filter intervals, running costs per dwelling. */
export function OperationWidget(props: WidgetProps) {
  const t = useTranslations("kwlPlan.operation");
  const price = props.plan.params.electricityPrice ?? 0;

  return (
    <Section title={t("title")} description={t("description", { first: filterLife.firstStage, second: filterLife.secondStage })}>
      {props.calcs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-1 text-left font-medium">{t("dwelling")}</th>
                <th className="px-2 text-right font-medium">{t("nominal")}</th>
                <th className="px-2 text-right font-medium">{t("firstMonths")}</th>
                <th className="px-2 text-right font-medium">{t("energy")}</th>
                <th className="px-2 text-right font-medium">{t("cost")}</th>
              </tr>
            </thead>
            <tbody>
              {props.calcs.map((c) => {
                const nominal = Math.max(c.result.summary.supply, c.result.summary.extract);
                const first = airChangeFlow(c.result.summary.area, c.data.height, newBuildingAirChange);
                const reachable = Math.max(nominal, c.result.deviceResult.partyFlow ?? 0) >= first;
                const kwh = c.result.deviceResult.spi !== null ? fanEnergy(c.result.deviceResult.spi, nominal) : null;
                return (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-1">{c.name}</td>
                    <td className="px-2 text-right tabular-nums">{fmt(nominal)} m³/h</td>
                    <td className={cn("px-2 text-right tabular-nums", !reachable && "text-destructive")}>{fmt(first)} m³/h</td>
                    <td className="px-2 text-right tabular-nums">{kwh === null ? "–" : `${fmt(kwh)} kWh/a`}</td>
                    <td className="px-2 text-right tabular-nums">{kwh === null ? "–" : `${fmt(kwh * price, 0)} CHF/a`}</td>
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
