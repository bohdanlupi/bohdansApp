import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { localeToLanguage, type Locale } from "@/i18n/config";
import { requireProfile } from "@/lib/auth";
import { evaluateHeatLoad } from "@/lib/heating/heat-load";
import type { EmitterType } from "@/lib/heating/plan-schema";
import { generatorTypesOf } from "@/lib/heating/plant-schema";

import { loadProject } from "../load-project";
import { loadHeatCalcs, loadHeatingPlan, loadHeatingPlants, loadHeatingSystems } from "./load-plan";
import { HeatingOverview, type PlantSummary } from "./plan-overview";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/heizung">): Promise<Metadata> {
  const project = await loadProject((await params).id);
  const t = await getTranslations("heatingPlan");
  return { title: project ? `${t("title")} · ${project.number}` : t("title") };
}

/** The Heizung opens with the overview: Auslegungskriterien, derived limits, Anlagen and phase progress. */
export default async function HeatingPage({ params }: PageProps<"/projekte/[id]/heizung">) {
  const { id } = await params;
  const profile = await requireProfile();
  const [plan, plants, calcs, floorSystems] = await Promise.all([loadHeatingPlan(id), loadHeatingPlants(id), loadHeatCalcs(id), loadHeatingSystems(id)]);
  const language = localeToLanguage((await getLocale()) as Locale);

  // Anlagen of 242 and the heat load of 243, for the comparison with the manual criteria.
  const summaries: PlantSummary[] = plants.map((p) => ({
    id: p.id,
    name: p.name,
    generators: generatorTypesOf(p.data),
    emitters: [...new Set<EmitterType>([...(floorSystems.length > 0 ? ["floor" as const] : []), ...p.data.groups.flatMap((g) => (g.emitter ? [g.emitter] : []))])],
    storage: p.data.storage,
    cooling: p.data.cooling,
  }));
  const totalW = calcs.reduce((sum, c) => sum + evaluateHeatLoad(c.data, plan.site, plan.catalog).building, 0);

  return (
    <HeatingOverview
      projectId={id}
      initial={plan}
      plants={summaries}
      heatLoadKw={calcs.length > 0 && totalW > 0 ? Math.round(totalW / 100) / 10 : null}
      language={language}
      editable={profile.role !== "viewer"}
    />
  );
}
