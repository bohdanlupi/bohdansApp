import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { localeToLanguage, type Locale } from "@/i18n/config";
import { requireProfile } from "@/lib/auth";
import { findHeatingPhase } from "@/lib/heating/phases";

import { loadProject } from "../../load-project";
import { loadHeatingPlan } from "../load-plan";
import { HeatingPhaseView } from "./phase-view";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/heizung/[phase]">): Promise<Metadata> {
  const { id, phase: code } = await params;
  const [project, phase] = [await loadProject(id), findHeatingPhase(code)];
  const language = localeToLanguage((await getLocale()) as Locale);
  const t = await getTranslations("heatingPlan");
  return { title: [phase && `${phase.code} ${phase.title[language]}`, t("title"), project?.number].filter(Boolean).join(" · ") };
}

export default async function HeatingPhasePage({ params }: PageProps<"/projekte/[id]/heizung/[phase]">) {
  const { id, phase: code } = await params;
  const phase = findHeatingPhase(code);
  if (!phase) notFound();
  const profile = await requireProfile();
  const plan = await loadHeatingPlan(id);
  const language = localeToLanguage((await getLocale()) as Locale);

  return <HeatingPhaseView key={phase.code} code={phase.code} projectId={id} initial={plan} language={language} editable={profile.role !== "viewer"} />;
}
