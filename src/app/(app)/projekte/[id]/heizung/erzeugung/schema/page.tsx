import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requireProfile } from "@/lib/auth";

import { loadProject } from "../../../load-project";
import { ChapterFrame, ChapterPlaceholder } from "../../chapter-frame";
import { loadHeatingPlants, selectPlant } from "../../load-plan";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/heizung/erzeugung/schema">): Promise<Metadata> {
  const project = await loadProject((await params).id);
  const t = await getTranslations("heatingPlan.chapters");
  return { title: [t("schemaGeneration"), project?.number].filter(Boolean).join(" · ") };
}

/** 242 schemaGeneration: per Anlage; worked out next (placeholder). */
export default async function GenerationSchemaPage({ params, searchParams }: PageProps<"/projekte/[id]/heizung/erzeugung/schema">) {
  const { id } = await params;
  const { anlage } = await searchParams;
  const profile = await requireProfile();
  const plants = await loadHeatingPlants(id);
  const t = await getTranslations("heatingPlan");

  return (
    <ChapterFrame chapter="242" title={t("chapters.schemaGeneration")} projectId={id} plants={plants} plant={selectPlant(plants, anlage)} editable={profile.role !== "viewer"}>
      <ChapterPlaceholder text={t("placeholder.schemaGeneration")} />
    </ChapterFrame>
  );
}
