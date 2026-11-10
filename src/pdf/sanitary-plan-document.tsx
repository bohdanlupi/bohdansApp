import { phaseItems } from "@/lib/planning";
import type { SanitaryPhase } from "@/lib/sanitary/phases";
import type { SanitaryPlan } from "@/lib/sanitary/plan-schema";
import type { AppLanguage, FirmSettings } from "@/lib/supabase/types";

import type { KwlTranslate } from "./kwl-document";
import type { LogoSource } from "./letterhead";
import { PlanChecklistDocument } from "./plan-checklist-document";

/** Sanitärplanung: Auslegungskriterien and checklist status of the chosen SIA 108 phases. */
export function SanitaryPlanDocument({
  firm,
  logo,
  t,
  language,
  pageLabel,
  projectLabel,
  dateLabel,
  project,
  plan,
  phases,
}: {
  firm: FirmSettings;
  logo: LogoSource | null;
  /** Translator for the `sanitaryPlan` namespace. */
  t: KwlTranslate;
  language: AppLanguage;
  pageLabel: (page: number, total: number) => string;
  projectLabel: string;
  dateLabel: string;
  project: { number: string; name: string };
  plan: SanitaryPlan;
  phases: SanitaryPhase[];
}) {
  const p = plan.params;
  const o = (group: string, value: string) => t(`options.${group}.${value}`);
  const many = (group: string, values: string[]) => (values.length ? values.map((v) => o(group, v)).join(", ") : "-");
  const yes = (on: boolean) => (on ? t("yes") : t("no"));
  const criteria: [string, string][] = [
    [t("params.scope"), many("scope", p.scope)],
    [t("params.buildingType"), o("buildingType", p.buildingType)],
    [t("params.construction"), o("construction", p.construction)],
    [t("params.use"), o("use", p.use)],
    [t("params.units"), p.units === null ? "-" : String(p.units)],
    [t("params.dhw"), o("dhw", p.dhw)],
    [t("params.heater"), o("heater", p.heater)],
    [t("params.warmKeeping"), o("warmKeeping", p.warmKeeping)],
    [t("params.heatSource"), o("heatSource", p.heatSource)],
    [t("params.pressureBoost"), yes(p.pressureBoost)],
    [t("params.pressureReduce"), yes(p.pressureReduce)],
    [t("params.waterTreatment"), yes(p.waterTreatment)],
    [t("params.rainwaterUse"), yes(p.rainwaterUse)],
    [t("params.fireWater"), yes(p.fireWater)],
    [t("params.belowBackflowLevel"), yes(p.belowBackflowLevel)],
    [t("params.liftingStation"), yes(p.liftingStation)],
    [t("params.separators"), many("separators", p.separators)],
    [t("params.infiltration"), yes(p.infiltration)],
    [t("params.retention"), yes(p.retention)],
    [t("params.flatRoof"), yes(p.flatRoof)],
    [t("params.undergroundGarage"), yes(p.undergroundGarage)],
  ];

  return (
    <PlanChecklistDocument
      firm={firm}
      logo={logo}
      pageLabel={pageLabel}
      projectLabel={projectLabel}
      dateLabel={dateLabel}
      project={project}
      title={t("title")}
      criteriaTitle={t("criteria.title")}
      criteria={criteria}
      phases={phases.map((phase) => ({
        code: phase.code,
        title: phase.title[language],
        goal: phase.goal[language],
        items: phaseItems(phase, p).map((item) => ({ id: item.id, text: item.text[language], ref: item.ref })),
      }))}
      checks={plan.checks}
      notes={plan.notes}
      phaseNotesLabel={t("phaseNotes")}
      normsHint={t("normsHint")}
    />
  );
}
