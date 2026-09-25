"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { assertRole } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";
import { parsePlanData } from "@/lib/kwl/plan-schema";
import { emptyKwlData, parseKwlData } from "@/lib/kwl/schema";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

const nameSchema = z.string().trim().min(1).max(200);

export async function createKwlCalc(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin", "planer");
  const projectId = z.uuid().safeParse(formData.get("project_id"));
  const name = nameSchema.safeParse(formData.get("name"));
  if (!projectId.success || !name.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { count } = await supabase.from("ventilation_calcs").select("id", { count: "exact", head: true }).eq("project_id", projectId.data);
  const { data, error } = await supabase
    .from("ventilation_calcs")
    .insert({ project_id: projectId.data, name: name.data, sort: count ?? 0, data: emptyKwlData() as Json })
    .select("id")
    .single();
  if (error || !data) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId.data}/lueftung`, "layout");
  redirect(`/projekte/${projectId.data}/lueftung/wohnungen/${data.id}`);
}

/** Saves name and input data of a calculation (results are computed, never stored). */
export async function saveKwlCalc(id: string, projectId: string, name: string, data: unknown): Promise<{ error?: string }> {
  await assertRole("admin", "planer");
  const ids = z.tuple([z.uuid(), z.uuid()]).safeParse([id, projectId]);
  const parsedName = nameSchema.safeParse(name);
  if (!ids.success || !parsedName.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("ventilation_calcs")
    .update({ name: parsedName.data, data: parseKwlData(data) as Json })
    .eq("id", id)
    .eq("project_id", projectId);
  if (error) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId}/lueftung`, "layout");
  return {};
}

/** Copy of a calculation (e.g. for the next dwelling of the same type). */
export async function duplicateKwlCalc(id: string, projectId: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!z.tuple([z.uuid(), z.uuid()]).safeParse([id, projectId]).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { data: source } = await supabase.from("ventilation_calcs").select("*").eq("id", id).eq("project_id", projectId).maybeSingle();
  if (!source) return { error: "saveFailed" };
  const { count } = await supabase.from("ventilation_calcs").select("id", { count: "exact", head: true }).eq("project_id", projectId);
  const { data, error } = await supabase
    .from("ventilation_calcs")
    .insert({ project_id: projectId, name: `${source.name} (2)`.slice(0, 200), sort: count ?? 0, data: source.data })
    .select("id")
    .single();
  if (error || !data) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId}/lueftung`, "layout");
  redirect(`/projekte/${projectId}/lueftung/wohnungen/${data.id}`);
}

export async function deleteKwlCalc(id: string, projectId: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!z.tuple([z.uuid(), z.uuid()]).safeParse([id, projectId]).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.from("ventilation_calcs").delete().eq("id", id).eq("project_id", projectId);
  if (error) return { error: "deleteFailed" };

  revalidatePath(`/projekte/${projectId}/lueftung`, "layout");
  redirect(`/projekte/${projectId}/lueftung/wohnungen`);
}

/** Saves the KWL-Planung of a project (design criteria, checklists, phase inputs, measurements). */
export async function savePlan(projectId: string, data: unknown): Promise<{ error?: string }> {
  await assertRole("admin", "planer");
  if (!z.uuid().safeParse(projectId).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("ventilation_plans")
    .upsert({ project_id: projectId, data: parsePlanData(data) as Json }, { onConflict: "project_id" });
  if (error) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId}/lueftung`, "layout");
  return {};
}
