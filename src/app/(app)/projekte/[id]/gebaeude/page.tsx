import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requireProfile } from "@/lib/auth";

import { loadProject } from "../load-project";
import { FloorsView } from "./floors-view";
import { loadBuildingModel, loadBuildingPlans } from "./load-model";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/gebaeude">): Promise<Metadata> {
  const project = await loadProject((await params).id);
  const t = await getTranslations("building");
  return { title: project ? `${t("title")} · ${project.number}` : t("title") };
}

export default async function BuildingPage({ params }: PageProps<"/projekte/[id]/gebaeude">) {
  const { id } = await params;
  const profile = await requireProfile();
  const t = await getTranslations("building");
  const [model, plans] = await Promise.all([loadBuildingModel(id), loadBuildingPlans(id)]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <FloorsView projectId={id} initial={model} plans={plans} editable={profile.role !== "viewer"} />
    </div>
  );
}
