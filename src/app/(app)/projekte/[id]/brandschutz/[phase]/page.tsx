import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { localeToLanguage, type Locale } from "@/i18n/config";
import { requireProfile } from "@/lib/auth";
import { findFirePhase } from "@/lib/fire/phases";

import { loadProject } from "../../load-project";
import { loadFirePlans } from "../load-plan";
import { FirePhaseView } from "./phase-view";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/brandschutz/[phase]">): Promise<Metadata> {
  const { id, phase: code } = await params;
  const [project, phase] = [await loadProject(id), findFirePhase(code)];
  const language = localeToLanguage((await getLocale()) as Locale);
  const t = await getTranslations("firePlan");
  return { title: [phase && `${phase.code} ${phase.title[language]}`, t("title"), project?.number].filter(Boolean).join(" · ") };
}

export default async function FirePhasePage({ params }: PageProps<"/projekte/[id]/brandschutz/[phase]">) {
  const { id, phase: code } = await params;
  const phase = findFirePhase(code);
  if (!phase) notFound();
  const profile = await requireProfile();
  const plans = await loadFirePlans(id);
  const language = localeToLanguage((await getLocale()) as Locale);

  return <FirePhaseView key={phase.code} code={phase.code} projectId={id} initial={plans} language={language} editable={profile.role !== "viewer"} />;
}
