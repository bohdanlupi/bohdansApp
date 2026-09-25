"use client";

import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { evaluateKwl } from "@/lib/kwl/evaluate";
import { findPhase, type WidgetKey } from "@/lib/kwl/phases";
import type { PlanData } from "@/lib/kwl/plan-schema";
import type { KwlData } from "@/lib/kwl/schema";
import type { AppLanguage } from "@/lib/supabase/types";

import { Section } from "../fields";
import { Checklist, SaveIndicator } from "../plan-ui";
import { usePlan } from "../use-plan";
import { AcousticsWidget } from "../widgets/acoustics";
import { CascadeWidget } from "../widgets/cascade";
import { CommissioningWidget } from "../widgets/commissioning";
import { ConceptWidget } from "../widgets/concept";
import { Co2Widget, ExtractWidget, FrostWidget } from "../widgets/design";
import { DoorGapWidget } from "../widgets/door-gap";
import { DwellingsWidget, TargetsWidget } from "../widgets/dwellings";
import { EnergyWidget, OperationWidget } from "../widgets/energy";
import { IntakeWidget } from "../widgets/intake";
import { LvWidget } from "../widgets/lv";
import { RoughWidget } from "../widgets/rough";
import type { WidgetProps } from "../widgets/types";

const widgets: Record<WidgetKey, (props: WidgetProps) => React.ReactNode> = {
  concept: ConceptWidget,
  rough: RoughWidget,
  energy: EnergyWidget,
  cascade: CascadeWidget,
  dwellings: DwellingsWidget,
  co2: Co2Widget,
  frost: FrostWidget,
  doorGap: DoorGapWidget,
  acoustics: AcousticsWidget,
  intake: IntakeWidget,
  extract: ExtractWidget,
  lv: LvWidget,
  targets: TargetsWidget,
  commissioning: CommissioningWidget,
  operation: OperationWidget,
};

export function PhaseView({
  code,
  projectId,
  initial,
  calcs,
  lvs,
  language,
  editable,
}: {
  code: string;
  projectId: string;
  initial: PlanData;
  calcs: { id: string; name: string; data: KwlData }[];
  lvs: WidgetProps["lvs"];
  language: AppLanguage;
  editable: boolean;
}) {
  const t = useTranslations("kwlPlan");
  const phase = findPhase(code)!;
  const { plan, update, status } = usePlan(projectId, initial, editable);
  const evaluated = useMemo(() => calcs.map((c) => ({ ...c, result: evaluateKwl(c.data) })), [calcs]);
  const props: WidgetProps = { plan, update, projectId, calcs: evaluated, lvs, language, editable };

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
          <a href={`/api/pdf/kwl-plan/${projectId}?phase=${phase.code}`} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}>
            <FileText />
            {t("pdfPhase")}
          </a>
        </div>
      </div>

      {phase.sections.map((section, index) => {
        if (section.kind === "widget") {
          if (section.when && !section.when(plan.params)) return null;
          const Widget = widgets[section.widget];
          return <Widget key={`w-${section.widget}`} {...props} />;
        }
        const items = section.items.filter((item) => !item.when || item.when(plan.params));
        return (
          <Checklist
            key={`c-${section.key}-${index}`}
            title={section.title[language]}
            items={items}
            checks={plan.checks}
            language={language}
            editable={editable}
            onChange={(id, value) =>
              update((d) => {
                const checks = { ...d.checks };
                if (value) checks[id] = value;
                else delete checks[id];
                return { ...d, checks };
              })
            }
          />
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
