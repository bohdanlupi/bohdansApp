import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { localeToLanguage, type Locale } from "@/i18n/config";
import { requireProfile } from "@/lib/auth";
import type { SanNode } from "@/lib/sanitary/network";

import { loadProject } from "../load-project";
import { loadSanitaryPlan } from "./load-plan";
import { loadSanitarySystems } from "./load-systems";
import { PlanOverview } from "./plan-overview";

/** Warmhaltung of an Anlage: Rohr an Rohr if any pipe uses it, else Zirkulation if any, else none. */
function circulationOf(nodes: SanNode[]): "none" | "conventional" | "rar" {
  let found: "none" | "conventional" | "rar" = "none";
  const walk = (list: SanNode[]) => {
    for (const n of list) {
      if (n.type === "pipe" && n.circulation === "rar") found = "rar";
      else if (n.type === "pipe" && n.circulation === "conventional" && found === "none") found = "conventional";
      walk(n.children);
    }
  };
  walk(nodes);
  return found;
}

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/sanitaer">): Promise<Metadata> {
  const project = await loadProject((await params).id);
  const t = await getTranslations("sanitaryPlan");
  return { title: project ? `${t("title")} · ${project.number}` : t("title") };
}

export default async function SanitaryPlanPage({ params }: PageProps<"/projekte/[id]/sanitaer">) {
  const { id } = await params;
  const profile = await requireProfile();
  const [plan, systems] = await Promise.all([loadSanitaryPlan(id), loadSanitarySystems(id)]);
  const language = localeToLanguage((await getLocale()) as Locale);

  return (
    <PlanOverview
      projectId={id}
      initial={plan}
      systems={systems.map((s) => ({ id: s.id, name: s.name, circulation: circulationOf(s.data.network) }))}
      language={language}
      editable={profile.role !== "viewer"}
    />
  );
}
