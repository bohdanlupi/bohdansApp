"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { assertRole } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";
import { initialsOf, nextRevisionIndex, parseSchemaPlan } from "@/lib/kwl/schema-plan";
import { evaluateSystem } from "@/lib/sanitary/network";
import { systemQuantities } from "@/lib/sanitary/quantities";
import { emptySanitaryData, parseSanitaryData } from "@/lib/sanitary/system-schema";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import type { AppLanguage } from "@/lib/supabase/types";
import { renumberLv } from "@/lib/tree-actions";

const nameSchema = z.string().trim().min(1).max(200);
const ids = (...values: string[]) => z.array(z.uuid()).safeParse(values).success;

export async function createSanitarySystem(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin", "planer");
  const projectId = z.uuid().safeParse(formData.get("project_id"));
  const name = nameSchema.safeParse(formData.get("name"));
  if (!projectId.success || !name.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { count } = await supabase.from("sanitary_systems").select("id", { count: "exact", head: true }).eq("project_id", projectId.data);
  const { data: row, error } = await supabase
    .from("sanitary_systems")
    .insert({ project_id: projectId.data, name: name.data, sort: count ?? 0, data: emptySanitaryData() as unknown as Json })
    .select("id")
    .single();
  if (error || !row) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId.data}/sanitaer`, "layout");
  redirect(`/projekte/${projectId.data}/sanitaer/${row.id}`);
}

export async function saveSanitarySystem(id: string, projectId: string, name: string, data: unknown): Promise<{ error?: string }> {
  await assertRole("admin", "planer");
  const parsedName = nameSchema.safeParse(name);
  if (!ids(id, projectId) || !parsedName.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("sanitary_systems")
    .update({ name: parsedName.data, data: parseSanitaryData(data) as unknown as Json })
    .eq("id", id)
    .eq("project_id", projectId);
  if (error) return { error: "saveFailed" };

  revalidatePath(`/projekte/${projectId}/sanitaer`, "layout");
  return {};
}

export async function deleteSanitarySystem(id: string, projectId: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!ids(id, projectId)) return { error: "invalidInput" };
  const supabase = await createClient();
  const { error } = await supabase.from("sanitary_systems").delete().eq("id", id).eq("project_id", projectId);
  if (error) return { error: "deleteFailed" };
  revalidatePath(`/projekte/${projectId}/sanitaer`, "layout");
  redirect(`/projekte/${projectId}/sanitaer`);
}

const schemaPrintSchema = z.object({
  phase: z.string().regex(/^\d{2}$/).nullable(),
  comment: z.string().trim().max(80).nullable(),
});

/** Print dialog of the Prinzipschema: SIA phase of the title block and, with a comment, a new revision. */
export async function saveSanitarySchemaPlan(systemId: string, projectId: string, input: { phase: string | null; comment: string | null }): Promise<{ error?: string }> {
  const profile = await assertRole("admin", "planer");
  const parsed = schemaPrintSchema.safeParse(input);
  if (!ids(systemId, projectId) || !parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { data: system } = await supabase.from("sanitary_systems").select("schema_plan").eq("id", systemId).eq("project_id", projectId).maybeSingle();
  if (!system) return { error: "invalidInput" };
  const plan = parseSchemaPlan(system.schema_plan);
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
    .from("sanitary_systems")
    .update({ schema_plan: { phase: parsed.data.phase, revisions } as unknown as Json })
    .eq("id", systemId)
    .eq("project_id", projectId);
  if (error) return { error: "saveFailed" };
  revalidatePath(`/projekte/${projectId}/sanitaer/${systemId}`);
  return {};
}

const makeLabel: Record<AppLanguage, { make: string; number: string }> = {
  de: { make: "Fabrikat", number: "Art.-Nr." },
  fr: { make: "Fabricant", number: "N° d’art." },
  it: { make: "Fabbricante", number: "N. art." },
};

const groupKeys = ["pipes", "valves", "central", "insulation"] as const;
const targetsSchema = z.record(z.enum(groupKeys), z.uuid().nullable());

/**
 * Inserts the material list of a Sanitäranlage into an LV: each group of lines (Rohre, Armaturen, Zentrale, Dämmung)
 * into its chosen chapter, groups without one into a new group `groupTitle`. Articles of the IGH catalogues of
 * Nussbaum, Biral and Meier Tobler become catalogue positions (text, unit, price); the rest R-positions.
 */
export async function insertSanitaryQuantities(
  systemId: string,
  projectId: string,
  lvId: string,
  groupTitle: string,
  targets: Partial<Record<(typeof groupKeys)[number], string | null>> = {},
): Promise<{ error?: string; count?: number }> {
  await assertRole("admin", "planer");
  const parsedTargets = targetsSchema.safeParse(targets);
  if (!ids(systemId, projectId, lvId) || !parsedTargets.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const [{ data: system }, { data: lv }] = await Promise.all([
    supabase.from("sanitary_systems").select("data").eq("id", systemId).eq("project_id", projectId).maybeSingle(),
    supabase.from("lvs").select("id, language").eq("id", lvId).eq("project_id", projectId).maybeSingle(),
  ]);
  if (!system || !lv) return { error: "invalidInput" };

  const data = parseSanitaryData(system.data);
  const quantities = systemQuantities(data, evaluateSystem(data)).filter((q) => q.quantity > 0);
  if (!quantities.length) return { error: "invalidInput" };

  // Chapters must be groups of this LV; lines without one need the title of the new group.
  const chosen = [...new Set(Object.values(parsedTargets.data).filter((v): v is string => !!v))];
  const { data: groups } = chosen.length
    ? await supabase.from("lv_nodes").select("id").eq("lv_id", lvId).eq("kind", "group").in("id", chosen)
    : { data: [] as { id: string }[] };
  const valid = new Set((groups ?? []).map((g) => g.id));
  const chapterOf = (group: (typeof groupKeys)[number]) => {
    const id = parsedTargets.data[group];
    return id && valid.has(id) ? id : null;
  };
  const needsGroup = quantities.some((q) => !chapterOf(q.group));
  const title = nameSchema.safeParse(groupTitle);
  if (needsGroup && !title.success) return { error: "invalidInput" };

  const articles = [...new Set(quantities.flatMap((q) => (q.article ? [q.article.replace(/\s+/g, "")] : [])))];
  const { data: catalogs } = await supabase
    .from("catalogs")
    .select("id, supplier")
    .eq("source", "igh")
    .or("name.ilike.%nussbaum%,name.ilike.%biral%,name.ilike.%meier tobler%");
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
  const byArticle = new Map((entries ?? []).map((e) => [e.article_number, e]));
  const supplierOf = new Map((catalogs ?? []).map((c) => [c.id, c.supplier]));

  const language = lv.language as AppLanguage;
  const groupId = crypto.randomUUID();
  const rows: Record<string, unknown>[] = needsGroup
    ? [{ id: groupId, lv_id: lvId, parent_id: null, kind: "group", short_text: { [language]: title.data }, long_text: {}, sort: 1_000_000 }]
    : [];
  let sort = 1_000_001;
  for (const q of quantities) {
    const parentId = chapterOf(q.group) ?? groupId;
    const entry = q.article ? byArticle.get(q.article.replace(/\s+/g, "")) : undefined;
    if (entry) {
      const longText = { ...(entry.long_text as Record<string, string>) };
      const supplier = supplierOf.get(entry.catalog_id);
      if (supplier && entry.article_number) {
        for (const l of Object.keys(entry.short_text as object).length ? (Object.keys(entry.short_text as object) as AppLanguage[]) : [language]) {
          longText[l] = [longText[l], `${makeLabel[l].make}: ${supplier}, ${makeLabel[l].number} ${entry.article_number}`].filter(Boolean).join("\n");
        }
      }
      rows.push({
        id: crypto.randomUUID(),
        lv_id: lvId,
        parent_id: parentId,
        kind: "position",
        short_text: entry.short_text,
        long_text: longText,
        unit: entry.unit ?? q.unit,
        quantity: q.quantity,
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
        short_text: { [language]: q.label },
        long_text: q.article ? { [language]: `${makeLabel[language].make}: ${q.manufacturer ?? ""}, ${makeLabel[language].number} ${q.article}` } : {},
        unit: q.unit,
        quantity: q.quantity,
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
