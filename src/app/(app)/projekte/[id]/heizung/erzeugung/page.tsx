import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requireProfile } from "@/lib/auth";
import { evaluateHeatLoad } from "@/lib/heating/heat-load";

import { loadProject } from "../../load-project";
import { ChapterFrame } from "../chapter-frame";
import { loadHeatCalcs, loadHeatingPlan, loadHeatingPlants, selectPlant } from "../load-plan";
import { GenerationEditor } from "./generation-editor";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/heizung/erzeugung">): Promise<Metadata> {
  const project = await loadProject((await params).id);
  const t = await getTranslations("heatingPlan.chapters");
  return { title: [t("generation"), project?.number].filter(Boolean).join(" · ") };
}

/**
 * 242 Wärmeerzeugung: building data (checklists) and, per Anlage, the four sectors Wärmequelle, Warmwasser,
 * Energiespeicher, Verteiler with the Heizgruppen, drawn as Prinzipschema below.
 */
export default async function GenerationPage({ params, searchParams }: PageProps<"/projekte/[id]/heizung/erzeugung">) {
  const { id } = await params;
  const { anlage } = await searchParams;
  const profile = await requireProfile();
  const [plan, plants, calcs] = await Promise.all([loadHeatingPlan(id), loadHeatingPlants(id), loadHeatCalcs(id)]);
  const plant = selectPlant(plants, anlage);
  const load = calcs.reduce((s, c) => s + evaluateHeatLoad(c.data, plan.site, plan.catalog).building, 0);
  const t = await getTranslations("heatingPlan");
  const editable = profile.role !== "viewer";

  return (
    <ChapterFrame chapter="242" title={t("chapters.generationTitle")} projectId={id} plants={plants} plant={plant} editable={editable}>
      {plant && <GenerationEditor key={plant.id} projectId={id} initialPlan={plan} plant={plant} power={load > 0 ? load / 1000 : null} editable={editable} />}
    </ChapterFrame>
  );
}
