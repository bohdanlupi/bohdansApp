"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Section } from "@/components/planning/fields";
import { Fact, NumberParam, OptionField, SaveIndicator, Toggle } from "@/components/planning/plan-ui";
import { usePlan } from "@/components/planning/use-plan";
import { buttonVariants } from "@/components/ui/button";
import { heatingPhases } from "@/lib/heating/phases";
import { emitterTypes, generatorTypes, type HeatingParams, type HeatingPlan } from "@/lib/heating/plan-schema";
import { phaseProgress } from "@/lib/planning";
import type { AppLanguage } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

import { saveHeatingPlan } from "./actions";

/** Maximum and target flow temperature at design conditions (SIA 384/1 Tabelle 4). */
const flowLimits = { floor: [35, 30], tabs: [35, 30], radiators: [50, 40], air: [50, 35] } as const;

export function HeatingOverview({
  projectId,
  initial,
  language,
  editable,
}: {
  projectId: string;
  initial: HeatingPlan;
  language: AppLanguage;
  editable: boolean;
}) {
  const t = useTranslations("heatingPlan");
  const { plan, update, status } = usePlan(projectId, initial, editable, saveHeatingPlan);
  const p = plan.params;
  const set = <K extends keyof HeatingParams>(key: K, value: HeatingParams[K]) => update((d) => ({ ...d, params: { ...d.params, [key]: value } }));
  const toggleIn = <T extends string>(values: readonly T[], list: T[], value: T, on: boolean) =>
    values.filter((v) => (v === value ? on : list.includes(v)));
  const o = (group: string) => (value: string) => t(`options.${group}.${value}` as never);

  const hp = p.generators.some((g) => g.startsWith("hp"));
  const surfaceOnly = p.emitters.length > 0 && p.emitters.every((e) => e === "floor" || e === "tabs");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex items-center gap-3">
          {editable && <SaveIndicator status={status} />}
          <a href={`/api/pdf/heating-plan/${projectId}`} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}>
            <FileText />
            {t("pdf")}
          </a>
        </div>
      </div>

      <Section title={t("criteria.title")} description={t("criteria.description")}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <OptionField label={t("params.buildingType")} value={p.buildingType} options={["efh", "mfh", "nonResidential"] as const} optionLabel={o("buildingType")} editable={editable} onChange={(v) => set("buildingType", v)} />
          <OptionField label={t("params.construction")} value={p.construction} options={["new", "renovation", "replacement"] as const} optionLabel={o("construction")} editable={editable} onChange={(v) => set("construction", v)} />
          <OptionField label={t("params.standard")} value={p.standard} options={["standard", "minergie"] as const} optionLabel={o("standard")} editable={editable} onChange={(v) => set("standard", v)} />
          <NumberParam label={t("params.power")} value={p.power} decimals={1} editable={editable} onChange={(v) => set("power", v)} hint={t("params.powerHint")} />
          <NumberParam label={t("params.energyArea")} value={p.energyArea} editable={editable} onChange={(v) => set("energyArea", v)} />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">{t("params.generators")}</legend>
            {generatorTypes.map((g) => (
              <Toggle key={g} label={o("generators")(g)} checked={p.generators.includes(g)} editable={editable} onChange={(on) => set("generators", toggleIn(generatorTypes, p.generators, g, on))} />
            ))}
            <p className="text-xs text-muted-foreground">{t("params.generatorsHint")}</p>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">{t("params.emitters")}</legend>
            {emitterTypes.map((e) => (
              <Toggle key={e} label={o("emitters")(e)} checked={p.emitters.includes(e)} editable={editable} onChange={(on) => set("emitters", toggleIn(emitterTypes, p.emitters, e, on))} />
            ))}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">{t("params.more")}</legend>
            <Toggle label={t("params.multiUnit")} checked={p.multiUnit} editable={editable} onChange={(v) => set("multiUnit", v)} />
            <Toggle label={t("params.storage")} checked={p.storage} editable={editable} onChange={(v) => set("storage", v)} />
            <Toggle label={t("params.cooling")} checked={p.cooling} editable={editable} onChange={(v) => set("cooling", v)} />
          </fieldset>
        </div>
      </Section>

      <Section title={t("derived.title")} description={t("derived.description")}>
        <div className="grid gap-x-8 md:grid-cols-2">
          <div>
            {p.emitters.map((e) => (
              <Fact key={e} label={t("derived.flowTemp", { emitter: o("emitters")(e) })} value={t("derived.flowTempValue", { limit: flowLimits[e][0], target: flowLimits[e][1] })} />
            ))}
            <Fact label={t("derived.roomControl")} value={surfaceOnly ? t("derived.roomControlLow") : t("derived.roomControlAll")} />
            <Fact label={t("derived.pipes")} value={t("derived.pipesValue")} />
            {p.emitters.includes("radiators") && <Fact label={t("derived.trv")} value={t("derived.trvValue")} />}
            {p.emitters.includes("floor") && <Fact label={t("derived.fbhSurface")} value={t("derived.fbhSurfaceValue")} />}
            {p.emitters.includes("floor") && <Fact label={t("derived.fbhCircuit")} value={t("derived.fbhCircuitValue")} />}
          </div>
          <div>
            <Fact label={t("derived.tolerance")} value={t("derived.toleranceValue")} />
            {hp && <Fact label={t("derived.emergency")} value={t("derived.emergencyValue")} />}
            {p.generators.includes("hpBrine") && <Fact label={t("derived.bhe")} value={t("derived.bheValue")} />}
            <Fact label={t("derived.insulation")} value={t("derived.insulationValue")} />
            <Fact label={t("derived.measureConcept")} value={p.energyArea !== null && p.energyArea <= 2000 ? t("derived.none") : t("derived.measureConceptValue")} />
          </div>
        </div>
      </Section>

      <Section title={t("phaseList")}>
        <ol className="grid gap-2 md:grid-cols-2">
          {heatingPhases.map((phase) => {
            const progress = phaseProgress(phase, p, plan.checks);
            const complete = progress.total > 0 && progress.done === progress.total;
            return (
              <li key={phase.code}>
                <Link href={`/projekte/${projectId}/heizung/${phase.code}`} className="block rounded-lg border px-3 py-2.5 hover:bg-muted/50">
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
