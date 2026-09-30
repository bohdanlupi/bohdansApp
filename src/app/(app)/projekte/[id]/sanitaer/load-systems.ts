import "server-only";

import { cache } from "react";

import { parseSchemaPlan } from "@/lib/kwl/schema-plan";
import { parseSanitaryData } from "@/lib/sanitary/system-schema";
import { createClient } from "@/lib/supabase/server";

/** Sanitäranlagen of a project. Deduplicated per request. */
export const loadSanitarySystems = cache(async (projectId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sanitary_systems")
    .select("id, name, data, schema_plan")
    .eq("project_id", projectId)
    .order("sort")
    .order("created_at");
  return (data ?? []).map((s) => ({ id: s.id, name: s.name, data: parseSanitaryData(s.data), schemaPlan: parseSchemaPlan(s.schema_plan) }));
});
