import { getLocale } from "next-intl/server";

import { localeToLanguage, type Locale } from "@/i18n/config";
import { fireProgress, firePhases } from "@/lib/fire/phases";

import { loadFirePlans } from "./load-plan";
import { FireNav } from "./plan-nav";

export default async function FireLayout({ children, params }: LayoutProps<"/projekte/[id]/brandschutz">) {
  const { id } = await params;
  const plans = await loadFirePlans(id);
  const language = localeToLanguage((await getLocale()) as Locale);
  const items = firePhases.map((phase) => ({ code: phase.code, title: phase.title[language], ...fireProgress(phase, plans) }));

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
      <FireNav projectId={id} phases={items} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
