import "server-only";

import { cache } from "react";

import { parseFloorSystem } from "@/lib/heating/floor-schema";
import { parseHeatLoad } from "@/lib/heating/heat-load-schema";
import { parseHeatingPlan } from "@/lib/heating/plan-schema";
import { createClient } from "@/lib/supabase/server";

/** Heizungsplanung of a project (defaults when none is saved yet). Deduplicated per request. */
export const loadHeatingPlan = cache(async (projectId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("heating_plans").select("data").eq("project_id", projectId).maybeSingle();
  return parseHeatingPlan(data?.data);
});

/** Heat load calculations (Konzepte) of a project. */
export const loadHeatCalcs = cache(async (projectId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("heating_calcs").select("id, name, data").eq("project_id", projectId).order("sort").order("created_at");
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, data: parseHeatLoad(c.data) }));
});

/** Floor heating systems (Dimensionierung) of a project. */
export const loadHeatingSystems = cache(async (projectId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("heating_systems").select("id, name, data").eq("project_id", projectId).order("sort").order("created_at");
  return (data ?? []).map((s) => ({ id: s.id, name: s.name, data: parseFloorSystem(s.data) }));
});
