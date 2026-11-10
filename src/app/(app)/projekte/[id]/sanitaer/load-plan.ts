import "server-only";

import { cache } from "react";

import { parseSanitaryPlan } from "@/lib/sanitary/plan-schema";
import { createClient } from "@/lib/supabase/server";

/** Sanitärplanung of a project (defaults when none is saved yet). Deduplicated per request. */
export const loadSanitaryPlan = cache(async (projectId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("sanitary_plans").select("data").eq("project_id", projectId).maybeSingle();
  return parseSanitaryPlan(data?.data);
});
