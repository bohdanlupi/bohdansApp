import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { localeToLanguage, type Locale } from "@/i18n/config";
import { requireProfile } from "@/lib/auth";

import { loadProject } from "../load-project";
import { loadPlan } from "./load-plan";
import { PlanOverview } from "./plan-overview";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/lueftung">): Promise<Metadata> {
  const project = await loadProject((await params).id);
  const t = await getTranslations("kwlPlan");
  return { title: project ? `${t("title")} · ${project.number}` : t("title") };
}

export default async function VentilationPlanPage({ params }: PageProps<"/projekte/[id]/lueftung">) {
  const { id } = await params;
  const profile = await requireProfile();
  const plan = await loadPlan(id);
  const language = localeToLanguage((await getLocale()) as Locale);

  return <PlanOverview projectId={id} initial={plan} language={language} editable={profile.role !== "viewer"} />;
}
