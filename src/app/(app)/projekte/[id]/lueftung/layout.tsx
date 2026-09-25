import { getLocale } from "next-intl/server";

import { localeToLanguage, type Locale } from "@/i18n/config";
import { phaseProgress, phases } from "@/lib/kwl/phases";

import { loadPlan } from "./load-plan";
import { PlanNav } from "./plan-nav";

export default async function VentilationLayout({ children, params }: LayoutProps<"/projekte/[id]/lueftung">) {
  const { id } = await params;
  const plan = await loadPlan(id);
  const language = localeToLanguage((await getLocale()) as Locale);
  const items = phases.map((phase) => ({
    code: phase.code,
    title: phase.title[language],
    ...phaseProgress(phase, plan.params, plan.checks),
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
      <PlanNav projectId={id} phases={items} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
