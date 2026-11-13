"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertRole } from "@/lib/auth";
import { parseFirePlan } from "@/lib/fire/plan-schema";
import { parseHeatingPlan } from "@/lib/heating/plan-schema";
import { parsePlanData } from "@/lib/kwl/plan-schema";
import { checkSchema } from "@/lib/planning";
import { parseSanitaryPlan } from "@/lib/sanitary/plan-schema";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/** Saves the Brandschutzplanung of a project (criteria, own checklists, notes). */
export async function saveFirePlan(projectId: string, data: unknown): Promise<{ error?: string }> {
  await assertRole("admin", "planer");
  if (!z.uuid().safeParse(projectId).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("fire_plans")
    .upsert({ project_id: projectId, data: parseFirePlan(data) as unknown as Json }, { onConflict: "project_id" });
  if (error) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId}/brandschutz`, "layout");
  return {};
}

const trades = {
  heating: { table: "heating_plans", path: "heizung", parse: parseHeatingPlan },
  ventilation: { table: "ventilation_plans", path: "lueftung", parse: parsePlanData },
  sanitary: { table: "sanitary_plans", path: "sanitaer", parse: parseSanitaryPlan },
} as const;

const patchSchema = z.object({
  /** Checklist states to set (null = back to open). */
  checks: z.record(z.string().max(60), checkSchema.nullable()).optional(),
  /** Criteria to merge into the params (validated leniently by the trade schema). */
  params: z.record(z.string().max(40), z.unknown()).optional(),
});

/**
 * Changes single checklist states or criteria of a trade plan from the Brandschutz pages. Reads the current plan
 * and merges only the given keys, so concurrent work in the trade pages is kept.
 */
export async function patchTradePlan(projectId: string, trade: keyof typeof trades, patch: z.input<typeof patchSchema>): Promise<{ error?: string }> {
  await assertRole("admin", "planer");
  const parsed = patchSchema.safeParse(patch);
  if (!z.uuid().safeParse(projectId).success || !(trade in trades) || !parsed.success) return { error: "invalidInput" };
  const { table, path, parse } = trades[trade];

  const supabase = await createClient();
  const { data: row, error: readError } = await supabase.from(table).select("data").eq("project_id", projectId).maybeSingle();
  if (readError) return { error: "saveFailed" };
  const current = parse(row?.data) as { params: Record<string, unknown>; checks: Record<string, unknown> };
  const checks = { ...current.checks };
  for (const [id, value] of Object.entries(parsed.data.checks ?? {})) {
    if (value) checks[id] = value;
    else delete checks[id];
  }
  const next = parse({ ...current, params: { ...current.params, ...parsed.data.params }, checks });

  const { error } = await supabase.from(table).upsert({ project_id: projectId, data: next as unknown as Json }, { onConflict: "project_id" });
  if (error) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId}/${path}`, "layout");
  revalidatePath(`/projekte/${projectId}/brandschutz`, "layout");
  return {};
}
