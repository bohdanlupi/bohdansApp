"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { phaseProgress, phases } from "@/lib/kwl/phases";
import type { PlanData, PlanParams } from "@/lib/kwl/plan-schema";
import {
  airtightnessClasses,
  defaultInfiltrationFactor,
  energyRequirements,
  fireplaceTypes,
  humidityLimit,
  infiltrationFactors,
  intakeMaxVelocity,
  kitchenConcepts,
  noiseLevels,
  systemTypes,
  transferPressureLimit,
  underPressureLimit,
} from "@/lib/kwl/sia3825";
import { buttonVariants } from "@/components/ui/button";
import type { AppLanguage } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

import { fmt, Section } from "./fields";
import { Fact, NumberParam, OptionField, SaveIndicator, Toggle } from "./plan-ui";
import { usePlan } from "./use-plan";

export function PlanOverview({
  projectId,
  initial,
  language,
  editable,
}: {
  projectId: string;
  initial: PlanData;
  language: AppLanguage;
  editable: boolean;
}) {
  const t = useTranslations("kwlPlan");
  const { plan, update, status } = usePlan(projectId, initial, editable);
  const p = plan.params;
  const set = <K extends keyof PlanParams>(key: K, value: PlanParams[K]) => update((d) => ({ ...d, params: { ...d.params, [key]: value } }));
  const o = (group: string) => (value: string) => t(`options.${group}.${value}` as never);

  const f =
    p.airtightness === "unknown" ? defaultInfiltrationFactor(p.construction === "renovation") : infiltrationFactors[p.airtightness].f;
  const energy = energyRequirements[p.system === "extract" && p.operation === "demand" ? "extractDemand" : p.system];
  const underPressure = underPressureLimit[p.fireplace];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex items-center gap-3">
          {editable && <SaveIndicator status={status} />}
          <a href={`/api/pdf/kwl-plan/${projectId}`} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}>
            <FileText />
            {t("pdf")}
          </a>
        </div>
      </div>

      <Section title={t("criteria.title")} description={t("criteria.description")}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <OptionField label={t("params.buildingType")} value={p.buildingType} options={["efh", "mfh"] as const} optionLabel={o("buildingType")} editable={editable} onChange={(v) => set("buildingType", v)} />
          <OptionField label={t("params.construction")} value={p.construction} options={["new", "renovation"] as const} optionLabel={o("construction")} editable={editable} onChange={(v) => set("construction", v)} />
          <OptionField label={t("params.system")} value={p.system} options={systemTypes} optionLabel={o("system")} editable={editable} onChange={(v) => set("system", v)} hint={t("params.systemHint")} />
          <OptionField label={t("params.unit")} value={p.unit} options={["single", "multi"] as const} optionLabel={o("unit")} editable={editable} onChange={(v) => set("unit", v)} hint={t("params.unitHint")} />
          <OptionField label={t("params.operation")} value={p.operation} options={["continuous", "demand"] as const} optionLabel={o("operation")} editable={editable} onChange={(v) => set("operation", v)} />
          <OptionField label={t("params.standard")} value={p.standard} options={["standard", "minergie"] as const} optionLabel={o("standard")} editable={editable} onChange={(v) => set("standard", v)} />
          <NumberParam label={t("params.dwellings")} value={p.dwellings} editable={editable} onChange={(v) => set("dwellings", v)} />
          {p.unit === "multi" && (
            <NumberParam label={t("params.simultaneity")} value={p.simultaneity} decimals={2} editable={editable} onChange={(v) => set("simultaneity", v)} hint={t("params.simultaneityHint")} placeholder="1.00" />
          )}
          <NumberParam label={t("params.altitude")} value={p.altitude} editable={editable} onChange={(v) => set("altitude", v)} hint={t("params.altitudeHint")} />
          <OptionField label={t("params.storeys")} value={p.storeys} options={["one", "two"] as const} optionLabel={o("storeys")} editable={editable} onChange={(v) => set("storeys", v)} />
          <OptionField label={t("params.fireplace")} value={p.fireplace} options={fireplaceTypes} optionLabel={o("fireplace")} editable={editable} onChange={(v) => set("fireplace", v)} />
          <OptionField label={t("params.kitchen")} value={p.kitchen} options={kitchenConcepts} optionLabel={o("kitchen")} editable={editable} onChange={(v) => set("kitchen", v)} />
          <OptionField label={t("params.airtightness")} value={p.airtightness} options={[...airtightnessClasses, "unknown"] as const} optionLabel={o("airtightness")} editable={editable} onChange={(v) => set("airtightness", v)} />
          <OptionField label={t("params.noise")} value={p.noise} options={noiseLevels} optionLabel={o("noise")} editable={editable} onChange={(v) => set("noise", v)} hint={t("params.noiseHint")} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle label={t("params.radon")} checked={p.radon} editable={editable} onChange={(v) => set("radon", v)} />
          <Toggle label={t("params.strongWind")} checked={p.strongWind} editable={editable} onChange={(v) => set("strongWind", v)} />
          <Toggle label={t("params.fog")} checked={p.fog} editable={editable} onChange={(v) => set("fog", v)} />
          <Toggle label={t("params.publicIntake")} checked={p.publicIntake} editable={editable} onChange={(v) => set("publicIntake", v)} />
        </div>
      </Section>

      <Section title={t("derived.title")} description={t("derived.description")}>
        <div className="grid gap-x-8 md:grid-cols-2">
          <div>
            <Fact label={t("derived.energyClass")} value={energy.energyClass} />
            <Fact
              label={t("derived.externalPressure")}
              value={energy.limit ? t("derived.pressureValue", { limit: energy.limit, target: energy.target }) : t("derived.none")}
            />
            <Fact label={t("derived.transfer")} value={`${transferPressureLimit[p.system]} Pa`} />
            {p.system === "extract" && <Fact label={t("derived.infiltration")} value={fmt(f, 1)} />}
            {p.system === "extract" && (
              <Fact label={t("derived.ald")} value={p.storeys === "two" ? t("derived.aldTwo") : t("derived.aldOne")} />
            )}
            <Fact label={t("derived.underPressure")} value={underPressure === null ? t("derived.none") : `${underPressure} Pa`} />
          </div>
          <div>
            <Fact label={t("derived.humidity")} value={p.altitude === null ? "–" : `${fmt(humidityLimit(p.altitude), 0)} % r. F.`} />
            <Fact label={t("derived.noiseLiving")} value={p.noise === "increased" ? "25 dB" : "28 dB"} />
            <Fact label={t("derived.noiseWet")} value={p.noise === "increased" ? "29 dB" : "33 dB"} />
            <Fact label={t("derived.intake")} value={`≥ ${p.publicIntake ? "3.0" : p.unit === "multi" ? "1.5" : "–"} m · ≤ ${fmt(intakeMaxVelocity(p.fog), 1)} m/s`} />
            <Fact label={t("derived.filters")} value="ZUL ISO ePM1 50 % · ABL ISO coarse 80 %" />
            <Fact label={t("derived.velocity")} value={t("derived.velocityValue")} />
            <Fact label={t("derived.insulation")} value={t("derived.insulationValue")} />
            <Fact label={t("derived.co2")} value="1’000–1’400 ppm" />
          </div>
        </div>
      </Section>

      <Section title={t("phaseList")}>
        <ol className="grid gap-2 md:grid-cols-2">
          {phases.map((phase) => {
            const progress = phaseProgress(phase, p, plan.checks);
            const complete = progress.total > 0 && progress.done === progress.total;
            return (
              <li key={phase.code}>
                <Link href={`/projekte/${projectId}/lueftung/${phase.code}`} className="block rounded-lg border px-3 py-2.5 hover:bg-muted/50">
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
