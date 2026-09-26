import "server-only";

import { cache } from "react";

import { parseHeatingPlan } from "@/lib/heating/plan-schema";
import { createClient } from "@/lib/supabase/server";

/** Heizungsplanung of a project (defaults when none is saved yet). Deduplicated per request. */
export const loadHeatingPlan = cache(async (projectId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("heating_plans").select("data").eq("project_id", projectId).maybeSingle();
  return parseHeatingPlan(data?.data);
});
