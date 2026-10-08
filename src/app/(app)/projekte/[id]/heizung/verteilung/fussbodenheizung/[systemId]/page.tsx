import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireProfile } from "@/lib/auth";

import { loadHeatingPlants, loadHeatingSystems } from "../../../load-plan";
import { loadCalcRooms } from "../load-rooms";
import { FloorEditor } from "./floor-editor";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/heizung/verteilung/fussbodenheizung/[systemId]">): Promise<Metadata> {
  const { id, systemId } = await params;
  const system = (await loadHeatingSystems(id)).find((s) => s.id === systemId);
  const t = await getTranslations("floorHeating");
  return { title: system ? `${t("title")} · ${system.name}` : t("title") };
}

export default async function FloorSystemPage({ params }: PageProps<"/projekte/[id]/heizung/verteilung/fussbodenheizung/[systemId]">) {
  const { id, systemId } = await params;
  const profile = await requireProfile();
  const [systems, plants, { calcRooms }] = await Promise.all([loadHeatingSystems(id), loadHeatingPlants(id), loadCalcRooms(id)]);
  const system = systems.find((s) => s.id === systemId);
  if (!system) notFound();
  const t = await getTranslations("floorHeating");
  const tGroup = await getTranslations("heatingPlan.generation.schema");

  return (
    <div className="space-y-4">
      <Link href={`/projekte/${id}/heizung/verteilung/fussbodenheizung${system.data.plantId ? `?anlage=${system.data.plantId}` : ""}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t("title")}
      </Link>
      <FloorEditor key={system.id} id={system.id} projectId={id} initialName={system.name} initialData={system.data} calcs={calcRooms} plants={plants.map((p) => ({ id: p.id, name: p.name, groups: p.data.groups.map((g, i) => ({ id: g.id, name: g.name || `${tGroup("group")} ${i + 1}` })) }))} editable={profile.role !== "viewer"} />
    </div>
  );
}
