import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireProfile } from "@/lib/auth";
import { type I18nText, pickText } from "@/lib/i18n-text";
import { createClient } from "@/lib/supabase/server";

import { loadSanitarySystems } from "../load-systems";
import { SanitaryEditor } from "./system-editor";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/sanitaer/[systemId]">): Promise<Metadata> {
  const { id, systemId } = await params;
  const system = (await loadSanitarySystems(id)).find((s) => s.id === systemId);
  const t = await getTranslations("sanitary");
  return { title: system ? `${system.name} · ${t("title")}` : t("title") };
}

export default async function SanitarySystemPage({ params }: PageProps<"/projekte/[id]/sanitaer/[systemId]">) {
  const { id, systemId } = await params;
  const profile = await requireProfile();
  const system = (await loadSanitarySystems(id)).find((s) => s.id === systemId);
  if (!system) notFound();
  const t = await getTranslations("sanitary");

  // LVs of the project with their chapters, for inserting the material list.
  const supabase = await createClient();
  const { data: lvRows } = await supabase.from("lvs").select("id, number, title, language").eq("project_id", id).order("number");
  const { data: groupRows } = lvRows?.length
    ? await supabase.from("lv_nodes").select("id, lv_id, parent_id, number, short_text, sort").in("lv_id", lvRows.map((l) => l.id)).eq("kind", "group").order("sort")
    : { data: [] };
  const lvs = (lvRows ?? []).map((lv) => ({
    id: lv.id,
    number: lv.number,
    title: lv.title,
    groups: (groupRows ?? [])
      .filter((g) => g.lv_id === lv.id)
      .map((g) => ({ id: g.id, parentId: g.parent_id, number: g.number, text: pickText(g.short_text as I18nText, lv.language).value })),
  }));

  return (
    <div className="space-y-4">
      <Link href={`/projekte/${id}/sanitaer`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t("title")}
      </Link>
      <SanitaryEditor
        key={system.id}
        id={system.id}
        projectId={id}
        initialName={system.name}
        initialData={system.data}
        schemaPlan={system.schemaPlan}
        lvs={lvs}
        editable={profile.role !== "viewer"}
      />
    </div>
  );
}
