import { type HeatingPhase } from "@/lib/heating/phases";
import type { HeatingPlan } from "@/lib/heating/plan-schema";
import { phaseItems } from "@/lib/planning";
import type { AppLanguage, FirmSettings } from "@/lib/supabase/types";

import type { KwlTranslate } from "./kwl-document";
import type { LogoSource } from "./letterhead";
import { PlanChecklistDocument } from "./plan-checklist-document";

/** Heizungsplanung: Planungsgrundlagen and checklist status of the chosen SIA 108 phases. */
export function HeatingPlanDocument({
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
  /** Translator for the `heatingPlan` namespace. */
  t: KwlTranslate;
  language: AppLanguage;
  pageLabel: (page: number, total: number) => string;
  projectLabel: string;
  dateLabel: string;
  project: { number: string; name: string };
  plan: HeatingPlan;
  phases: HeatingPhase[];
}) {
  const p = plan.params;
  const o = (group: string, value: string) => t(`options.${group}.${value}`);
  const many = (group: string, values: string[]) => (values.length ? values.map((v) => o(group, v)).join(", ") : "-");
  const yes = (on: boolean) => (on ? t("yes") : t("no"));
  const criteria: [string, string][] = [
    [t("params.buildingType"), o("buildingType", p.buildingType)],
    [t("params.construction"), o("construction", p.construction)],
    [t("params.standard"), o("standard", p.standard)],
    [t("params.power"), p.power === null ? "-" : `${p.power} kW`],
    [t("params.energyArea"), p.energyArea === null ? "-" : `${p.energyArea} m²`],
    [t("params.multiUnit"), yes(p.multiUnit)],
    [t("params.generators"), many("generators", p.generators)],
    [t("params.emitters"), many("emitters", p.emitters)],
    [t("params.storage"), yes(p.storage)],
    [t("params.cooling"), yes(p.cooling)],
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
