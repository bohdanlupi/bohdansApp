import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";

import { requireProfile } from "@/lib/auth";
import { parseKwlData } from "@/lib/kwl/schema";
import { createClient } from "@/lib/supabase/server";

import { loadPlan } from "../../load-plan";
import { KwlEditor } from "./kwl-editor";

const loadCalc = cache(async (projectId: string, calcId: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(calcId)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("ventilation_calcs").select("*").eq("id", calcId).eq("project_id", projectId).maybeSingle();
  return data;
});

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/lueftung/wohnungen/[calcId]">): Promise<Metadata> {
  const { id, calcId } = await params;
  const calc = await loadCalc(id, calcId);
  const t = await getTranslations("kwl");
  return { title: calc ? `${t("title")} · ${calc.name}` : t("title") };
}

export default async function KwlCalcPage({ params }: PageProps<"/projekte/[id]/lueftung/wohnungen/[calcId]">) {
  const { id, calcId } = await params;
  const profile = await requireProfile();
  const calc = await loadCalc(id, calcId);
  if (!calc) notFound();
  const plan = await loadPlan(id);
  const t = await getTranslations("kwl");

  return (
    <div className="space-y-4">
      <Link href={`/projekte/${id}/lueftung/wohnungen`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t("title")}
      </Link>
      <KwlEditor
        key={calc.id}
        id={calc.id}
        projectId={id}
        initialName={calc.name}
        initialData={parseKwlData(calc.data)}
        planParams={plan.params}
        editable={profile.role !== "viewer"}
      />
    </div>
  );
}
