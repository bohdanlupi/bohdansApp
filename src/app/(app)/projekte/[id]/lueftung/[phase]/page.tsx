import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { localeToLanguage, type Locale } from "@/i18n/config";
import { requireProfile } from "@/lib/auth";
import { findPhase } from "@/lib/kwl/phases";
import { createClient } from "@/lib/supabase/server";

import { loadProject } from "../../load-project";
import { loadCalcs, loadPlan } from "../load-plan";
import { PhaseView } from "./phase-view";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/lueftung/[phase]">): Promise<Metadata> {
  const { id, phase: code } = await params;
  const [project, phase] = [await loadProject(id), findPhase(code)];
  const language = localeToLanguage((await getLocale()) as Locale);
  const t = await getTranslations("kwlPlan");
  return { title: [phase && `${phase.code} ${phase.title[language]}`, t("title"), project?.number].filter(Boolean).join(" · ") };
}

export default async function PhasePage({ params }: PageProps<"/projekte/[id]/lueftung/[phase]">) {
  const { id, phase: code } = await params;
  const phase = findPhase(code);
  if (!phase) notFound();
  const profile = await requireProfile();
  const [plan, calcs] = await Promise.all([loadPlan(id), loadCalcs(id)]);
  const language = localeToLanguage((await getLocale()) as Locale);

  let lvs: { id: string; number: string; title: string; position_count: number | null; estimate_total: number | null }[] = [];
  if (phase.code === "41") {
    const supabase = await createClient();
    const { data } = await supabase.from("lv_list").select("id, number, title, position_count, estimate_total").eq("project_id", id).order("number");
    lvs = (data ?? []).filter((lv): lv is typeof lv & { id: string; number: string; title: string } => Boolean(lv.id && lv.number && lv.title));
  }

  return (
    <PhaseView
      key={phase.code}
      code={phase.code}
      projectId={id}
      initial={plan}
      calcs={calcs.map(({ id, name, data }) => ({ id, name, data }))}
      lvs={lvs}
      language={language}
      editable={profile.role !== "viewer"}
    />
  );
}
