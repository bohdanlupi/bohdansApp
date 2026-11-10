"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Section } from "@/components/planning/fields";
import { Fact, NumberParam, OptionField, SaveIndicator, Toggle } from "@/components/planning/plan-ui";
import { usePlan } from "@/components/planning/use-plan";
import { buttonVariants } from "@/components/ui/button";
import { phaseProgress } from "@/lib/planning";
import { sanitaryPhases } from "@/lib/sanitary/phases";
import { type SanitaryParams, type SanitaryPlan, sanitaryScopes, separatorTypes } from "@/lib/sanitary/plan-schema";
import type { AppLanguage } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

import { saveSanitaryPlan } from "./actions";

/** Overview of the Sanitärplanung: Auslegungskriterien, derived limits, the Anlagen and the phase progress. */
export function PlanOverview({
  projectId,
  initial,
  systems,
  language,
  editable,
}: {
  projectId: string;
  initial: SanitaryPlan;
  systems: { id: string; name: string; circulation: "none" | "conventional" | "rar" }[];
  language: AppLanguage;
  editable: boolean;
}) {
  const t = useTranslations("sanitaryPlan");
  const { plan, update, status } = usePlan(projectId, initial, editable, saveSanitaryPlan);
  const p = plan.params;
  const set = <K extends keyof SanitaryParams>(key: K, value: SanitaryParams[K]) => update((d) => ({ ...d, params: { ...d.params, [key]: value } }));
  const o = (group: string) => (value: string) => t(`options.${group}.${value}` as never);
  const toggleIn = <K extends "scope" | "separators">(key: K, value: SanitaryParams[K][number], on: boolean) =>
    set(key, (on ? [...p[key], value] : p[key].filter((v) => v !== value)) as SanitaryParams[K]);

  const water = p.scope.includes("drinkingWater");
  const drainage = p.scope.includes("wastewater") || p.scope.includes("rainwater");
  const warm = p.warmKeeping !== "none";
  const sensitive = p.use === "sensitive";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex items-center gap-3">
          {editable && <SaveIndicator status={status} />}
          <a href={`/api/pdf/sanitary-plan/${projectId}`} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}>
            <FileText />
            {t("pdf")}
          </a>
        </div>
      </div>

      <Section title={t("criteria.title")} description={t("criteria.description")}>
        <div className="grid gap-2 sm:grid-cols-3">
          {sanitaryScopes.map((scope) => (
            <Toggle key={scope} label={o("scope")(scope)} checked={p.scope.includes(scope)} editable={editable} onChange={(v) => toggleIn("scope", scope, v)} />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <OptionField label={t("params.buildingType")} value={p.buildingType} options={["efh", "mfh", "nonResidential"] as const} optionLabel={o("buildingType")} editable={editable} onChange={(v) => set("buildingType", v)} />
          <OptionField label={t("params.construction")} value={p.construction} options={["new", "renovation"] as const} optionLabel={o("construction")} editable={editable} onChange={(v) => set("construction", v)} />
          <OptionField label={t("params.use")} value={p.use} options={["residential", "sensitive"] as const} optionLabel={o("use")} editable={editable} onChange={(v) => set("use", v)} hint={t("params.useHint")} />
          <NumberParam label={t("params.units")} value={p.units} editable={editable} onChange={(v) => set("units", v)} hint={t("params.unitsHint")} />
          {water && (
            <>
              <OptionField label={t("params.dhw")} value={p.dhw} options={["central", "decentral", "mixed"] as const} optionLabel={o("dhw")} editable={editable} onChange={(v) => set("dhw", v)} />
              <OptionField label={t("params.heater")} value={p.heater} options={["storage", "instant"] as const} optionLabel={o("heater")} editable={editable} onChange={(v) => set("heater", v)} />
              <OptionField label={t("params.warmKeeping")} value={p.warmKeeping} options={["circulation", "traceHeating", "none"] as const} optionLabel={o("warmKeeping")} editable={editable} onChange={(v) => set("warmKeeping", v)} hint={t("params.warmKeepingHint")} />
              <OptionField label={t("params.heatSource")} value={p.heatSource} options={["boiler", "heatPump", "solar", "electric", "district"] as const} optionLabel={o("heatSource")} editable={editable} onChange={(v) => set("heatSource", v)} />
            </>
          )}
        </div>
        {water && (
          <>
            <p className="text-sm font-medium">{t("params.more")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Toggle label={t("params.pressureBoost")} checked={p.pressureBoost} editable={editable} onChange={(v) => set("pressureBoost", v)} />
              <Toggle label={t("params.pressureReduce")} checked={p.pressureReduce} editable={editable} onChange={(v) => set("pressureReduce", v)} />
              <Toggle label={t("params.waterTreatment")} checked={p.waterTreatment} editable={editable} onChange={(v) => set("waterTreatment", v)} />
              <Toggle label={t("params.rainwaterUse")} checked={p.rainwaterUse} editable={editable} onChange={(v) => set("rainwaterUse", v)} />
              <Toggle label={t("params.fireWater")} checked={p.fireWater} editable={editable} onChange={(v) => set("fireWater", v)} />
            </div>
          </>
        )}
        {drainage && (
          <>
            <p className="text-sm font-medium">{t("params.drainage")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Toggle label={t("params.belowBackflowLevel")} checked={p.belowBackflowLevel} editable={editable} onChange={(v) => set("belowBackflowLevel", v)} />
              <Toggle label={t("params.liftingStation")} checked={p.liftingStation} editable={editable} onChange={(v) => set("liftingStation", v)} />
              {separatorTypes.map((s) => (
                <Toggle key={s} label={o("separators")(s)} checked={p.separators.includes(s)} editable={editable} onChange={(v) => toggleIn("separators", s, v)} />
              ))}
              <Toggle label={t("params.undergroundGarage")} checked={p.undergroundGarage} editable={editable} onChange={(v) => set("undergroundGarage", v)} />
              {p.scope.includes("rainwater") && (
                <>
                  <Toggle label={t("params.flatRoof")} checked={p.flatRoof} editable={editable} onChange={(v) => set("flatRoof", v)} />
                  <Toggle label={t("params.infiltration")} checked={p.infiltration} editable={editable} onChange={(v) => set("infiltration", v)} />
                  <Toggle label={t("params.retention")} checked={p.retention} editable={editable} onChange={(v) => set("retention", v)} />
                </>
              )}
            </div>
          </>
        )}
      </Section>

      <Section title={t("derived.title")} description={t("derived.description")}>
        <div className="grid gap-x-8 md:grid-cols-2">
          {water && (
            <>
              <div>
                <Fact label={t("derived.heaterOut")} value={warm ? t("derived.heaterOutWarm") : t("derived.heaterOutCold")} />
                <Fact label={t("derived.tap")} value={t("derived.tapValue")} />
                <Fact label={t("derived.cold")} value={t("derived.coldValue")} />
                <Fact label={t("derived.flushTime")} value={warm ? t("derived.flushWarm") : t("derived.flushCold")} />
                <Fact label={t("derived.restPressure")} value={t("derived.restPressureValue")} />
                <Fact label={t("derived.flowPressure")} value={t("derived.flowPressureValue")} />
                <Fact label={t("derived.velocity")} value={t("derived.velocityValue")} />
              </div>
              <div>
                <Fact label={t("derived.houseConnection")} value={t("derived.houseConnectionValue")} />
                {p.warmKeeping === "circulation" && <Fact label={t("derived.pump")} value={t("derived.pumpValue")} />}
                <Fact label={t("derived.insulation")} value={t("derived.insulationValue")} />
                <Fact label={t("derived.pressureTest")} value={t("derived.pressureTestValue")} />
                <Fact label={t("derived.legionella")} value={sensitive ? t("derived.legionellaSensitive") : t("derived.legionellaStandard")} />
                <Fact label={t("derived.control")} value={sensitive ? t("derived.controlSensitive") : t("derived.controlStandard")} />
              </div>
            </>
          )}
          {drainage && (
            <div>
              <Fact label={t("derived.backflow")} value={t("derived.backflowValue")} />
              {p.belowBackflowLevel && <Fact label={t("derived.backflowProtection")} value={t("derived.backflowProtectionValue")} />}
              <Fact label={t("derived.slope")} value={t("derived.slopeValue")} />
              {p.scope.includes("rainwater") && <Fact label={t("derived.rainfall")} value={t("derived.rainfallValue")} />}
            </div>
          )}
        </div>
      </Section>

      {water && (
        <Section title={t("systems.title")} description={t("systems.description")}>
          {systems.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("systems.none")}</p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {systems.map((s) => (
                <li key={s.id}>
                  <Link href={`/projekte/${projectId}/sanitaer/anlagen/${s.id}`} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">{t(`systems.circulation.${s.circulation}`)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section title={t("phaseList")}>
        <ol className="grid gap-2 md:grid-cols-2">
          {sanitaryPhases.map((phase) => {
            const progress = phaseProgress(phase, p, plan.checks);
            const complete = progress.total > 0 && progress.done === progress.total;
            return (
              <li key={phase.code}>
                <Link href={`/projekte/${projectId}/sanitaer/${phase.code}`} className="block rounded-lg border px-3 py-2.5 hover:bg-muted/50">
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
