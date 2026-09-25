import "server-only";

import { cache } from "react";

import { evaluateKwl } from "@/lib/kwl/evaluate";
import { parsePlanData } from "@/lib/kwl/plan-schema";
import { parseKwlData } from "@/lib/kwl/schema";
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
  return (data ?? []).map((calc) => {
    const parsed = parseKwlData(calc.data);
    return { id: calc.id, name: calc.name, data: parsed, result: evaluateKwl(parsed) };
  });
});

export type LoadedCalc = Awaited<ReturnType<typeof loadCalcs>>[number];
