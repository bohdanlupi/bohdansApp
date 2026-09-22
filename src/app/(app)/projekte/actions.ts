"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { participantRoles, projectStatuses } from "@/lib/address-options";
import { assertRole, getCurrentProfile } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";
import { languageSchema, optionalDate, optionalText, PG_UNIQUE_VIOLATION } from "@/lib/validation";

const projectSchema = z.object({
  number: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1),
  street: optionalText,
  zip: optionalText,
  city: optionalText,
  status: z.enum(projectStatuses),
  language: languageSchema,
  start_date: optionalDate,
  end_date: optionalDate,
  description: optionalText,
  cost_plan_template_id: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
});

export async function createProject(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin", "planer");
  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  let costPlanTemplateId = parsed.data.cost_plan_template_id;
  if (!costPlanTemplateId) {
    const { data: bkp } = await supabase.from("cost_plan_templates").select("id").eq("key", "bkp").maybeSingle();
    costPlanTemplateId = bkp?.id ?? null;
  }
  const { data, error } = await supabase
    .from("projects")
    .insert({ ...parsed.data, cost_plan_template_id: costPlanTemplateId })
    .select("id")
    .single();
  if (error || !data) return { error: error?.code === PG_UNIQUE_VIOLATION ? "projectNumberExists" : "saveFailed" };

  revalidatePath("/projekte");
  redirect(`/projekte/${data.id}`);
}

export async function updateProject(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin", "planer");
  const id = z.uuid().safeParse(formData.get("id"));
  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!id.success || !parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.from("projects").update(parsed.data).eq("id", id.data);
  if (error) return { error: error.code === PG_UNIQUE_VIOLATION ? "projectNumberExists" : "saveFailed" };

  revalidatePath("/projekte");
  revalidatePath(`/projekte/${id.data}`);
  return { success: "saved" };
}

export async function deleteProject(id: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!z.uuid().safeParse(id).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) return { error: "deleteFailed" };

  revalidatePath("/projekte");
  redirect("/projekte");
}

const participantSchema = z.object({
  project_id: z.uuid(),
  company_id: z.uuid(),
  contact_id: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
  role: z.enum(participantRoles),
  note: optionalText,
});

export async function addParticipant(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin", "planer");
  const parsed = participantSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.from("project_participants").insert(parsed.data);
  if (error) return { error: error.code === PG_UNIQUE_VIOLATION ? "participantExists" : "saveFailed" };

  revalidatePath(`/projekte/${parsed.data.project_id}`);
  return { success: "saved" };
}

export async function removeParticipant(id: string, projectId: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!z.uuid().safeParse(id).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.from("project_participants").delete().eq("id", id);
  if (error) return { error: "deleteFailed" };

  revalidatePath(`/projekte/${projectId}`);
  return {};
}

/** Contacts of a company, for the participant form. */
export async function getCompanyContacts(companyId: string) {
  if (!(await getCurrentProfile()) || !z.uuid().safeParse(companyId).success) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, function")
    .eq("company_id", companyId)
    .order("last_name");
  return data ?? [];
}
