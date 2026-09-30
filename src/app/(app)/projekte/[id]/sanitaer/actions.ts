"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { assertRole } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";
import { initialsOf, nextRevisionIndex, parseSchemaPlan } from "@/lib/kwl/schema-plan";
import { emptySanitaryData, parseSanitaryData } from "@/lib/sanitary/system-schema";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

const nameSchema = z.string().trim().min(1).max(200);
const ids = (...values: string[]) => z.array(z.uuid()).safeParse(values).success;

export async function createSanitarySystem(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin", "planer");
  const projectId = z.uuid().safeParse(formData.get("project_id"));
  const name = nameSchema.safeParse(formData.get("name"));
  if (!projectId.success || !name.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { count } = await supabase.from("sanitary_systems").select("id", { count: "exact", head: true }).eq("project_id", projectId.data);
  const { data: row, error } = await supabase
    .from("sanitary_systems")
    .insert({ project_id: projectId.data, name: name.data, sort: count ?? 0, data: emptySanitaryData() as unknown as Json })
    .select("id")
    .single();
  if (error || !row) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId.data}/sanitaer`, "layout");
  redirect(`/projekte/${projectId.data}/sanitaer/${row.id}`);
}

export async function saveSanitarySystem(id: string, projectId: string, name: string, data: unknown): Promise<{ error?: string }> {
  await assertRole("admin", "planer");
  const parsedName = nameSchema.safeParse(name);
  if (!ids(id, projectId) || !parsedName.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("sanitary_systems")
    .update({ name: parsedName.data, data: parseSanitaryData(data) as unknown as Json })
    .eq("id", id)
    .eq("project_id", projectId);
  if (error) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId}/sanitaer`, "layout");
  return {};
}

export async function deleteSanitarySystem(id: string, projectId: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!ids(id, projectId)) return { error: "invalidInput" };
  const supabase = await createClient();
  const { error } = await supabase.from("sanitary_systems").delete().eq("id", id).eq("project_id", projectId);
  if (error) return { error: "deleteFailed" };
  revalidatePath(`/projekte/${projectId}/sanitaer`, "layout");
  redirect(`/projekte/${projectId}/sanitaer`);
}

const schemaPrintSchema = z.object({
  phase: z.string().regex(/^\d{2}$/).nullable(),
  comment: z.string().trim().max(80).nullable(),
});

/** Print dialog of the Prinzipschema: SIA phase of the title block and, with a comment, a new revision. */
export async function saveSanitarySchemaPlan(systemId: string, projectId: string, input: { phase: string | null; comment: string | null }): Promise<{ error?: string }> {
  const profile = await assertRole("admin", "planer");
  const parsed = schemaPrintSchema.safeParse(input);
  if (!ids(systemId, projectId) || !parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { data: system } = await supabase.from("sanitary_systems").select("schema_plan").eq("id", systemId).eq("project_id", projectId).maybeSingle();
  if (!system) return { error: "invalidInput" };
  const plan = parseSchemaPlan(system.schema_plan);
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
    .from("sanitary_systems")
    .update({ schema_plan: { phase: parsed.data.phase, revisions } as unknown as Json })
    .eq("id", systemId)
    .eq("project_id", projectId);
  if (error) return { error: "saveFailed" };
  revalidatePath(`/projekte/${projectId}/sanitaer/${systemId}`);
  return {};
}
