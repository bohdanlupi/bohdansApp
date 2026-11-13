import { type Phase, phaseItems } from "@/lib/kwl/phases";
import type { PlanData } from "@/lib/kwl/plan-schema";
import type { AppLanguage, FirmSettings } from "@/lib/supabase/types";

import type { KwlTranslate } from "./kwl-document";
import type { LogoSource } from "./letterhead";
import { PlanChecklistDocument } from "./plan-checklist-document";

/** KWL-Planung: design criteria and checklist status of the chosen SIA 108 phases. */
export function KwlPlanDocument({
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
  /** Translator for the `kwlPlan` namespace. */
  t: KwlTranslate;
  language: AppLanguage;
  pageLabel: (page: number, total: number) => string;
  projectLabel: string;
  dateLabel: string;
  project: { number: string; name: string };
  plan: PlanData;
  phases: Phase[];
}) {
  const p = plan.params;
  const o = (group: string, value: string) => t(`options.${group}.${value}`);
  const criteria: [string, string][] = [
    [t("params.buildingType"), o("buildingType", p.buildingType)],
    [t("params.construction"), o("construction", p.construction)],
    [t("params.system"), o("system", p.system)],
    [t("params.unit"), o("unit", p.unit) + (p.unit === "multi" && p.simultaneity ? ` (${p.simultaneity})` : "")],
    [t("params.operation"), o("operation", p.operation)],
    [t("params.standard"), o("standard", p.standard)],
    [t("params.dwellings"), p.dwellings === null ? "-" : String(p.dwellings)],
    [t("params.altitude"), p.altitude === null ? "-" : `${p.altitude} m`],
    [t("params.fireplace"), o("fireplace", p.fireplace)],
    [t("params.kitchen"), o("kitchen", p.kitchen)],
    [t("params.airtightness"), o("airtightness", p.airtightness)],
    [t("params.noise"), o("noise", p.noise)],
    [t("params.usage"), o("usage", p.usage)],
    [t("params.odaClass"), o("odaClass", p.odaClass)],
    [t("params.humidifier"), p.humidifier ? t("yes") : t("no")],
    [t("params.coolingCoil"), p.coolingCoil ? t("yes") : t("no")],
    [t("params.earthTube"), p.earthTube ? t("yes") : t("no")],
    [t("params.airHeating"), p.airHeating ? t("yes") : t("no")],
    [t("params.fireCompartments"), p.fireCompartments ? t("yes") : t("no")],
    [t("params.commercialKitchen"), p.commercialKitchen ? t("yes") : t("no")],
    [t("params.parkingVentilation"), p.parkingVentilation ? t("yes") : t("no")],
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
        items: phaseItems(phase, p).map((item) => ({
          id: item.id,
          text: item.text[language],
          ref: item.ref.startsWith("SIA") ? item.ref : `SIA 382/5 ${item.ref}`,
        })),
      }))}
      checks={plan.checks}
      notes={plan.notes}
      phaseNotesLabel={t("phaseNotes")}
      normsHint={t("normsHint")}
    />
  );
}
