"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { assertRole } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";
import { emptyFloorSystem, parseFloorSystem } from "@/lib/heating/floor-schema";
import { emptyHeatLoad, parseHeatLoad } from "@/lib/heating/heat-load-schema";
import { parseHeatingPlan } from "@/lib/heating/plan-schema";
import { emptyPlant, parsePlant } from "@/lib/heating/plant-schema";
import { initialsOf, nextRevisionIndex, parseSchemaPlan } from "@/lib/kwl/schema-plan";
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

// ---------------------------------------------------------------------------
// Wärmeerzeugungsanlagen (242)
// ---------------------------------------------------------------------------

/** Creates an Anlage and opens its Wärmeerzeugung page. */
export async function createHeatingPlant(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin", "planer");
  const projectId = z.uuid().safeParse(formData.get("project_id"));
  const name = nameSchema.safeParse(formData.get("name"));
  if (!projectId.success || !name.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { count } = await supabase.from("heating_plants").select("id", { count: "exact", head: true }).eq("project_id", projectId.data);
  // The first Anlage takes over what was chosen on the former overview page (generators, storage, cooling).
  let initial = emptyPlant();
  if (!count) {
    const { data: plan } = await supabase.from("heating_plans").select("data").eq("project_id", projectId.data).maybeSingle();
    const { generators, storage, cooling } = parseHeatingPlan(plan?.data).params;
    initial = parsePlant({ generators, storage, cooling });
  }
  const { data, error } = await supabase
    .from("heating_plants")
    .insert({ project_id: projectId.data, name: name.data, sort: count ?? 0, data: initial as Json })
    .select("id")
    .single();
  if (error || !data) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId.data}/heizung`, "layout");
  redirect(`/projekte/${projectId.data}/heizung/erzeugung?anlage=${data.id}`);
}

/** Saves name and inputs of an Anlage. */
export async function saveHeatingPlant(id: string, projectId: string, name: string, data: unknown): Promise<{ error?: string }> {
  await assertRole("admin", "planer");
  const parsedName = nameSchema.safeParse(name);
  if (!ids.safeParse([id, projectId]).success || !parsedName.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("heating_plants")
    .update({ name: parsedName.data, data: parsePlant(data) as Json })
    .eq("id", id)
    .eq("project_id", projectId);
  if (error) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId}/heizung`, "layout");
  return {};
}

const schemaPrintSchema = z.object({
  phase: z.string().regex(/^\d{2}$/).nullable(),
  comment: z.string().trim().max(80).nullable(),
});

/** Print dialog of the Prinzipschema Wärmeerzeugung: SIA phase of the title block and, with a comment, a new revision. */
export async function saveHeatingSchemaPlan(plantId: string, projectId: string, input: { phase: string | null; comment: string | null }): Promise<{ error?: string }> {
  const profile = await assertRole("admin", "planer");
  const parsed = schemaPrintSchema.safeParse(input);
  if (!ids.safeParse([plantId, projectId]).success || !parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { data: plant } = await supabase.from("heating_plants").select("schema_plan").eq("id", plantId).eq("project_id", projectId).maybeSingle();
  if (!plant) return { error: "invalidInput" };
  const plan = parseSchemaPlan(plant.schema_plan);
  const revisions =
    parsed.data.comment !== null
      ? [
          ...plan.revisions,
          {
            index: nextRevisionIndex(plan.revisions),
            initials: initialsOf(profile.full_name, profile.email),
            date: new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" }),
            comment: parsed.data.comment,
          },
        ]
      : plan.revisions;
  const { error } = await supabase
    .from("heating_plants")
    .update({ schema_plan: { phase: parsed.data.phase, revisions } as unknown as Json })
    .eq("id", plantId)
    .eq("project_id", projectId);
  if (error) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId}/heizung`, "layout");
  return {};
}

/** Deletes an Anlage; floor heating systems assigned to it become unassigned. */
export async function deleteHeatingPlant(id: string, projectId: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!ids.safeParse([id, projectId]).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.from("heating_plants").delete().eq("id", id).eq("project_id", projectId);
  if (error) return { error: "deleteFailed" };

  revalidatePath(`/projekte/${projectId}/heizung`, "layout");
  redirect(`/projekte/${projectId}/heizung/erzeugung`);
}

// ---------------------------------------------------------------------------
// Wärmebedarf SIA 384/2 (243)
// ---------------------------------------------------------------------------

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
  redirect(`/projekte/${projectId.data}/heizung/verteilung/waermebedarf/${data.id}`);
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
  redirect(`/projekte/${projectId}/heizung/verteilung/waermebedarf/${data.id}`);
}

export async function deleteHeatCalc(id: string, projectId: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!ids.safeParse([id, projectId]).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.from("heating_calcs").delete().eq("id", id).eq("project_id", projectId);
  if (error) return { error: "deleteFailed" };

  revalidatePath(`/projekte/${projectId}/heizung`, "layout");
  redirect(`/projekte/${projectId}/heizung/verteilung/waermebedarf`);
}

export async function createHeatingSystem(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin", "planer");
  const projectId = z.uuid().safeParse(formData.get("project_id"));
  const name = nameSchema.safeParse(formData.get("name"));
  if (!projectId.success || !name.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { data: calcs } = await supabase.from("heating_calcs").select("id").eq("project_id", projectId.data);
  const { count } = await supabase.from("heating_systems").select("id", { count: "exact", head: true }).eq("project_id", projectId.data);
  const plantId = z.uuid().safeParse(formData.get("plant_id"));
  const data = { ...emptyFloorSystem(), plantId: plantId.success ? plantId.data : null, calcIds: (calcs ?? []).map((c) => c.id) };
  const { data: row, error } = await supabase
    .from("heating_systems")
    .insert({ project_id: projectId.data, name: name.data, sort: count ?? 0, data: data as Json })
    .select("id")
    .single();
  if (error || !row) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId.data}/heizung`, "layout");
  redirect(`/projekte/${projectId.data}/heizung/verteilung/fussbodenheizung/${row.id}`);
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
  redirect(`/projekte/${projectId}/heizung/verteilung/fussbodenheizung`);
}
