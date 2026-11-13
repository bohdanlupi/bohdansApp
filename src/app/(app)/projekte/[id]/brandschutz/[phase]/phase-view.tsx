"use client";

import { Eye, EyeOff, FileText } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Section } from "@/components/planning/fields";
import { Checklist, SaveIndicator } from "@/components/planning/plan-ui";
import { usePlan } from "@/components/planning/use-plan";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { findFirePhase, fireSectionItems, type FirePlans, sectionTrade, tradePath } from "@/lib/fire/phases";
import type { CheckState } from "@/lib/planning";
import type { AppLanguage } from "@/lib/supabase/types";

import { saveFirePlan } from "../actions";
import { useTradePlans } from "../use-trade-plans";

const fullRef = (ref: string) => ref;

/**
 * Checklists of one SIA 108 phase: the own Brandschutz items and the fire items of Heizung, Lüftung and Sanitär,
 * shown with (and written to) the state of their trade plan.
 */
export function FirePhaseView({
  code,
  projectId,
  initial,
  language,
  editable,
}: {
  code: string;
  projectId: string;
  initial: FirePlans;
  language: AppLanguage;
  editable: boolean;
}) {
  const t = useTranslations("firePlan");
  const phase = findFirePhase(code)!;
  const { plan, update, status } = usePlan(projectId, initial.fire, editable, saveFirePlan);
  const trades = useTradePlans(projectId, { heating: initial.heating, ventilation: initial.ventilation, sanitary: initial.sanitary }, editable);
  const plans: FirePlans = { fire: plan, ...trades.plans };
  const hidden = phase.sections.flatMap((s) => fireSectionItems(s, plans)).filter((item) => !item.applies || item.state?.s === "na").length;

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
        <div className="flex flex-wrap items-center gap-3">
          {editable && <SaveIndicator status={status !== "saved" ? status : trades.status} />}
          <Button type="button" variant="outline" disabled={!editable} aria-pressed={plan.hideNa} onClick={() => update((d) => ({ ...d, hideNa: !d.hideNa }))}>
            {plan.hideNa ? <EyeOff /> : <Eye />}
            {plan.hideNa ? t("showNa", { n: hidden }) : t("hideNa", { n: hidden })}
          </Button>
          <a href={`/api/pdf/fire-plan/${projectId}?phase=${phase.code}`} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}>
            <FileText />
            {t("pdfPhase")}
          </a>
        </div>
      </div>

      {phase.sections.map((section) => {
        const trade = sectionTrade(section);
        const items = fireSectionItems(section, plans);
        const checks: Record<string, CheckState> = Object.fromEntries(items.flatMap((item) => (item.state ? [[item.id, item.state]] : [])));
        return (
          <div key={section.key} className="space-y-1">
            {trade !== "fire" && (
              <p className="px-1 text-xs text-muted-foreground">
                {t("fromTrade")}{" "}
                <Link href={`/projekte/${projectId}/${tradePath[trade]}/${phase.code}`} className="underline underline-offset-2 hover:text-foreground">
                  {t(`trades.${trade}`)}
                </Link>
              </p>
            )}
            <Checklist
              title={section.title[language]}
              items={items}
              checks={checks}
              language={language}
              editable={editable}
              formatRef={fullRef}
              hideNa={plan.hideNa}
              onChange={(id, value) =>
                trade === "fire"
                  ? update((d) => {
                      const next = { ...d.checks };
                      if (value) next[id] = value;
                      else delete next[id];
                      return { ...d, checks: next };
                    })
                  : trades.setCheck(trade, id, value)
              }
            />
          </div>
        );
      })}

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
