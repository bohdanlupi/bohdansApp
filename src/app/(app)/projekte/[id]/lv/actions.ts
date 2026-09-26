"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { onlyKnown, trades } from "@/lib/address-options";
import { assertRole } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";
import { ventilationBkp, ventilationStructure } from "@/lib/lv-ventilation-structure";
import { createClient } from "@/lib/supabase/server";
import type { AppLanguage } from "@/lib/supabase/types";
import { renumberLv } from "@/lib/tree-actions";
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

const structureSchema = z.object({
  levels: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  systems: z.array(z.object({ name: z.string().trim().min(1).max(150), los: z.number().int().min(1).max(20) })).max(50),
});

/**
 * Creates the chapter structure «Lüftung» (BKP 244, LUPI template) at the end of an LV: groups with the template
 * numbers (custom_number) and names in the LV language. Refused when the LV already has a group 244 on top level.
 */
export async function createVentilationStructure(lvId: string, projectId: string, input: unknown): Promise<{ error?: string; count?: number }> {
  await assertRole("admin", "planer");
  const parsed = structureSchema.safeParse(input);
  if (!z.array(z.uuid()).safeParse([lvId, projectId]).success || !parsed.success) return { error: "invalidInput" };
  const { levels, systems } = parsed.data;
  if (levels > 1 && systems.length === 0) return { error: "invalidInput" };

  const supabase = await createClient();
  const [{ data: lv }, { data: existing }, { data: last }] = await Promise.all([
    supabase.from("lvs").select("id, language").eq("id", lvId).eq("project_id", projectId).maybeSingle(),
    supabase.from("lv_nodes").select("id").eq("lv_id", lvId).is("parent_id", null).eq("kind", "group").eq("custom_number", ventilationBkp).limit(1),
    supabase.from("lv_nodes").select("sort").eq("lv_id", lvId).order("sort", { ascending: false }).limit(1),
  ]);
  if (!lv) return { error: "invalidInput" };
  if (existing?.length) return { error: "structureExists" };

  const language = lv.language as AppLanguage;
  const nodes = ventilationStructure(levels, systems, language);
  const idOf = new Map(nodes.map((n) => [n.key, crypto.randomUUID()]));
  let sort = (last?.[0]?.sort ?? 0) + 1;
  const rows = nodes.map((n) => ({
    id: idOf.get(n.key)!,
    lv_id: lvId,
    parent_id: n.parentKey ? idOf.get(n.parentKey)! : null,
    kind: "group" as const,
    custom_number: n.number,
    short_text: { [language]: n.text },
    long_text: {},
    sort: sort++,
  }));
  const { error } = await supabase.from("lv_nodes").insert(rows);
  if (error) return { error: "saveFailed" };
  await renumberLv(lvId);
  revalidatePath(`/projekte/${projectId}/lv/${lvId}`, "layout");
  return { count: rows.length };
}
