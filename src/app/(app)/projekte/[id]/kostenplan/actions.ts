"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const amount = z.number().finite().min(-1e11).max(1e11).nullable();

/** Saves budget and manual KV amount of one cost code of a project. */
export async function saveProjectCost(
  projectId: string,
  costItemId: string,
  values: { budget: number | null; manual_amount: number | null },
): Promise<{ error?: string }> {
  await assertRole("admin", "planer");
  const ids = z.tuple([z.uuid(), z.uuid()]).safeParse([projectId, costItemId]);
  const parsed = z.object({ budget: amount, manual_amount: amount }).safeParse(values);
  if (!ids.success || !parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_cost_items")
    .upsert({ project_id: projectId, cost_plan_item_id: costItemId, ...parsed.data }, { onConflict: "project_id,cost_plan_item_id" });
  if (error) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId}/kostenplan`);
  return {};
}
