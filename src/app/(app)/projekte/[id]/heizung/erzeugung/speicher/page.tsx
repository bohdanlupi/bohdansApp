import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requireProfile } from "@/lib/auth";

import { loadProject } from "../../../load-project";
import { ChapterFrame, ChapterPlaceholder } from "../../chapter-frame";
import { loadHeatingPlants, selectPlant } from "../../load-plan";
import { StorageToggle } from "./storage-toggle";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/heizung/erzeugung/speicher">): Promise<Metadata> {
  const project = await loadProject((await params).id);
  const t = await getTranslations("heatingPlan.chapters");
  return { title: [t("storage"), project?.number].filter(Boolean).join(" · ") };
}

/** 242 Energiespeicher: per Anlage; for now only whether a storage exists (checklists), the sizing follows. */
export default async function StoragePage({ params, searchParams }: PageProps<"/projekte/[id]/heizung/erzeugung/speicher">) {
  const { id } = await params;
  const { anlage } = await searchParams;
  const profile = await requireProfile();
  const plants = await loadHeatingPlants(id);
  const plant = selectPlant(plants, anlage);
  const t = await getTranslations("heatingPlan");
  const editable = profile.role !== "viewer";

  return (
    <ChapterFrame chapter="242" title={t("chapters.storage")} projectId={id} plants={plants} plant={plant} editable={editable}>
      {plant && <StorageToggle key={plant.id} projectId={id} plant={plant} editable={editable} />}
      <ChapterPlaceholder text={t("placeholder.storage")} />
    </ChapterFrame>
  );
}
