import "server-only";

import { cache } from "react";

import type { FirePlans } from "@/lib/fire/phases";
import { parseFirePlan } from "@/lib/fire/plan-schema";
import { createClient } from "@/lib/supabase/server";

import { loadHeatingPlan } from "../heizung/load-plan";
import { loadPlan as loadVentilationPlan } from "../lueftung/load-plan";
import { loadSanitaryPlan } from "../sanitaer/load-plan";

/** Brandschutzplanung of a project (defaults when none is saved yet). Deduplicated per request. */
export const loadFirePlan = cache(async (projectId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("fire_plans").select("data").eq("project_id", projectId).maybeSingle();
  return parseFirePlan(data?.data);
});

/** The Brandschutz plan plus the three trade plans whose fire items it mirrors. */
export const loadFirePlans = cache(async (projectId: string) => {
  const [fire, heating, ventilation, sanitary] = await Promise.all([
    loadFirePlan(projectId),
    loadHeatingPlan(projectId),
    loadVentilationPlan(projectId),
    loadSanitaryPlan(projectId),
  ]);
  return { fire, heating, ventilation, sanitary } satisfies FirePlans;
});
