"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { assertRole } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";
import { emptyFloorSystem, parseFloorSystem } from "@/lib/heating/floor-schema";
import { emptyHeatLoad, parseHeatLoad } from "@/lib/heating/heat-load-schema";
import { parseHeatingPlan } from "@/lib/heating/plan-schema";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

const nameSchema = z.string().trim().min(1).max(200);
const ids = z.tuple([z.uuid(), z.uuid()]);

/** Saves the Heizungsplanung of a project (design criteria, checklists, notes, site and catalogue). */
export async function saveHeatingPlan(projectId: string, data: unknown): Promise<{ error?: string }> {
  await assertRole("admin", "planer");
  if (!z.uuid().safeParse(projectId).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("heating_plans")
    .upsert({ project_id: projectId, data: parseHeatingPlan(data) as Json }, { onConflict: "project_id" });
  if (error) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId}/heizung`, "layout");
  return {};
}

export async function createHeatCalc(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin", "planer");
  const projectId = z.uuid().safeParse(formData.get("project_id"));
  const name = nameSchema.safeParse(formData.get("name"));
  if (!projectId.success || !name.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { count } = await supabase.from("heating_calcs").select("id", { count: "exact", head: true }).eq("project_id", projectId.data);
  const { data, error } = await supabase
    .from("heating_calcs")
    .insert({ project_id: projectId.data, name: name.data, sort: count ?? 0, data: emptyHeatLoad() as Json })
    .select("id")
    .single();
  if (error || !data) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId.data}/heizung`, "layout");
  redirect(`/projekte/${projectId.data}/heizung/konzepte/${data.id}`);
}

/** Saves name and inputs of a heat load calculation (results are computed, never stored). */
export async function saveHeatCalc(id: string, projectId: string, name: string, data: unknown): Promise<{ error?: string }> {
  await assertRole("admin", "planer");
  const parsedName = nameSchema.safeParse(name);
  if (!ids.safeParse([id, projectId]).success || !parsedName.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("heating_calcs")
    .update({ name: parsedName.data, data: parseHeatLoad(data) as Json })
    .eq("id", id)
    .eq("project_id", projectId);
  if (error) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId}/heizung`, "layout");
  return {};
}

export async function duplicateHeatCalc(id: string, projectId: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!ids.safeParse([id, projectId]).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { data: source } = await supabase.from("heating_calcs").select("*").eq("id", id).eq("project_id", projectId).maybeSingle();
  if (!source) return { error: "saveFailed" };
  const { count } = await supabase.from("heating_calcs").select("id", { count: "exact", head: true }).eq("project_id", projectId);
  const { data, error } = await supabase
    .from("heating_calcs")
    .insert({ project_id: projectId, name: `${source.name} (2)`.slice(0, 200), sort: count ?? 0, data: source.data })
    .select("id")
    .single();
  if (error || !data) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId}/heizung`, "layout");
  redirect(`/projekte/${projectId}/heizung/konzepte/${data.id}`);
}

export async function deleteHeatCalc(id: string, projectId: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!ids.safeParse([id, projectId]).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.from("heating_calcs").delete().eq("id", id).eq("project_id", projectId);
  if (error) return { error: "deleteFailed" };

  revalidatePath(`/projekte/${projectId}/heizung`, "layout");
  redirect(`/projekte/${projectId}/heizung/konzepte`);
}

export async function createHeatingSystem(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin", "planer");
  const projectId = z.uuid().safeParse(formData.get("project_id"));
  const name = nameSchema.safeParse(formData.get("name"));
  if (!projectId.success || !name.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { data: calcs } = await supabase.from("heating_calcs").select("id").eq("project_id", projectId.data);
  const { count } = await supabase.from("heating_systems").select("id", { count: "exact", head: true }).eq("project_id", projectId.data);
  const data = { ...emptyFloorSystem(), calcIds: (calcs ?? []).map((c) => c.id) };
  const { data: row, error } = await supabase
    .from("heating_systems")
    .insert({ project_id: projectId.data, name: name.data, sort: count ?? 0, data: data as Json })
    .select("id")
    .single();
  if (error || !row) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId.data}/heizung`, "layout");
  redirect(`/projekte/${projectId.data}/heizung/dimensionierung/${row.id}`);
}

/** Saves name and inputs of a floor heating system. */
export async function saveHeatingSystem(id: string, projectId: string, name: string, data: unknown): Promise<{ error?: string }> {
  await assertRole("admin", "planer");
  const parsedName = nameSchema.safeParse(name);
  if (!ids.safeParse([id, projectId]).success || !parsedName.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("heating_systems")
    .update({ name: parsedName.data, data: parseFloorSystem(data) as Json })
    .eq("id", id)
    .eq("project_id", projectId);
  if (error) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId}/heizung`, "layout");
  return {};
}

export async function deleteHeatingSystem(id: string, projectId: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!ids.safeParse([id, projectId]).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.from("heating_systems").delete().eq("id", id).eq("project_id", projectId);
  if (error) return { error: "deleteFailed" };

  revalidatePath(`/projekte/${projectId}/heizung`, "layout");
  redirect(`/projekte/${projectId}/heizung/dimensionierung`);
}
