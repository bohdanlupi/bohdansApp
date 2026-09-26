import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TreeEditor, type EditorNode } from "@/components/tree-editor/tree-editor";
import { requireProfile } from "@/lib/auth";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

import { loadCostOptions } from "../../cost-options";
import { loadProject } from "../../load-project";
import { loadLv } from "./load-lv";
import { VentilationStructureButton } from "./ventilation-structure";

export async function generateMetadata({ params }: PageProps<"/projekte/[id]/lv/[lvId]">): Promise<Metadata> {
  const { id, lvId } = await params;
  const lv = await loadLv(id, lvId);
  return { title: lv ? `LV ${lv.number} ${lv.title}` : undefined };
}

export default async function LvEditorPage({ params }: PageProps<"/projekte/[id]/lv/[lvId]">) {
  const { id, lvId } = await params;
  const profile = await requireProfile();
  const lv = await loadLv(id, lvId);
  if (!lv) notFound();

  const project = await loadProject(id);
  const costOptions = await loadCostOptions(project?.cost_plan_template_id ?? null, lv.language ?? "de");
  const supabase = await createClient();
  const [{ data: nodes }, { data: measurements }, { data: catalogs }, { data: systems }] = await Promise.all([
    fetchAll((from, to) => supabase.from("lv_nodes").select("*").eq("lv_id", lvId).order("id").range(from, to)).then((data) => ({ data })),
    fetchAll((from, to) => supabase.from("lv_measurements").select("*, lv_nodes!inner(lv_id)").eq("lv_nodes.lv_id", lvId).order("id").range(from, to)).then((data) => ({ data })),
    supabase.from("catalogs").select("id, name").eq("active", true).order("source", { ascending: false }).order("name"),
    supabase.from("ventilation_systems").select("id, name").eq("project_id", id).order("sort").order("created_at"),
  ]);

  return (
    <TreeEditor
      key={lvId}
      scope={{ type: "lv", id: lvId }}
      // jsonb columns (texts, discounts) come back as Json.
      nodes={(nodes ?? []) as unknown as EditorNode[]}
      measurements={measurements ?? []}
      language={lv.language ?? "de"}
      editable={profile.role !== "viewer"}
      catalogs={catalogs ?? []}
      costOptions={costOptions}
      toolbarExtra={<VentilationStructureButton key="ventilation-structure" lvId={lvId} projectId={id} language={lv.language ?? "de"} systems={systems ?? []} />}
    />
  );
}
