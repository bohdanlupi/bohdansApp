"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { assertRole } from "@/lib/auth";
import { parentCode } from "@/lib/cost-plan";
import type { FormState } from "@/lib/form-state";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { PG_UNIQUE_VIOLATION } from "@/lib/validation";

const PATH = "/einstellungen/kostenplaene";

const nameSchema = z.object({ de: z.string().trim(), fr: z.string().trim(), it: z.string().trim() });
const cleanName = (name: z.infer<typeof nameSchema>): Json =>
  Object.fromEntries(Object.entries(name).filter(([, v]) => v));

/** Sets parent_id of every item from its code (longest other code that is a prefix). */
async function rebuildParents(templateId: string) {
  const supabase = await createClient();
  const { data: items } = await supabase.from("cost_plan_items").select("id, code, parent_id").eq("template_id", templateId);
  if (!items) return;
  const byCode = new Map(items.map((i) => [i.code, i.id]));
  const codes = items.map((i) => i.code);
  const changed = items
    .map((i) => ({ ...i, next: byCode.get(parentCode(i.code, codes) ?? "") ?? null }))
    .filter((i) => i.next !== i.parent_id);
  for (const item of changed) {
    await supabase.from("cost_plan_items").update({ parent_id: item.next }).eq("id", item.id);
  }
}

const itemSchema = z.object({
  template_id: z.uuid(),
  code: z.string().trim().min(1).max(20),
  de: z.string().trim().min(1),
  fr: z.string().trim(),
  it: z.string().trim(),
});

export async function addCostItem(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin");
  const parsed = itemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalidInput" };

  const { template_id, code, ...name } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("cost_plan_items").insert({ template_id, code, name: cleanName(name) });
  if (error) return { error: error.code === PG_UNIQUE_VIOLATION ? "costCodeExists" : "saveFailed" };

  await rebuildParents(template_id);
  revalidatePath(PATH);
  return { success: "saved" };
}

export async function updateCostItemName(id: string, name: { de: string; fr: string; it: string }): Promise<FormState> {
  await assertRole("admin");
  const parsed = nameSchema.safeParse(name);
  if (!z.uuid().safeParse(id).success || !parsed.success || !parsed.data.de) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.from("cost_plan_items").update({ name: cleanName(parsed.data) }).eq("id", id);
  if (error) return { error: "saveFailed" };
  revalidatePath(PATH);
  return {};
}

export async function deleteCostItem(id: string, templateId: string): Promise<FormState> {
  await assertRole("admin");
  if (!z.uuid().safeParse(id).success) return { error: "invalidInput" };

  const supabase = await createClient();
  // Children are re-attached to the next higher code instead of being deleted with it.
  await supabase.from("cost_plan_items").update({ parent_id: null }).eq("parent_id", id);
  const { error } = await supabase.from("cost_plan_items").delete().eq("id", id);
  if (error) return { error: "deleteFailed" };

  await rebuildParents(templateId);
  revalidatePath(PATH);
  return {};
}

const templateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  copy_from: z.union([z.uuid(), z.literal("")]),
});

export async function createTemplate(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin");
  const parsed = templateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { data: template, error } = await supabase.from("cost_plan_templates").insert({ name: parsed.data.name }).select("id").single();
  if (error || !template) return { error: "saveFailed" };

  if (parsed.data.copy_from) {
    const { data: items } = await supabase.from("cost_plan_items").select("code, name, sort").eq("template_id", parsed.data.copy_from);
    if (items?.length) {
      await supabase.from("cost_plan_items").insert(items.map((i) => ({ ...i, template_id: template.id })));
      await rebuildParents(template.id);
    }
  }

  revalidatePath(PATH);
  redirect(`${PATH}?vorlage=${template.id}`);
}

export async function deleteTemplate(id: string): Promise<FormState> {
  await assertRole("admin");
  if (!z.uuid().safeParse(id).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { count } = await supabase.from("projects").select("*", { count: "exact", head: true }).eq("cost_plan_template_id", id);
  if (count) return { error: "templateInUse" };
  const { error } = await supabase.from("cost_plan_templates").delete().eq("id", id);
  if (error) return { error: "deleteFailed" };

  revalidatePath(PATH);
  redirect(PATH);
}
