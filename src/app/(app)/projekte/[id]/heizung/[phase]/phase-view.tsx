"use client";

import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";

import { Section } from "@/components/planning/fields";
import { Checklist, SaveIndicator } from "@/components/planning/plan-ui";
import { usePlan } from "@/components/planning/use-plan";
import { buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { findHeatingPhase } from "@/lib/heating/phases";
import type { HeatingPlan } from "@/lib/heating/plan-schema";
import type { AppLanguage } from "@/lib/supabase/types";

import { saveHeatingPlan } from "../actions";

const fullRef = (ref: string) => ref;

export function HeatingPhaseView({
  code,
  projectId,
  initial,
  language,
  editable,
}: {
  code: string;
  projectId: string;
  initial: HeatingPlan;
  language: AppLanguage;
  editable: boolean;
}) {
  const t = useTranslations("heatingPlan");
  const phase = findHeatingPhase(code)!;
  const { plan, update, status } = usePlan(projectId, initial, editable, saveHeatingPlan);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            {t("phaseLabel", { code: phase.code })} · SIA 108 {phase.sia108}
          </p>
          <h2 className="text-lg font-semibold">{phase.title[language]}</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">{phase.goal[language]}</p>
        </div>
        <div className="flex items-center gap-3">
          {editable && <SaveIndicator status={status} />}
          <a href={`/api/pdf/heating-plan/${projectId}?phase=${phase.code}`} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}>
            <FileText />
            {t("pdfPhase")}
          </a>
        </div>
      </div>

      {plan.params.generators.length === 0 && phase.code === "31" && <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">{t("chooseGenerators")}</p>}

      {phase.sections.map((section) => (
        <Checklist
          key={section.key}
          title={section.title[language]}
          items={section.items.filter((item) => !item.when || item.when(plan.params))}
          checks={plan.checks}
          language={language}
          editable={editable}
          formatRef={fullRef}
          onChange={(id, value) =>
            update((d) => {
              const checks = { ...d.checks };
              if (value) checks[id] = value;
              else delete checks[id];
              return { ...d, checks };
            })
          }
        />
      ))}

      <Section title={t("phaseNotes")}>
        <Textarea
          rows={4}
          maxLength={4000}
          aria-label={t("phaseNotes")}
          defaultValue={plan.notes[phase.code] ?? ""}
          disabled={!editable}
          onBlur={(e) => {
            const value = e.target.value;
            if (value !== (plan.notes[phase.code] ?? "")) update((d) => ({ ...d, notes: { ...d.notes, [phase.code]: value } }));
          }}
        />
      </Section>
    </div>
  );
}
