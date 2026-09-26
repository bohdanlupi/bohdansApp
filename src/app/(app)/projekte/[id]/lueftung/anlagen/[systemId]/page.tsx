import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { loadCalcs, loadPlan, loadSystems } from "../../load-plan";
import { SystemEditor } from "./system-editor";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/lueftung/anlagen/[systemId]">): Promise<Metadata> {
  const { id, systemId } = await params;
  const system = (await loadSystems(id)).find((s) => s.id === systemId);
  const t = await getTranslations("kwlSystem");
  return { title: system ? `${system.name} · ${t("title")}` : t("title") };
}

export default async function SystemPage({ params }: PageProps<"/projekte/[id]/lueftung/anlagen/[systemId]">) {
  const { id, systemId } = await params;
  const profile = await requireProfile();
  const [systems, calcs, plan] = await Promise.all([loadSystems(id), loadCalcs(id), loadPlan(id)]);
  const system = systems.find((s) => s.id === systemId);
  if (!system) notFound();
  const t = await getTranslations("kwlSystem");

  const supabase = await createClient();
  const { data: lvs } = await supabase.from("lvs").select("id, number, title").eq("project_id", id).order("number");

  return (
    <div className="space-y-4">
      <Link href={`/projekte/${id}/lueftung/anlagen`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t("title")}
      </Link>
      <SystemEditor
        key={system.id}
        id={system.id}
        projectId={id}
        initialName={system.name}
        initialData={system.data}
        calcs={calcs.map((c) => ({ id: c.id, name: c.name, data: c.data }))}
        lvs={lvs ?? []}
        planParams={plan.params}
        editable={profile.role !== "viewer"}
      />
    </div>
  );
}
