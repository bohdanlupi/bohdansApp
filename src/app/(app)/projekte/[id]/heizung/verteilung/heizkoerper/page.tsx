import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requireProfile } from "@/lib/auth";
import { parseRadiatorPlan } from "@/lib/heating/radiator-schema";
import { createClient } from "@/lib/supabase/server";

import { loadProject } from "../../../load-project";
import { ChapterFrame } from "../../chapter-frame";
import { loadHeatingPlants, selectPlant } from "../../load-plan";
import { loadDistributionInputs } from "../schema/load-inputs";
import { RadiatorEditor } from "./radiator-editor";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/heizung/verteilung/heizkoerper">): Promise<Metadata> {
  const project = await loadProject((await params).id);
  const t = await getTranslations("heatingPlan.chapters");
  return { title: [t("radiators"), project?.number].filter(Boolean).join(" · ") };
}

/**
 * 243 Heizkörper per Anlage: per Heizgruppe the rooms of the Wärmebedarf with their Zehnder Heizkörper, sized for the
 * group temperatures, with Anschluss and Oventrop armatures; the Strangschema links them.
 */
export default async function RadiatorsPage({ params, searchParams }: PageProps<"/projekte/[id]/heizung/verteilung/heizkoerper">) {
  const { id } = await params;
  const { anlage } = await searchParams;
  const profile = await requireProfile();
  const plants = await loadHeatingPlants(id);
  const plant = selectPlant(plants, anlage);
  const t = await getTranslations("heatingPlan");
  const tGroup = await getTranslations("heatingPlan.generation.schema");
  const editable = profile.role !== "viewer";

  // Own query, so the other chapters do not depend on this column.
  const supabase = await createClient();
  const [{ data: row }, inputs] = plant
    ? await Promise.all([supabase.from("heating_plants").select("radiators").eq("id", plant.id).maybeSingle(), loadDistributionInputs(id, plant)])
    : [{ data: null }, null];

  return (
    <ChapterFrame chapter="243" title={t("chapters.radiators")} projectId={id} plants={plants} plant={plant} editable={editable}>
      {plant && inputs && (
        <RadiatorEditor
          key={plant.id}
          projectId={id}
          plant={{
            id: plant.id,
            name: plant.name,
            groups: plant.data.groups.map((g, i) => ({ id: g.id, name: g.name || `${tGroup("group")} ${i + 1}`, supplyTemp: g.supplyTemp, returnTemp: g.returnTemp, emitter: g.emitter })),
          }}
          initialData={parseRadiatorPlan(row?.radiators)}
          calcs={inputs.rooms}
          editable={editable}
        />
      )}
    </ChapterFrame>
  );
}
