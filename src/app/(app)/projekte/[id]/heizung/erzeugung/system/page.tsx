import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requireProfile } from "@/lib/auth";
import { evaluateHeatLoad } from "@/lib/heating/heat-load";

import { loadProject } from "../../../load-project";
import { ChapterFrame } from "../../chapter-frame";
import { loadHeatCalcs, loadHeatingPlan, loadHeatingPlants, selectPlant } from "../../load-plan";
import { SystemEditor } from "./system-editor";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/heizung/erzeugung/system">): Promise<Metadata> {
  const project = await loadProject((await params).id);
  const t = await getTranslations("heatingPlan.chapters");
  return { title: [t("system"), project?.number].filter(Boolean).join(" · ") };
}

/** 242 System: building data (checklists) and the heat generators of the chosen Anlage. */
export default async function SystemPage({ params, searchParams }: PageProps<"/projekte/[id]/heizung/erzeugung/system">) {
  const { id } = await params;
  const { anlage } = await searchParams;
  const profile = await requireProfile();
  const [plan, plants, calcs] = await Promise.all([loadHeatingPlan(id), loadHeatingPlants(id), loadHeatCalcs(id)]);
  const plant = selectPlant(plants, anlage);
  const load = calcs.reduce((s, c) => s + evaluateHeatLoad(c.data, plan.site, plan.catalog).building, 0);
  const t = await getTranslations("heatingPlan");
  const editable = profile.role !== "viewer";

  return (
    <ChapterFrame chapter="242" title={t("chapters.system")} projectId={id} plants={plants} plant={plant} editable={editable}>
      {plant && <SystemEditor key={plant.id} projectId={id} initialPlan={plan} plant={plant} power={load > 0 ? load / 1000 : null} editable={editable} />}
    </ChapterFrame>
  );
}
