"use client";

import { useTranslations } from "next-intl";

import {
  co2Level,
  co2Target,
  defaultInfiltrationFactor,
  extractSystem,
  fourSteps,
  frostImbalanceLimit,
  frostVariants,
  infiltrationFactors,
} from "@/lib/kwl/sia3825";
import { cn } from "@/lib/utils";

import { fmt, Notice, Result, Section } from "../fields";
import { NumberParam } from "../plan-ui";
import { planInput, type WidgetProps } from "./types";

/** 5.2.4.3–5: steady-state CO₂ in a room at a supply flow. */
export function Co2Widget(props: WidgetProps) {
  const t = useTranslations("kwlPlan.co2");
  const flow = planInput(props, "co2.flow", 30);
  const dayPersons = planInput(props, "co2.day", 1);
  const nightPersons = planInput(props, "co2.night", 2);
  const day = co2Level(dayPersons.value ?? 0, flow.value ?? 0, "day");
  const night = co2Level(nightPersons.value ?? 0, flow.value ?? 0, "night");
  const tone = (ppm: number | null) => (ppm === null ? undefined : ppm <= co2Target[1] ? "ok" : "bad");

  return (
    <Section title={t("title")} description={t("description")}>
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberParam label={t("flow")} value={flow.value} editable={props.editable} onChange={flow.set} />
        <NumberParam label={t("dayPersons")} value={dayPersons.value} editable={props.editable} onChange={dayPersons.set} />
        <NumberParam label={t("nightPersons")} value={nightPersons.value} editable={props.editable} onChange={nightPersons.set} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Result label={t("day")} value={fmt(day)} unit="ppm" tone={tone(day)} />
        <Result label={t("night")} value={fmt(night)} unit="ppm" tone={tone(night)} />
      </div>
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
    </Section>
  );
}

/** 5.4.2: simple extract system, extract = max(f · supply step 1, extract step 2), Σ ALD = extract / f. */
export function ExtractWidget(props: WidgetProps) {
  const t = useTranslations("kwlPlan.extract");
  const p = props.plan.params;
  const first = props.calcs[0];
  const steps = first ? fourSteps(first.data.rooms, p.operation === "demand") : null;
  const supply = planInput(props, "extract.supply", steps?.supplyMin ?? null);
  const extract = planInput(props, "extract.extract", steps?.extractMin ?? null);
  const f = p.airtightness === "unknown" ? defaultInfiltrationFactor(p.construction === "renovation") : infiltrationFactors[p.airtightness].f;
  const result = supply.value !== null && extract.value !== null ? extractSystem(supply.value, extract.value, f) : null;

  return (
    <Section title={t("title")} description={t("description")}>
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberParam label={t("supply")} value={supply.value} editable={props.editable} onChange={supply.set} hint={first ? t("fromCalc", { name: first.name }) : undefined} />
        <NumberParam label={t("extract")} value={extract.value} editable={props.editable} onChange={extract.set} />
        <Result label={t("factor")} value={fmt(f, 1)} hint={t(`factorHint.${p.airtightness}`)} />
      </div>
      {result && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Result label={t("extractResult")} value={fmt(result.extract)} unit="m³/h" />
          <Result label={t("ald")} value={fmt(result.outdoorThroughAld)} unit="m³/h" hint={t("aldHint")} />
        </div>
      )}
    </Section>
  );
}

/** 4.3 / Annex D: frost protection variants (Table 8). */
export function FrostWidget({ plan, update, editable }: WidgetProps) {
  const t = useTranslations("kwlPlan.frost");
  const chosen = plan.params.frost;
  const variant = frostVariants.find((v) => v.code === chosen);

  return (
    <Section title={t("title")} description={t("description")}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="w-8" />
              <th className="py-1.5 text-left font-medium">{t("code")}</th>
              <th className="text-left font-medium">{t("variant")}</th>
              <th className="px-2 text-left font-medium">{t("status")}</th>
            </tr>
          </thead>
          <tbody>
            {frostVariants.map((v) => (
              <tr key={v.code} className={cn("border-b last:border-0", v.code === chosen && "bg-brand/10", v.status === "notAllowed" && "text-muted-foreground")}>
                <td className="py-1.5">
                  <input
                    type="radio"
                    name="frost"
                    aria-label={v.code}
                    checked={v.code === chosen}
                    disabled={!editable}
                    onChange={() => update((d) => ({ ...d, params: { ...d.params, frost: v.code } }))}
                  />
                </td>
                <td className="font-mono">{v.code}</td>
                <td>{t(`variants.${v.code}`)}</td>
                <td
                  className={cn(
                    "px-2",
                    v.status === "suitable" && "text-emerald-700 dark:text-emerald-400",
                    v.status === "notAllowed" && "text-destructive",
                    v.status === "possible" && "text-amber-700 dark:text-amber-400",
                  )}
                >
                  {t(`statuses.${v.status}`)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {variant?.status === "notAllowed" && <Notice>{t("notAllowed")}</Notice>}
      <p className="text-xs text-muted-foreground">
        {t("hint", { pa: frostImbalanceLimit.pressure, reduction: fmt(frostImbalanceLimit.supplyReduction * 100) })}
      </p>
    </Section>
  );
}
