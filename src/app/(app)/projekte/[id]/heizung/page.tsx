import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { localeToLanguage, type Locale } from "@/i18n/config";
import { requireProfile } from "@/lib/auth";

import { loadProject } from "../load-project";
import { loadHeatingPlan } from "./load-plan";
import { HeatingOverview } from "./plan-overview";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/heizung">): Promise<Metadata> {
  const project = await loadProject((await params).id);
  const t = await getTranslations("heatingPlan");
  return { title: project ? `${t("title")} · ${project.number}` : t("title") };
}

export default async function HeatingPlanPage({ params }: PageProps<"/projekte/[id]/heizung">) {
  const { id } = await params;
  const profile = await requireProfile();
  const plan = await loadHeatingPlan(id);
  const language = localeToLanguage((await getLocale()) as Locale);

  return <HeatingOverview projectId={id} initial={plan} language={language} editable={profile.role !== "viewer"} />;
}
