import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requireProfile } from "@/lib/auth";
import { parseDistribution } from "@/lib/heating/distribution-schema";
import { parseSchemaPlan } from "@/lib/kwl/schema-plan";
import { createClient } from "@/lib/supabase/server";

import { loadProject } from "../../../load-project";
import { ChapterFrame } from "../../chapter-frame";
import { loadHeatingPlants, loadLvChapters, selectPlant } from "../../load-plan";
import { DistributionEditor } from "./distribution-editor";
import { loadDistributionInputs } from "./load-inputs";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/heizung/verteilung/schema">): Promise<Metadata> {
  const project = await loadProject((await params).id);
  const t = await getTranslations("heatingPlan.chapters");
  return { title: [t("schemaDistribution"), project?.number].filter(Boolean).join(" · ") };
}

/**
 * 243 Prinzipschema Wärmeverteilung (Strangschema) per Anlage: the pipes from its Heizgruppen to the Heizkörper (rooms
 * of the Wärmebedarf) and the Fussbodenheizungs-Verteiler, with pressure drop and Rohrauskühlung.
 */
export default async function DistributionSchemaPage({ params, searchParams }: PageProps<"/projekte/[id]/heizung/verteilung/schema">) {
  const { id } = await params;
  const { anlage } = await searchParams;
  const profile = await requireProfile();
  const plants = await loadHeatingPlants(id);
  const plant = selectPlant(plants, anlage);
  const t = await getTranslations("heatingPlan");
  const editable = profile.role !== "viewer";

  // Strangschema of the Anlage (own query, so the other chapters do not depend on these columns).
  const supabase = await createClient();
  const [{ data: row }, inputs, lvs] = plant
    ? await Promise.all([supabase.from("heating_plants").select("distribution, distribution_plan").eq("id", plant.id).maybeSingle(), loadDistributionInputs(id, plant), loadLvChapters(id)])
    : [{ data: null }, null, []];

  return (
    <ChapterFrame chapter="243" title={t("chapters.schemaDistribution")} projectId={id} plants={plants} plant={plant} editable={editable}>
      {plant && inputs && (
        <DistributionEditor
          key={plant.id}
          projectId={id}
          plant={{ id: plant.id, name: plant.name, groups: plant.data.groups }}
          initialData={parseDistribution(row?.distribution)}
          schemaPlan={parseSchemaPlan(row?.distribution_plan)}
          rooms={inputs.rooms}
          floors={inputs.floors}
          radiators={inputs.radiators}
          outsideTemp={inputs.outsideTemp}
          lvs={lvs}
          editable={editable}
        />
      )}
    </ChapterFrame>
  );
}
