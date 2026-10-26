"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertRole } from "@/lib/auth";
import { parseBuildingModel, planLabelsSchema } from "@/lib/building/schema";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

const uuid = z.uuid();
const floorKey = z.string().min(1).max(40);

/** Saves the Gebäudemodell of a project (Geschosse, rooms …). */
export async function saveBuildingModel(projectId: string, data: unknown): Promise<{ error?: string }> {
  await assertRole("admin", "planer");
  if (!uuid.safeParse(projectId).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("building_models")
    .upsert({ project_id: projectId, data: parseBuildingModel(data) as unknown as Json }, { onConflict: "project_id" });
  if (error) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId}/gebaeude`);
  return {};
}

const newPlanSchema = z.object({
  id: uuid,
  floor: floorKey,
  name: z.string().trim().max(200).catch(""),
  filePath: z.string().min(1).max(300),
  snapshotPath: z.string().min(1).max(300),
  page: z.number().int().min(1).max(999),
  width: z.number().int().min(1).max(20000),
  height: z.number().int().min(1).max(20000),
  previewPath: z.string().min(1).max(300).nullable().catch(null),
  labels: planLabelsSchema,
});

/**
 * Registers a plan page uploaded from the browser (original + PNG snapshot under <project>/<plan id>/ in the bucket
 * «plans»). A plan already attached to the Geschoss is replaced and its files removed; the drawn rooms are kept –
 * they refer to snapshot pixels, so the user has to check them against the new plan.
 */
export async function createBuildingPlan(projectId: string, input: unknown): Promise<{ error?: string }> {
  await assertRole("admin", "planer");
  const parsed = newPlanSchema.safeParse(input);
  if (!uuid.safeParse(projectId).success || !parsed.success) return { error: "invalidInput" };
  const plan = parsed.data;
  const prefix = `${projectId}/${plan.id}/`;
  if (!plan.filePath.startsWith(prefix) || !plan.snapshotPath.startsWith(prefix) || (plan.previewPath && !plan.previewPath.startsWith(prefix))) return { error: "invalidInput" };

  const supabase = await createClient();
  const { data: old } = await supabase.from("building_plans").select("id, file_path, snapshot_path, preview_path").eq("project_id", projectId).eq("floor", plan.floor).maybeSingle();
  if (old) {
    await supabase.from("building_plans").delete().eq("id", old.id);
    await supabase.storage.from("plans").remove([old.file_path, old.snapshot_path, ...(old.preview_path ? [old.preview_path] : [])]);
  }
  const { error } = await supabase.from("building_plans").insert({
    id: plan.id,
    project_id: projectId,
    floor: plan.floor,
    name: plan.name,
    file_path: plan.filePath,
    snapshot_path: plan.snapshotPath,
    preview_path: plan.previewPath,
    labels: plan.labels as unknown as Json,
    page: plan.page,
    width: plan.width,
    height: plan.height,
  });
  if (error) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId}/gebaeude`);
  return {};
}

const calibrationSchema = z.object({
  scale: z.number().finite().positive().nullable(),
  rotation: z.number().finite().min(-360).max(360),
  north: z.number().finite().min(-360).max(360).nullable(),
  originX: z.number().finite(),
  originY: z.number().finite(),
});

/** Scale, rotation, north and origin of a plan page (snapshot pixel coordinates → building). */
export async function saveBuildingPlanCalibration(planId: string, projectId: string, input: unknown): Promise<{ error?: string }> {
  await assertRole("admin", "planer");
  const parsed = calibrationSchema.safeParse(input);
  if (!uuid.safeParse(planId).success || !uuid.safeParse(projectId).success || !parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("building_plans")
    .update({ scale: parsed.data.scale, rotation: parsed.data.rotation, north: parsed.data.north, origin_x: parsed.data.originX, origin_y: parsed.data.originY })
    .eq("id", planId)
    .eq("project_id", projectId);
  if (error) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId}/gebaeude`);
  return {};
}

/** Removes a plan page and its files; the rooms of the Geschoss stay. */
export async function deleteBuildingPlan(planId: string, projectId: string): Promise<{ error?: string }> {
  await assertRole("admin", "planer");
  if (!uuid.safeParse(planId).success || !uuid.safeParse(projectId).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { data: plan } = await supabase.from("building_plans").select("file_path, snapshot_path, preview_path").eq("id", planId).eq("project_id", projectId).maybeSingle();
  if (!plan) return { error: "invalidInput" };
  const { error } = await supabase.from("building_plans").delete().eq("id", planId).eq("project_id", projectId);
  if (error) return { error: "deleteFailed" };
  await supabase.storage.from("plans").remove([plan.file_path, plan.snapshot_path, ...(plan.preview_path ? [plan.preview_path] : [])]);

  revalidatePath(`/projekte/${projectId}/gebaeude`);
  return {};
}
