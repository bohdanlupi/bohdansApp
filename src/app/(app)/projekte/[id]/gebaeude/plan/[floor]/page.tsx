import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Notice } from "@/components/planning/fields";
import { requireProfile } from "@/lib/auth";

import { loadHeatingPlan } from "../../../heizung/load-plan";
import { loadBuildingModel, loadBuildingPlans, snapshotUrl } from "../../load-model";
import { PlanEditor } from "./plan-editor";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/gebaeude/plan/[floor]">): Promise<Metadata> {
  const { id, floor } = await params;
  const model = await loadBuildingModel(id);
  const t = await getTranslations("building");
  const f = model.floors.find((x) => x.key === floor);
  return { title: f ? `${t("editor.title")} · ${f.name}` : t("editor.title") };
}

export default async function PlanEditorPage({ params }: PageProps<"/projekte/[id]/gebaeude/plan/[floor]">) {
  const { id, floor } = await params;
  const profile = await requireProfile();
  const [model, plans, heatingPlan] = await Promise.all([loadBuildingModel(id), loadBuildingPlans(id), loadHeatingPlan(id)]);
  const current = model.floors.find((f) => f.key === floor);
  if (!current) notFound();
  const plan = plans.find((p) => p.floor === floor) ?? null;
  const url = plan ? await snapshotUrl(id, plan.id) : null;
  const t = await getTranslations("building");

  return (
    <div className="space-y-3">
      <Link href={`/projekte/${id}/gebaeude`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t("title")}
      </Link>
      {!plan || !url ? (
        <Notice>{t("editor.noPlan", { floor: current.name })}</Notice>
      ) : (
        <PlanEditor key={plan.id} projectId={id} floorKey={floor} initial={model} plan={plan} imageUrl={url} catalog={heatingPlan.catalog} editable={profile.role !== "viewer"} />
      )}
    </div>
  );
}
