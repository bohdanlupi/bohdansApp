import "server-only";

import { cache } from "react";

import { parseFloorSystem } from "@/lib/heating/floor-schema";
import { parseHeatLoad } from "@/lib/heating/heat-load-schema";
import { evaluateHeatLoad } from "@/lib/heating/heat-load";
import { effectiveHeatingParams } from "@/lib/heating/params";
import { parseHeatingPlan } from "@/lib/heating/plan-schema";
import { parsePlant } from "@/lib/heating/plant-schema";
import { parseSchemaPlan } from "@/lib/kwl/schema-plan";
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

/** Wärmeerzeugungsanlagen (242) of a project. */
export const loadHeatingPlants = cache(async (projectId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("heating_plants").select("id, name, data, schema_plan").eq("project_id", projectId).order("sort").order("created_at");
  return (data ?? []).map((p) => ({ id: p.id, name: p.name, data: parsePlant(p.data), schemaPlan: parseSchemaPlan(p.schema_plan) }));
});

export type LoadedPlant = Awaited<ReturnType<typeof loadHeatingPlants>>[number];

/** The Anlage chosen with ?anlage=… (else the first one), or null when the project has none. */
export const selectPlant = (plants: LoadedPlant[], id: string | string[] | undefined) =>
  plants.find((p) => p.id === id) ?? plants[0] ?? null;

/** Checklist parameters of the project, taken from the chapters (effectiveHeatingParams). */
export const loadHeatingParams = cache(async (projectId: string) => {
  const [plan, plants, calcs, systems] = await Promise.all([loadHeatingPlan(projectId), loadHeatingPlants(projectId), loadHeatCalcs(projectId), loadHeatingSystems(projectId)]);
  const loads = calcs.map((c) => evaluateHeatLoad(c.data, plan.site, plan.catalog).building);
  return effectiveHeatingParams(plan.params, plants, systems.length, loads);
});

/** Floor heating systems (243 Fussbodenheizung) of a project. */
export const loadHeatingSystems = cache(async (projectId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("heating_systems").select("id, name, data").eq("project_id", projectId).order("sort").order("created_at");
  return (data ?? []).map((s) => ({ id: s.id, name: s.name, data: parseFloorSystem(s.data) }));
});
