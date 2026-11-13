import { type FirePhase, type FirePlans, fireSectionItems } from "@/lib/fire/phases";
import type { CheckState } from "@/lib/planning";
import type { AppLanguage, FirmSettings } from "@/lib/supabase/types";

import type { KwlTranslate } from "./kwl-document";
import type { LogoSource } from "./letterhead";
import { PlanChecklistDocument } from "./plan-checklist-document";

/** Brandschutzplanung: Auslegungskriterien and checklist status (own and mirrored HLKS items) of the chosen phases. */
export function FirePlanDocument({
  firm,
  logo,
  t,
  tHeating,
  language,
  pageLabel,
  projectLabel,
  dateLabel,
  project,
  plans,
  notes,
  phases,
}: {
  firm: FirmSettings;
  logo: LogoSource | null;
  /** Translator for the `firePlan` namespace. */
  t: KwlTranslate;
  /** Translator for the `heatingPlan` namespace (generator names). */
  tHeating: KwlTranslate;
  language: AppLanguage;
  pageLabel: (page: number, total: number) => string;
  projectLabel: string;
  dateLabel: string;
  project: { number: string; name: string };
  plans: FirePlans;
  notes: Record<string, string>;
  phases: FirePhase[];
}) {
  const p = plans.fire.params;
  const h = plans.heating.params;
  const v = plans.ventilation.params;
  const s = plans.sanitary.params;
  const o = (group: string, value: string) => t(`options.${group}.${value}`);
  const yes = (on: boolean) => (on ? t("yes") : t("no"));
  const criteria: [string, string][] = [
    [t("params.height"), o("height", p.height)],
    [t("params.usages"), p.usages.length ? p.usages.map((u) => o("usages", u)).join(", ") : "-"],
    [t("params.construction"), o("construction", p.construction)],
    [t("params.concept"), o("concept", p.concept)],
    [t("params.qss"), `QSS ${p.qss}`],
    [t("params.qsRole"), yes(p.qsRole)],
    [t("params.timber"), yes(p.timber)],
    [t("params.sprinkler"), yes(p.sprinkler)],
    [t("params.fireAlarm"), yes(p.fireAlarm)],
    [t("params.smokeExtraction"), o("smokeExtraction", p.smokeExtraction)],
    [t("params.lightning"), yes(p.lightning)],
    [t("params.safetyLighting"), yes(p.safetyLighting)],
    [t("params.lifts"), yes(p.lifts)],
    [t("hlks.generators"), h.generators.length ? h.generators.map((g) => tHeating(`options.generators.${g}`)).join(", ") : "-"],
    [t("hlks.power"), h.power === null ? "-" : `${h.power} kW`],
    [t("hlks.oilTank"), yes(h.oilTank)],
    [t("hlks.fireplace"), yes(h.fireplace)],
    [t("hlks.fireCompartments"), yes(v.fireCompartments)],
    [t("hlks.commercialKitchen"), yes(v.commercialKitchen)],
    [t("hlks.parkingVentilation"), yes(v.parkingVentilation)],
    [t("hlks.fireWater"), yes(s.fireWater)],
    [t("hlks.sprinklerSupply"), yes(s.sprinklerSupply)],
  ];

  // Own and mirrored states in one record (item ids are unique across the trades).
  const checks: Record<string, CheckState> = {};
  const pdfPhases = phases.map((phase) => {
    const items = phase.sections.flatMap((section) => fireSectionItems(section, plans)).filter((item) => item.applies);
    for (const item of items) if (item.state) checks[item.id] = item.state;
    return {
      code: phase.code,
      title: phase.title[language],
      goal: phase.goal[language],
      items: items.map((item) => ({ id: item.id, text: item.text[language], ref: item.ref })),
    };
  });

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
      phases={pdfPhases}
      checks={checks}
      notes={notes}
      phaseNotesLabel={t("phaseNotes")}
      normsHint={t("normsHint")}
    />
  );
}
