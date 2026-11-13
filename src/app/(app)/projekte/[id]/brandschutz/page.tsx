import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { localeToLanguage, type Locale } from "@/i18n/config";
import { requireProfile } from "@/lib/auth";

import { loadProject } from "../load-project";
import { loadFirePlans } from "./load-plan";
import { FireOverview } from "./plan-overview";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/brandschutz">): Promise<Metadata> {
  const project = await loadProject((await params).id);
  const t = await getTranslations("firePlan");
  return { title: project ? `${t("title")} · ${project.number}` : t("title") };
}

export default async function FirePlanPage({ params }: PageProps<"/projekte/[id]/brandschutz">) {
  const { id } = await params;
  const profile = await requireProfile();
  const plans = await loadFirePlans(id);
  const language = localeToLanguage((await getLocale()) as Locale);

  return <FireOverview projectId={id} initial={plans} language={language} editable={profile.role !== "viewer"} />;
}
