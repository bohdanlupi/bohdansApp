import "server-only";

import { cache } from "react";

import { type BuildingModel, defaultFloors, parseBuildingModel, type PlanInfo } from "@/lib/building/schema";
import { createClient } from "@/lib/supabase/server";

/** Gebäudemodell of a project (default Geschosse when none is saved yet). Deduplicated per request. */
export const loadBuildingModel = cache(async (projectId: string): Promise<BuildingModel> => {
  const supabase = await createClient();
  const { data } = await supabase.from("building_models").select("data").eq("project_id", projectId).maybeSingle();
  const model = parseBuildingModel(data?.data);
  return data ? model : { ...model, floors: defaultFloors() };
});

/** Uploaded plan pages of a project with their calibration. */
export const loadBuildingPlans = cache(async (projectId: string): Promise<PlanInfo[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("building_plans")
    .select("id, floor, name, page, width, height, scale, rotation, north, origin_x, origin_y")
    .eq("project_id", projectId);
  return (data ?? []).map((p) => ({
    id: p.id,
    floor: p.floor,
    name: p.name,
    page: p.page,
    width: p.width,
    height: p.height,
    scale: p.scale,
    rotation: p.rotation,
    north: p.north,
    originX: p.origin_x,
    originY: p.origin_y,
  }));
});

/** Signed URL (1 h) of the PNG snapshot of a plan, for the editor's background image. */
export async function snapshotUrl(projectId: string, planId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: plan } = await supabase.from("building_plans").select("snapshot_path").eq("id", planId).eq("project_id", projectId).maybeSingle();
  if (!plan) return null;
  const { data } = await supabase.storage.from("plans").createSignedUrl(plan.snapshot_path, 3600);
  return data?.signedUrl ?? null;
}
