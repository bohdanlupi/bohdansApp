"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { assertRole } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";
import { evaluateDistribution } from "@/lib/heating/distribution";
import { groupInfos, inputLookups } from "@/lib/heating/distribution-inputs";
import { distributionMaterial, distributionSections } from "@/lib/heating/distribution-material";
import { parseDistribution } from "@/lib/heating/distribution-schema";
import { emptyFloorSystem, parseFloorSystem } from "@/lib/heating/floor-schema";
import { emptyHeatLoad, parseHeatLoad } from "@/lib/heating/heat-load-schema";
import { parseHeatingPlan } from "@/lib/heating/plan-schema";
import { evaluateEws, ewsContextOf } from "@/lib/heating/ews";
import { evaluateHeatLoad } from "@/lib/heating/heat-load";
import { materialSections, plantMaterial } from "@/lib/heating/material";
import { emptyPlant, parsePlant } from "@/lib/heating/plant-schema";
import { initialsOf, nextRevisionIndex, parseSchemaPlan } from "@/lib/kwl/schema-plan";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import type { AppLanguage } from "@/lib/supabase/types";
import { renumberLv } from "@/lib/tree-actions";

import { loadHeatCalcs, loadHeatingPlan } from "./load-plan";
import { loadDistributionInputs } from "./verteilung/schema/load-inputs";

const nameSchema = z.string().trim().min(1).max(200);
const ids = z.tuple([z.uuid(), z.uuid()]);

/** Saves the Heizungsplanung of a project (design criteria, checklists, notes, site and catalogue). */
export async function saveHeatingPlan(projectId: string, data: unknown): Promise<{ error?: string }> {
  await assertRole("admin", "planer");
  if (!z.uuid().safeParse(projectId).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("heating_plans")
    .upsert({ project_id: projectId, data: parseHeatingPlan(data) as Json }, { onConflict: "project_id" });
  if (error) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId}/heizung`, "layout");
  return {};
}

// ---------------------------------------------------------------------------
// Wärmeerzeugungsanlagen (242)
// ---------------------------------------------------------------------------

/** Creates an Anlage and opens its Wärmeerzeugung page. */
export async function createHeatingPlant(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin", "planer");
  const projectId = z.uuid().safeParse(formData.get("project_id"));
  const name = nameSchema.safeParse(formData.get("name"));
  if (!projectId.success || !name.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { count } = await supabase.from("heating_plants").select("id", { count: "exact", head: true }).eq("project_id", projectId.data);
  // The first Anlage takes over what was chosen on the former overview page (generators, storage, cooling).
  let initial = emptyPlant();
  if (!count) {
    const { data: plan } = await supabase.from("heating_plans").select("data").eq("project_id", projectId.data).maybeSingle();
    const { generators, storage, cooling } = parseHeatingPlan(plan?.data).params;
    initial = parsePlant({ generators, storage, cooling });
  }
  const { data, error } = await supabase
    .from("heating_plants")
    .insert({ project_id: projectId.data, name: name.data, sort: count ?? 0, data: initial as Json })
    .select("id")
    .single();
  if (error || !data) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId.data}/heizung`, "layout");
  redirect(`/projekte/${projectId.data}/heizung/erzeugung?anlage=${data.id}`);
}

/** Saves name and inputs of an Anlage. */
export async function saveHeatingPlant(id: string, projectId: string, name: string, data: unknown): Promise<{ error?: string }> {
  await assertRole("admin", "planer");
  const parsedName = nameSchema.safeParse(name);
  if (!ids.safeParse([id, projectId]).success || !parsedName.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("heating_plants")
    .update({ name: parsedName.data, data: parsePlant(data) as Json })
    .eq("id", id)
    .eq("project_id", projectId);
  if (error) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId}/heizung`, "layout");
  return {};
}

const schemaPrintSchema = z.object({
  phase: z.string().regex(/^\d{2}$/).nullable(),
  comment: z.string().trim().max(80).nullable(),
});

/** Print dialog of the Prinzipschema Wärmeerzeugung: SIA phase of the title block and, with a comment, a new revision. */
export async function saveHeatingSchemaPlan(plantId: string, projectId: string, input: { phase: string | null; comment: string | null }): Promise<{ error?: string }> {
  const profile = await assertRole("admin", "planer");
  const parsed = schemaPrintSchema.safeParse(input);
  if (!ids.safeParse([plantId, projectId]).success || !parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { data: plant } = await supabase.from("heating_plants").select("schema_plan").eq("id", plantId).eq("project_id", projectId).maybeSingle();
  if (!plant) return { error: "invalidInput" };
  const plan = parseSchemaPlan(plant.schema_plan);
  const revisions =
    parsed.data.comment !== null
      ? [
          ...plan.revisions,
          {
            index: nextRevisionIndex(plan.revisions),
            initials: initialsOf(profile.full_name, profile.email),
            date: new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" }),
            comment: parsed.data.comment,
          },
        ]
      : plan.revisions;
  const { error } = await supabase
    .from("heating_plants")
    .update({ schema_plan: { phase: parsed.data.phase, revisions } as unknown as Json })
    .eq("id", plantId)
    .eq("project_id", projectId);
  if (error) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId}/heizung`, "layout");
  return {};
}

/** Saves the Strangschema (243 Wärmeverteilung) of an Anlage. */
export async function saveHeatingDistribution(plantId: string, projectId: string, data: unknown): Promise<{ error?: string }> {
  await assertRole("admin", "planer");
  if (!ids.safeParse([plantId, projectId]).success) return { error: "invalidInput" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("heating_plants")
    .update({ distribution: parseDistribution(data) as unknown as Json })
    .eq("id", plantId)
    .eq("project_id", projectId);
  if (error) return { error: "saveFailed" };
  revalidatePath(`/projekte/${projectId}/heizung`, "layout");
  return {};
}

/** Print dialog of the Strangschema: SIA phase of the title block and, with a comment, a new revision. */
export async function saveHeatingDistributionPlan(plantId: string, projectId: string, input: { phase: string | null; comment: string | null }): Promise<{ error?: string }> {
  const profile = await assertRole("admin", "planer");
  const parsed = schemaPrintSchema.safeParse(input);
  if (!ids.safeParse([plantId, projectId]).success || !parsed.success) return { error: "invalidInput" };
  const supabase = await createClient();
  const { data: plant } = await supabase.from("heating_plants").select("distribution_plan").eq("id", plantId).eq("project_id", projectId).maybeSingle();
  if (!plant) return { error: "invalidInput" };
  const plan = parseSchemaPlan(plant.distribution_plan);
  const revisions =
    parsed.data.comment !== null
      ? [
          ...plan.revisions,
          {
            index: nextRevisionIndex(plan.revisions),
            initials: initialsOf(profile.full_name, profile.email),
            date: new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" }),
            comment: parsed.data.comment,
          },
        ]
      : plan.revisions;
  const { error } = await supabase
    .from("heating_plants")
    .update({ distribution_plan: { phase: parsed.data.phase, revisions } as unknown as Json })
    .eq("id", plantId)
    .eq("project_id", projectId);
  if (error) return { error: "saveFailed" };
  revalidatePath(`/projekte/${projectId}/heizung`, "layout");
  return {};
}

/** Deletes an Anlage; floor heating systems assigned to it become unassigned. */
export async function deleteHeatingPlant(id: string, projectId: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!ids.safeParse([id, projectId]).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.from("heating_plants").delete().eq("id", id).eq("project_id", projectId);
  if (error) return { error: "deleteFailed" };

  revalidatePath(`/projekte/${projectId}/heizung`, "layout");
  redirect(`/projekte/${projectId}/heizung/erzeugung`);
}

// ---------------------------------------------------------------------------
// Wärmebedarf SIA 384/2 (243)
// ---------------------------------------------------------------------------

export async function createHeatCalc(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin", "planer");
  const projectId = z.uuid().safeParse(formData.get("project_id"));
  const name = nameSchema.safeParse(formData.get("name"));
  if (!projectId.success || !name.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { count } = await supabase.from("heating_calcs").select("id", { count: "exact", head: true }).eq("project_id", projectId.data);
  const { data, error } = await supabase
    .from("heating_calcs")
    .insert({ project_id: projectId.data, name: name.data, sort: count ?? 0, data: emptyHeatLoad() as Json })
    .select("id")
    .single();
  if (error || !data) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId.data}/heizung`, "layout");
  redirect(`/projekte/${projectId.data}/heizung/verteilung/waermebedarf/${data.id}`);
}

/** Saves name and inputs of a heat load calculation (results are computed, never stored). */
export async function saveHeatCalc(id: string, projectId: string, name: string, data: unknown): Promise<{ error?: string }> {
  await assertRole("admin", "planer");
  const parsedName = nameSchema.safeParse(name);
  if (!ids.safeParse([id, projectId]).success || !parsedName.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("heating_calcs")
    .update({ name: parsedName.data, data: parseHeatLoad(data) as Json })
    .eq("id", id)
    .eq("project_id", projectId);
  if (error) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId}/heizung`, "layout");
  return {};
}

export async function duplicateHeatCalc(id: string, projectId: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!ids.safeParse([id, projectId]).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { data: source } = await supabase.from("heating_calcs").select("*").eq("id", id).eq("project_id", projectId).maybeSingle();
  if (!source) return { error: "saveFailed" };
  const { count } = await supabase.from("heating_calcs").select("id", { count: "exact", head: true }).eq("project_id", projectId);
  const { data, error } = await supabase
    .from("heating_calcs")
    .insert({ project_id: projectId, name: `${source.name} (2)`.slice(0, 200), sort: count ?? 0, data: source.data })
    .select("id")
    .single();
  if (error || !data) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId}/heizung`, "layout");
  redirect(`/projekte/${projectId}/heizung/verteilung/waermebedarf/${data.id}`);
}

export async function deleteHeatCalc(id: string, projectId: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!ids.safeParse([id, projectId]).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.from("heating_calcs").delete().eq("id", id).eq("project_id", projectId);
  if (error) return { error: "deleteFailed" };

  revalidatePath(`/projekte/${projectId}/heizung`, "layout");
  redirect(`/projekte/${projectId}/heizung/verteilung/waermebedarf`);
}

export async function createHeatingSystem(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin", "planer");
  const projectId = z.uuid().safeParse(formData.get("project_id"));
  const name = nameSchema.safeParse(formData.get("name"));
  if (!projectId.success || !name.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { data: calcs } = await supabase.from("heating_calcs").select("id").eq("project_id", projectId.data);
  const { count } = await supabase.from("heating_systems").select("id", { count: "exact", head: true }).eq("project_id", projectId.data);
  const plantId = z.uuid().safeParse(formData.get("plant_id"));
  const data = { ...emptyFloorSystem(), plantId: plantId.success ? plantId.data : null, calcIds: (calcs ?? []).map((c) => c.id) };
  const { data: row, error } = await supabase
    .from("heating_systems")
    .insert({ project_id: projectId.data, name: name.data, sort: count ?? 0, data: data as Json })
    .select("id")
    .single();
  if (error || !row) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId.data}/heizung`, "layout");
  redirect(`/projekte/${projectId.data}/heizung/verteilung/fussbodenheizung/${row.id}`);
}

/** Saves name and inputs of a floor heating system. */
export async function saveHeatingSystem(id: string, projectId: string, name: string, data: unknown): Promise<{ error?: string }> {
  await assertRole("admin", "planer");
  const parsedName = nameSchema.safeParse(name);
  if (!ids.safeParse([id, projectId]).success || !parsedName.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("heating_systems")
    .update({ name: parsedName.data, data: parseFloorSystem(data) as Json })
    .eq("id", id)
    .eq("project_id", projectId);
  if (error) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId}/heizung`, "layout");
  return {};
}

export async function deleteHeatingSystem(id: string, projectId: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!ids.safeParse([id, projectId]).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.from("heating_systems").delete().eq("id", id).eq("project_id", projectId);
  if (error) return { error: "deleteFailed" };

  revalidatePath(`/projekte/${projectId}/heizung`, "layout");
  redirect(`/projekte/${projectId}/heizung/verteilung/fussbodenheizung`);
}

// ---------------------------------------------------------------------------
// Materialauszug 242 → LV
// ---------------------------------------------------------------------------

const makeLabel: Record<AppLanguage, { make: string; number: string }> = {
  de: { make: "Fabrikat", number: "Art.-Nr." },
  fr: { make: "Fabricant", number: "N° d’art." },
  it: { make: "Fabbricante", number: "N. art." },
};

/** Target LV group per chapter of a Materialauszug («241.0» … «243.6»). */
const materialTargets = z.record(z.string().regex(/^24[123]\.[0-6]$/), z.uuid().nullable());

type InsertLine = { article: string | null; manufacturer: string | null; label: string; unit: string; quantity: number };

/**
 * Inserts the lines of a Materialauszug into an LV: each section (chapter key «242.1» …) into its chosen LV group,
 * sections without one into a new group `groupTitle`. Articles of the Nussbaum and Meier Tobler IGH catalogues become
 * catalogue positions, the neutral parts R-positions.
 */
async function insertMaterialRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: { projectId: string; lvId: string; language: AppLanguage; groupTitle: string; targets: Record<string, string | null>; sections: { key: string; lines: InsertLine[] }[] },
): Promise<{ error?: string; count?: number }> {
  const { projectId, lvId, language, groupTitle, sections } = input;
  const lines = sections.flatMap((x) => x.lines);
  if (!lines.length) return { error: "invalidInput" };
  // Chapters must be groups of this LV; lines without one need the title of the new group.
  const chosen = [...new Set(Object.values(input.targets).filter((v): v is string => !!v))];
  const { data: groups } = chosen.length
    ? await supabase.from("lv_nodes").select("id").eq("lv_id", lvId).eq("kind", "group").in("id", chosen)
    : { data: [] as { id: string }[] };
  const valid = new Set((groups ?? []).map((g) => g.id));
  const chapterOf = (section: string) => {
    const id = input.targets[section];
    return id && valid.has(id) ? id : null;
  };
  const needsGroup = sections.some((x) => !chapterOf(x.key));
  const title = nameSchema.safeParse(groupTitle);
  if (needsGroup && !title.success) return { error: "invalidInput" };

  const articles = [...new Set(lines.flatMap((l) => (l.article ? [l.article] : [])))];
  const { data: catalogs } = await supabase.from("catalogs").select("id, supplier").eq("source", "igh").or("name.ilike.%nussbaum%,name.ilike.%meier tobler%");
  const catalogIds = (catalogs ?? []).map((c) => c.id);
  const { data: entries } =
    articles.length && catalogIds.length
      ? await supabase
          .from("catalog_nodes")
          .select("id, catalog_id, article_number, short_text, long_text, unit, unit_price")
          .in("catalog_id", catalogIds)
          .eq("kind", "position")
          .in("article_number", articles)
      : { data: [] };
  const supplierOf = new Map((catalogs ?? []).map((c) => [c.id, c.supplier]));
  // The same number may exist in both catalogues: take the one of the line's manufacturer.
  const entryOf = (l: InsertLine) =>
    (entries ?? []).find((e) => e.article_number === l.article && (supplierOf.get(e.catalog_id) ?? "").toLowerCase().includes((l.manufacturer ?? "").toLowerCase().split(" ")[0])) ??
    (entries ?? []).find((e) => e.article_number === l.article);

  const groupId = crypto.randomUUID();
  const rows: Record<string, unknown>[] = needsGroup
    ? [{ id: groupId, lv_id: lvId, parent_id: null, kind: "group", short_text: { [language]: title.data }, long_text: {}, sort: 1_000_000 }]
    : [];
  let sort = 1_000_001;
  for (const [section, l] of sections.flatMap((x) => x.lines.map((line) => [x.key, line] as const))) {
    const parentId = chapterOf(section) ?? groupId;
    const entry = l.article ? entryOf(l) : undefined;
    if (entry) {
      const longText = { ...(entry.long_text as Record<string, string>) };
      const supplier = supplierOf.get(entry.catalog_id);
      if (supplier && entry.article_number) {
        const langs = Object.keys(entry.short_text as object) as AppLanguage[];
        for (const lang of langs.length ? langs : [language]) {
          longText[lang] = [longText[lang], `${makeLabel[lang].make}: ${supplier}, ${makeLabel[lang].number} ${entry.article_number}`].filter(Boolean).join("\n");
        }
      }
      rows.push({
        id: crypto.randomUUID(),
        lv_id: lvId,
        parent_id: parentId,
        kind: "position",
        short_text: entry.short_text,
        long_text: longText,
        unit: entry.unit ?? l.unit,
        quantity: l.quantity,
        gross_unit_price: entry.unit_price,
        source_catalog_node_id: entry.id,
        sort: sort++,
      });
    } else {
      rows.push({
        id: crypto.randomUUID(),
        lv_id: lvId,
        parent_id: parentId,
        kind: "r_position",
        short_text: { [language]: l.label },
        long_text: l.article ? { [language]: `${makeLabel[language].make}: ${l.manufacturer ?? ""}, ${makeLabel[language].number} ${l.article}` } : {},
        unit: l.unit,
        quantity: l.quantity,
        sort: sort++,
      });
    }
  }

  const { error } = await supabase.from("lv_nodes").insert(rows as never[]);
  if (error) return { error: "saveFailed" };
  await renumberLv(lvId);
  revalidatePath(`/projekte/${projectId}/lv/${lvId}`, "layout");
  return { count: rows.length - (needsGroup ? 1 : 0) };
}


/**
 * Inserts the Materialauszug of an Anlage into an LV: the lines of each chapter (241.0 … 242.4) into their chosen LV
 * group, chapters without one into a new group `groupTitle`. Articles of the Nussbaum and Meier Tobler IGH catalogues
 * become catalogue positions, the neutral parts R-positions.
 */
export async function insertHeatingMaterial(
  plantId: string,
  projectId: string,
  lvId: string,
  groupTitle: string,
  targets: Record<string, string | null> = {},
): Promise<{ error?: string; count?: number }> {
  await assertRole("admin", "planer");
  const parsedTargets = materialTargets.safeParse(targets);
  if (!z.array(z.uuid()).safeParse([plantId, projectId, lvId]).success || !parsedTargets.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const [{ data: plant }, { data: lv }, plan, calcs] = await Promise.all([
    supabase.from("heating_plants").select("data").eq("id", plantId).eq("project_id", projectId).maybeSingle(),
    supabase.from("lvs").select("id, language").eq("id", lvId).eq("project_id", projectId).maybeSingle(),
    loadHeatingPlan(projectId),
    loadHeatCalcs(projectId),
  ]);
  if (!plant || !lv) return { error: "invalidInput" };

  const data = parsePlant(plant.data);
  const load = calcs.reduce((s, c) => s + evaluateHeatLoad(c.data, plan.site, plan.catalog).building, 0);
  const ews = data.generators.some((g) => g.type === "hpBrine") ? evaluateEws(data, ewsContextOf(plan, load)) : null;
  const sections = materialSections(plantMaterial(data, ews).filter((l) => l.quantity > 0));

  return insertMaterialRows(supabase, { projectId, lvId, language: lv.language as AppLanguage, groupTitle, targets: parsedTargets.data, sections });
}

/** Inserts the Materialauszug of the Strangschema (243) of an Anlage into an LV, like insertHeatingMaterial. */
export async function insertDistributionMaterial(
  plantId: string,
  projectId: string,
  lvId: string,
  groupTitle: string,
  targets: Record<string, string | null> = {},
): Promise<{ error?: string; count?: number }> {
  await assertRole("admin", "planer");
  const parsedTargets = materialTargets.safeParse(targets);
  if (!z.array(z.uuid()).safeParse([plantId, projectId, lvId]).success || !parsedTargets.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const [{ data: plant }, { data: lv }, inputs] = await Promise.all([
    supabase.from("heating_plants").select("data, distribution").eq("id", plantId).eq("project_id", projectId).maybeSingle(),
    supabase.from("lvs").select("id, language").eq("id", lvId).eq("project_id", projectId).maybeSingle(),
    loadDistributionInputs(projectId, { id: plantId }),
  ]);
  if (!plant || !lv) return { error: "invalidInput" };

  const data = parseDistribution(plant.distribution);
  const lookups = inputLookups(inputs.rooms, inputs.floors);
  const result = evaluateDistribution(data, groupInfos(parsePlant(plant.data).groups, "Gruppe"), lookups.room, lookups.floor, inputs.outsideTemp);
  const sections = distributionSections(distributionMaterial(data, result));
  return insertMaterialRows(supabase, { projectId, lvId, language: lv.language as AppLanguage, groupTitle, targets: parsedTargets.data, sections });
}
