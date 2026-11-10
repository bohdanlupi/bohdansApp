import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { localeToLanguage, type Locale } from "@/i18n/config";
import { requireProfile } from "@/lib/auth";
import { findSanitaryPhase } from "@/lib/sanitary/phases";

import { loadProject } from "../../load-project";
import { loadSanitaryPlan } from "../load-plan";
import { SanitaryPhaseView } from "./phase-view";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/sanitaer/[phase]">): Promise<Metadata> {
  const { id, phase: code } = await params;
  const [project, phase] = [await loadProject(id), findSanitaryPhase(code)];
  const language = localeToLanguage((await getLocale()) as Locale);
  const t = await getTranslations("sanitaryPlan");
  return { title: [phase && `${phase.code} ${phase.title[language]}`, t("title"), project?.number].filter(Boolean).join(" · ") };
}

export default async function SanitaryPhasePage({ params }: PageProps<"/projekte/[id]/sanitaer/[phase]">) {
  const { id, phase: code } = await params;
  const phase = findSanitaryPhase(code);
  if (!phase) notFound();
  const profile = await requireProfile();
  const plan = await loadSanitaryPlan(id);
  const language = localeToLanguage((await getLocale()) as Locale);

  return <SanitaryPhaseView key={phase.code} code={phase.code} projectId={id} initial={plan} language={language} editable={profile.role !== "viewer"} />;
}
