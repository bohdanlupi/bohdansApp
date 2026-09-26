import "server-only";

import { cache } from "react";

import { evaluateKwl } from "@/lib/kwl/evaluate";
import { systemDropsByCalc } from "@/lib/kwl/network";
import { parsePlanData } from "@/lib/kwl/plan-schema";
import { parseKwlData } from "@/lib/kwl/schema";
import { parseSystemData } from "@/lib/kwl/system-schema";
import { createClient } from "@/lib/supabase/server";

/** KWL-Planung of a project (defaults when none is saved yet). Deduplicated per request. */
export const loadPlan = cache(async (projectId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("ventilation_plans").select("data").eq("project_id", projectId).maybeSingle();
  return parsePlanData(data?.data);
});

/** Dwelling calculations of a project with their results. */
export const loadCalcs = cache(async (projectId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ventilation_calcs")
    .select("id, name, data")
    .eq("project_id", projectId)
    .order("sort")
    .order("created_at");
  const calcs = (data ?? []).map((calc) => ({ id: calc.id, name: calc.name, data: parseKwlData(calc.data) }));
  const drops = systemDropsByCalc(await loadSystems(projectId), calcs);
  return calcs.map((c) => ({ ...c, system: drops.get(c.id) ?? null, result: evaluateKwl(c.data, drops.get(c.id) ?? null) }));
});

export type LoadedCalc = Awaited<ReturnType<typeof loadCalcs>>[number];

/** Ventilation systems (devices with their duct networks) of a project. */
export const loadSystems = cache(async (projectId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ventilation_systems")
    .select("id, name, data")
    .eq("project_id", projectId)
    .order("sort")
    .order("created_at");
  return (data ?? []).map((s) => ({ id: s.id, name: s.name, data: parseSystemData(s.data) }));
});

export type LoadedSystem = Awaited<ReturnType<typeof loadSystems>>[number];
