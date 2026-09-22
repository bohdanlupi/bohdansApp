"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { onlyKnown, trades } from "@/lib/address-options";
import { assertRole } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";
import { languageSchema, optionalDate, optionalText, PG_UNIQUE_VIOLATION } from "@/lib/validation";

const lvSchema = z.object({
  project_id: z.uuid(),
  number: z.string().trim().min(1).max(30),
  title: z.string().trim().min(1).max(300),
  trade: z.string().transform((v) => onlyKnown([v], trades)[0] ?? null),
  language: languageSchema,
  status: z.enum(["draft", "tendered", "awarded"]).optional(),
  description: optionalText.optional(),
  submission_deadline: optionalDate.optional(),
  cost_plan_item_id: z
    .union([z.uuid(), z.literal("")])
    .optional()
    .transform((v) => v || null),
});

export async function createLv(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin", "planer");
  const parsed = lvSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { data, error } = await supabase.from("lvs").insert(parsed.data).select("id").single();
  if (error || !data) return { error: error?.code === PG_UNIQUE_VIOLATION ? "lvNumberExists" : "saveFailed" };

  revalidatePath(`/projekte/${parsed.data.project_id}/lv`);
  redirect(`/projekte/${parsed.data.project_id}/lv/${data.id}`);
}

export async function updateLv(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin", "planer");
  const id = z.uuid().safeParse(formData.get("id"));
  const parsed = lvSchema.safeParse(Object.fromEntries(formData));
  if (!id.success || !parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.from("lvs").update(parsed.data).eq("id", id.data);
  if (error) return { error: error.code === PG_UNIQUE_VIOLATION ? "lvNumberExists" : "saveFailed" };

  revalidatePath(`/projekte/${parsed.data.project_id}/lv`, "layout");
  return { success: "saved" };
}

export async function deleteLv(id: string, projectId: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!z.uuid().safeParse(id).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.from("lvs").delete().eq("id", id);
  if (error) return { error: "deleteFailed" };

  revalidatePath(`/projekte/${projectId}/lv`);
  redirect(`/projekte/${projectId}/lv`);
}
