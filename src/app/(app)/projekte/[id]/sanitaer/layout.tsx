import { getLocale } from "next-intl/server";

import { localeToLanguage, type Locale } from "@/i18n/config";
import { phaseProgress } from "@/lib/planning";
import { sanitaryPhases } from "@/lib/sanitary/phases";

import { loadSanitaryPlan } from "./load-plan";
import { SanitaryNav } from "./plan-nav";

export default async function SanitaryLayout({ children, params }: LayoutProps<"/projekte/[id]/sanitaer">) {
  const { id } = await params;
  const plan = await loadSanitaryPlan(id);
  const language = localeToLanguage((await getLocale()) as Locale);
  const items = sanitaryPhases.map((phase) => ({
    code: phase.code,
    title: phase.title[language],
    ...phaseProgress(phase, plan.params, plan.checks),
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
      <SanitaryNav projectId={id} phases={items} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
