import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireProfile } from "@/lib/auth";
import { modelRoomInfos, syncLinkedRooms } from "@/lib/building/heat-link";
import { allRoomMetrics } from "@/lib/building/model";

import { loadBuildingModel, loadBuildingPlans } from "../../../../gebaeude/load-model";
import { loadHeatCalcs, loadHeatingPlan } from "../../../load-plan";
import { HeatEditor } from "./heat-editor";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/heizung/verteilung/waermebedarf/[calcId]">): Promise<Metadata> {
  const { id, calcId } = await params;
  const calc = (await loadHeatCalcs(id)).find((c) => c.id === calcId);
  const t = await getTranslations("heatLoad");
  return { title: calc ? `${t("title")} · ${calc.name}` : t("title") };
}

export default async function HeatCalcPage({ params }: PageProps<"/projekte/[id]/heizung/verteilung/waermebedarf/[calcId]">) {
  const { id, calcId } = await params;
  const profile = await requireProfile();
  const [calcs, plan, model, plans] = await Promise.all([loadHeatCalcs(id), loadHeatingPlan(id), loadBuildingModel(id), loadBuildingPlans(id)]);
  const calc = calcs.find((c) => c.id === calcId);
  if (!calc) notFound();
  const t = await getTranslations("heatLoad");
  // Rooms taken from the Gebäudemodell follow it (geometry wins); the editor starts dirty when something changed.
  const modelRooms = modelRoomInfos(allRoomMetrics(model, plans));
  const synced = syncLinkedRooms(calc.data, modelRooms);

  return (
    <div className="space-y-4">
      <Link href={`/projekte/${id}/heizung/verteilung/waermebedarf`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t("title")}
      </Link>
      <HeatEditor
        key={calc.id}
        id={calc.id}
        projectId={id}
        initialName={calc.name}
        initialData={synced.data}
        savedData={synced.changed ? calc.data : undefined}
        modelRooms={modelRooms}
        site={plan.site}
        catalog={plan.catalog}
        editable={profile.role !== "viewer"}
      />
    </div>
  );
}
