"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertRole } from "@/lib/auth";
import { parseHeatingPlan } from "@/lib/heating/plan-schema";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/** Saves the Heizungsplanung of a project (design criteria, checklists, notes). */
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
