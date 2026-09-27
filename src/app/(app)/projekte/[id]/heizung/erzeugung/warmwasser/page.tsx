import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requireProfile } from "@/lib/auth";

import { loadProject } from "../../../load-project";
import { ChapterFrame, ChapterPlaceholder } from "../../chapter-frame";
import { loadHeatingPlants, selectPlant } from "../../load-plan";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/heizung/erzeugung/warmwasser">): Promise<Metadata> {
  const project = await loadProject((await params).id);
  const t = await getTranslations("heatingPlan.chapters");
  return { title: [t("hotWater"), project?.number].filter(Boolean).join(" · ") };
}

/** 242 hotWater: per Anlage; worked out next (placeholder). */
export default async function HotWaterPage({ params, searchParams }: PageProps<"/projekte/[id]/heizung/erzeugung/warmwasser">) {
  const { id } = await params;
  const { anlage } = await searchParams;
  const profile = await requireProfile();
  const plants = await loadHeatingPlants(id);
  const t = await getTranslations("heatingPlan");

  return (
    <ChapterFrame chapter="242" title={t("chapters.hotWater")} projectId={id} plants={plants} plant={selectPlant(plants, anlage)} editable={profile.role !== "viewer"}>
      <ChapterPlaceholder text={t("placeholder.hotWater")} />
    </ChapterFrame>
  );
}
