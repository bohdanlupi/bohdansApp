import { getLocale } from "next-intl/server";
import { Suspense } from "react";

import { localeToLanguage, type Locale } from "@/i18n/config";
import { heatingPhases } from "@/lib/heating/phases";
import { phaseProgress } from "@/lib/planning";

import { loadHeatingParams, loadHeatingPlan } from "./load-plan";
import { HeatingNav } from "./plan-nav";

export default async function HeatingLayout({ children, params }: LayoutProps<"/projekte/[id]/heizung">) {
  const { id } = await params;
  // Checklist progress with the parameters taken from the chapters (Anlagen, Wärmebedarf, Fussbodenheizung).
  const [plan, heatingParams] = await Promise.all([loadHeatingPlan(id), loadHeatingParams(id)]);
  const language = localeToLanguage((await getLocale()) as Locale);
  const items = heatingPhases.map((phase) => ({
    code: phase.code,
    title: phase.title[language],
    ...phaseProgress(phase, heatingParams, plan.checks),
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
      {/* useSearchParams (the chosen Anlage) needs a Suspense boundary. */}
      <Suspense>
        <HeatingNav projectId={id} phases={items} />
      </Suspense>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
