"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Section } from "@/components/planning/fields";
import { Fact, NumberParam, OptionField, SaveIndicator, Toggle } from "@/components/planning/plan-ui";
import { usePlan } from "@/components/planning/use-plan";
import { buttonVariants } from "@/components/ui/button";
import { fireProgress, firePhases, type FirePlans } from "@/lib/fire/phases";
import { fireConcepts, fireHeights, type FireParams, fireUsages, smokeExtractionTypes } from "@/lib/fire/plan-schema";
import { suggestedQss } from "@/lib/fire/qss";
import { generatorTypes } from "@/lib/heating/plan-schema";
import type { AppLanguage } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

import { saveFirePlan } from "./actions";
import { useTradePlans } from "./use-trade-plans";

const qssLevels = ["1", "2", "3", "4"] as const;

/**
 * Overview of the Brandschutzplanung: the Auslegungskriterien after the VKF Brandschutzvorschriften, the HLKS
 * criteria shared with Heizung, Lüftung and Sanitär (they gate the mirrored fire items there), derived
 * requirements and the phase progress.
 */
export function FireOverview({ projectId, initial, language, editable }: { projectId: string; initial: FirePlans; language: AppLanguage; editable: boolean }) {
  const t = useTranslations("firePlan");
  const tHeating = useTranslations("heatingPlan");
  const { plan, update, status } = usePlan(projectId, initial.fire, editable, saveFirePlan);
  const trades = useTradePlans(projectId, { heating: initial.heating, ventilation: initial.ventilation, sanitary: initial.sanitary }, editable);
  const plans: FirePlans = { fire: plan, ...trades.plans };
  const p = plan.params;
  const h = trades.plans.heating.params;
  const v = trades.plans.ventilation.params;
  const s = trades.plans.sanitary.params;
  const set = <K extends keyof FireParams>(key: K, value: FireParams[K]) => update((d) => ({ ...d, params: { ...d.params, [key]: value } }));
  const o = (group: string) => (value: string) => t(`options.${group}.${value}` as never);

  const suggested = suggestedQss(p);
  const combustion = h.generators.some((g) => g === "pellets" || g === "logWood" || g === "gasOil");
  const big = h.power === null || h.power > 70;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex items-center gap-3">
          {editable && <SaveIndicator status={status !== "saved" ? status : trades.status} />}
          <a href={`/api/pdf/fire-plan/${projectId}`} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}>
            <FileText />
            {t("pdf")}
          </a>
        </div>
      </div>

      <Section title={t("criteria.title")} description={t("criteria.description")}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <OptionField label={t("params.height")} value={p.height} options={fireHeights} optionLabel={o("height")} editable={editable} onChange={(value) => set("height", value)} hint={t("params.heightHint")} />
          <OptionField label={t("params.construction")} value={p.construction} options={["new", "renovation"] as const} optionLabel={o("construction")} editable={editable} onChange={(value) => set("construction", value)} />
          <OptionField label={t("params.concept")} value={p.concept} options={fireConcepts} optionLabel={o("concept")} editable={editable} onChange={(value) => set("concept", value)} />
          <OptionField
            label={t("params.qss")}
            value={String(p.qss) as (typeof qssLevels)[number]}
            options={qssLevels}
            optionLabel={(value) => `QSS ${value}`}
            editable={editable}
            onChange={(value) => set("qss", Number(value))}
            hint={t("params.qssHint", { n: suggested })}
          />
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">{t("params.usages")}</legend>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {fireUsages.map((u) => (
              <Toggle
                key={u}
                label={o("usages")(u)}
                checked={p.usages.includes(u)}
                editable={editable}
                onChange={(on) => set("usages", fireUsages.filter((x) => (x === u ? on : p.usages.includes(x))))}
              />
            ))}
          </div>
        </fieldset>
        <div className="grid gap-6 md:grid-cols-2">
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">{t("params.project")}</legend>
            <Toggle label={t("params.qsRole")} checked={p.qsRole} editable={editable} onChange={(value) => set("qsRole", value)} />
            <Toggle label={t("params.timber")} checked={p.timber} editable={editable} onChange={(value) => set("timber", value)} />
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">{t("params.systems")}</legend>
            <Toggle label={t("params.sprinkler")} checked={p.sprinkler} editable={editable} onChange={(value) => set("sprinkler", value)} />
            <Toggle label={t("params.fireAlarm")} checked={p.fireAlarm} editable={editable} onChange={(value) => set("fireAlarm", value)} />
            <Toggle label={t("params.lightning")} checked={p.lightning} editable={editable} onChange={(value) => set("lightning", value)} />
            <Toggle label={t("params.safetyLighting")} checked={p.safetyLighting} editable={editable} onChange={(value) => set("safetyLighting", value)} />
            <Toggle label={t("params.lifts")} checked={p.lifts} editable={editable} onChange={(value) => set("lifts", value)} />
            <OptionField label={t("params.smokeExtraction")} value={p.smokeExtraction} options={smokeExtractionTypes} optionLabel={o("smokeExtraction")} editable={editable} onChange={(value) => set("smokeExtraction", value)} />
          </fieldset>
        </div>
      </Section>

      <Section title={t("hlks.title")} description={t("hlks.description")}>
        <div className="grid gap-6 md:grid-cols-3">
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">{t("trades.heating")}</legend>
            {generatorTypes.map((g) => (
              <Toggle
                key={g}
                label={tHeating(`options.generators.${g}`)}
                checked={h.generators.includes(g)}
                editable={editable}
                onChange={(on) => trades.setParam("heating", "generators", generatorTypes.filter((x) => (x === g ? on : h.generators.includes(x))))}
              />
            ))}
            {h.generators.includes("gasOil") && (
              <OptionField label={t("hlks.fuel")} value={h.fuel} options={["oil", "gas"] as const} optionLabel={o("fuel")} editable={editable} onChange={(value) => trades.setParam("heating", "fuel", value)} />
            )}
            <NumberParam label={t("hlks.power")} value={h.power} decimals={1} editable={editable} onChange={(value) => trades.setParam("heating", "power", value)} hint={t("hlks.powerHint")} />
            <Toggle label={t("hlks.oilTank")} checked={h.oilTank} editable={editable} onChange={(value) => trades.setParam("heating", "oilTank", value)} />
            <Toggle label={t("hlks.fireplace")} checked={h.fireplace} editable={editable} onChange={(value) => trades.setParam("heating", "fireplace", value)} />
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">{t("trades.ventilation")}</legend>
            <Toggle label={t("hlks.fireCompartments")} checked={v.fireCompartments} editable={editable} onChange={(value) => trades.setParam("ventilation", "fireCompartments", value)} />
            <Toggle label={t("hlks.commercialKitchen")} checked={v.commercialKitchen} editable={editable} onChange={(value) => trades.setParam("ventilation", "commercialKitchen", value)} />
            <Toggle label={t("hlks.parkingVentilation")} checked={v.parkingVentilation} editable={editable} onChange={(value) => trades.setParam("ventilation", "parkingVentilation", value)} />
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">{t("trades.sanitary")}</legend>
            <Toggle label={t("hlks.fireWater")} checked={s.fireWater} editable={editable} onChange={(value) => trades.setParam("sanitary", "fireWater", value)} />
            <Toggle label={t("hlks.sprinklerSupply")} checked={s.sprinklerSupply} editable={editable} onChange={(value) => trades.setParam("sanitary", "sprinklerSupply", value)} />
          </fieldset>
        </div>
      </Section>

      <Section title={t("derived.title")} description={t("derived.description")}>
        <div className="grid gap-x-8 md:grid-cols-2">
          <div>
            <Fact label={t("derived.height")} value={t(`derived.heightValue.${p.height}`)} />
            <Fact label={t("derived.qss")} value={t("derived.qssValue", { n: suggested, chosen: p.qss })} ok={p.qss >= suggested ? null : false} />
            <Fact label={t("derived.documents")} value={t(`derived.documentsValue.${Math.min(p.qss, 4)}` as never)} />
            {p.qss === 4 && <Fact label={t("derived.control")} value={t("derived.controlValue")} />}
          </div>
          <div>
            {combustion && <Fact label={t("derived.heatRoom")} value={big ? t("derived.heatRoomBig") : t("derived.heatRoomSmall")} />}
            {combustion && <Fact label={t("derived.heatRoomDoor")} value={big ? t("derived.heatRoomDoorBig") : t("derived.heatRoomDoorSmall")} />}
            <Fact label={t("derived.handover")} value={t("derived.handoverValue")} />
          </div>
        </div>
      </Section>

      <Section title={t("phaseList")}>
        <ol className="grid gap-2 md:grid-cols-2">
          {firePhases.map((phase) => {
            const progress = fireProgress(phase, plans);
            const complete = progress.total > 0 && progress.done === progress.total;
            return (
              <li key={phase.code}>
                <Link href={`/projekte/${projectId}/brandschutz/${phase.code}`} className="block rounded-lg border px-3 py-2.5 hover:bg-muted/50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      <span className="mr-2 font-mono text-sm text-muted-foreground">{phase.code}</span>
                      {phase.title[language]}
                    </span>
                    <span className={cn("text-xs tabular-nums", complete ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
                      {progress.done}/{progress.total}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-muted">
                    <div className={cn("h-full", complete ? "bg-emerald-600" : "bg-brand")} style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{phase.goal[language]}</p>
                </Link>
              </li>
            );
          })}
        </ol>
      </Section>
      <p className="text-xs text-muted-foreground">{t("normsHint")}</p>
    </div>
  );
}
