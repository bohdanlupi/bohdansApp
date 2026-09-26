import { getLocale } from "next-intl/server";

import { localeToLanguage, type Locale } from "@/i18n/config";
import { heatingPhases } from "@/lib/heating/phases";
import { phaseProgress } from "@/lib/planning";

import { loadHeatingPlan } from "./load-plan";
import { HeatingNav } from "./plan-nav";

export default async function HeatingLayout({ children, params }: LayoutProps<"/projekte/[id]/heizung">) {
  const { id } = await params;
  const plan = await loadHeatingPlan(id);
  const language = localeToLanguage((await getLocale()) as Locale);
  const items = heatingPhases.map((phase) => ({
    code: phase.code,
    title: phase.title[language],
    ...phaseProgress(phase, plan.params, plan.checks),
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
      <HeatingNav projectId={id} phases={items} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
