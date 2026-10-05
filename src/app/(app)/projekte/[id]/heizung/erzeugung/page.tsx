import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requireProfile } from "@/lib/auth";
import { evaluateHeatLoad } from "@/lib/heating/heat-load";
import { type I18nText, pickText } from "@/lib/i18n-text";
import { createClient } from "@/lib/supabase/server";

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

  // LVs of the project with their chapters, for inserting the Materialauszug.
  const supabase = await createClient();
  const { data: lvRows } = await supabase.from("lvs").select("id, number, title, language").eq("project_id", id).order("number");
  const { data: groupRows } = lvRows?.length
    ? await supabase.from("lv_nodes").select("id, lv_id, parent_id, number, short_text, sort").in("lv_id", lvRows.map((l) => l.id)).eq("kind", "group").order("sort")
    : { data: [] };
  const lvs = (lvRows ?? []).map((lv) => ({
    id: lv.id,
    number: lv.number,
    title: lv.title,
    groups: (groupRows ?? [])
      .filter((g) => g.lv_id === lv.id)
      .map((g) => ({ id: g.id, parentId: g.parent_id, number: g.number, text: pickText(g.short_text as I18nText, lv.language).value })),
  }));

  return (
    <ChapterFrame chapter="242" title={t("chapters.generationTitle")} projectId={id} plants={plants} plant={plant} editable={editable}>
      {plant && <GenerationEditor key={plant.id} projectId={id} initialPlan={plan} plant={plant} power={load > 0 ? load / 1000 : null} lvs={lvs} editable={editable} />}
    </ChapterFrame>
  );
}
