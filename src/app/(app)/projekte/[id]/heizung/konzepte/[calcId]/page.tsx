import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireProfile } from "@/lib/auth";

import { loadHeatCalcs, loadHeatingPlan } from "../../load-plan";
import { HeatEditor } from "./heat-editor";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/heizung/konzepte/[calcId]">): Promise<Metadata> {
  const { id, calcId } = await params;
  const calc = (await loadHeatCalcs(id)).find((c) => c.id === calcId);
  const t = await getTranslations("heatLoad");
  return { title: calc ? `${t("title")} · ${calc.name}` : t("title") };
}

export default async function HeatCalcPage({ params }: PageProps<"/projekte/[id]/heizung/konzepte/[calcId]">) {
  const { id, calcId } = await params;
  const profile = await requireProfile();
  const [calcs, plan] = await Promise.all([loadHeatCalcs(id), loadHeatingPlan(id)]);
  const calc = calcs.find((c) => c.id === calcId);
  if (!calc) notFound();
  const t = await getTranslations("heatLoad");

  return (
    <div className="space-y-4">
      <Link href={`/projekte/${id}/heizung/konzepte`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t("title")}
      </Link>
      <HeatEditor
        key={calc.id}
        id={calc.id}
        projectId={id}
        initialName={calc.name}
        initialData={calc.data}
        site={plan.site}
        catalog={plan.catalog}
        editable={profile.role !== "viewer"}
      />
    </div>
  );
}
