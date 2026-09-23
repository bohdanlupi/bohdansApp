"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertRole } from "@/lib/auth";
import type { Database, Json, Tables } from "@/lib/supabase/database.types";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import type { AppLanguage } from "@/lib/supabase/types";
import { CATALOG_PAGE_SIZE, descendants, moveNode, renumber, type NodeKind, type TreeNode } from "@/lib/tree";

// Catalogue and LV nodes share their columns; only the table and the owner column differ.
// The casts below pick the LV types for both, which is safe for the shared columns used here.
export type TreeScope = { type: "catalog" | "lv"; id: string };

type Result = { error?: string; id?: string };

/** The most entries copied into an LV at once. */
const MAX_INSERT = 5000;

const articleLabels: Record<AppLanguage, { make: string; number: string }> = {
  de: { make: "Fabrikat", number: "Art.-Nr." },
  fr: { make: "Fabricant", number: "N° d’art." },
  it: { make: "Fabbricante", number: "N. art." },
};

const scopeSchema = z.object({ type: z.enum(["catalog", "lv"]), id: z.uuid() });

function tableOf(scope: TreeScope) {
  return {
    table: (scope.type === "lv" ? "lv_nodes" : "catalog_nodes") as "lv_nodes",
    owner: (scope.type === "lv" ? "lv_id" : "catalog_id") as "lv_id",
  };
}

function revalidate(scope: TreeScope) {
  if (scope.type === "lv") revalidatePath("/projekte/[id]/lv/[lvId]", "layout");
  else revalidatePath("/kataloge/[id]", "page");
}

async function loadNodes(scope: TreeScope): Promise<TreeNode[]> {
  const supabase = await createClient();
  const { table, owner } = tableOf(scope);
  return fetchAll((from, to) =>
    supabase.from(table).select("id, parent_id, kind, sort, number").eq(owner, scope.id).order("id").range(from, to),
  );
}

/** Supplier (IGH) catalogues are read-only; they are replaced by re-importing them. */
async function isReadOnly(scope: TreeScope) {
  if (scope.type !== "catalog") return false;
  const supabase = await createClient();
  const { data } = await supabase.from("catalogs").select("source").eq("id", scope.id).maybeSingle();
  return data?.source !== "own";
}

/** Writes changed parent/sort/number values back (one upsert). */
async function saveLayout(scope: TreeScope, nodes: TreeNode[]) {
  const changed = renumber(nodes);
  if (!changed.length) return;
  const supabase = await createClient();
  const { table, owner } = tableOf(scope);
  const { error } = await supabase
    .from(table)
    .upsert(changed.map((n) => ({ id: n.id, [owner]: scope.id, kind: n.kind, parent_id: n.parent_id, sort: n.sort, number: n.number })) as never[]);
  if (error) throw error;
}

const addSchema = z.object({
  kind: z.enum(["group", "position", "r_position", "text"]),
  parentId: z.uuid().nullable(),
  beforeId: z.uuid().nullable(),
});

export async function addTreeNode(scope: TreeScope, input: z.input<typeof addSchema>): Promise<Result> {
  await assertRole("admin", "planer");
  const s = scopeSchema.safeParse(scope);
  const parsed = addSchema.safeParse(input);
  if (!s.success || !parsed.success) return { error: "invalidInput" };
  if (scope.type === "catalog" && parsed.data.kind === "r_position") return { error: "invalidInput" };
  if (await isReadOnly(scope)) return { error: "catalogReadOnly" };

  const supabase = await createClient();
  const { table, owner } = tableOf(scope);
  const { data, error } = await supabase
    .from(table)
    .insert({ [owner]: scope.id, kind: parsed.data.kind, parent_id: parsed.data.parentId, sort: 1_000_000 } as never)
    .select("id")
    .single();
  if (error || !data) return { error: "saveFailed" };

  const moved = moveNode(await loadNodes(scope), data.id, parsed.data.parentId, parsed.data.beforeId);
  if (moved) await saveLayout(scope, moved);
  revalidate(scope);
  return { id: data.id };
}

const textSchema = z.object({ de: z.string(), fr: z.string(), it: z.string() }).partial();
const num = z.number().finite().nullable();

const updateSchema = z.object({
  short_text: textSchema,
  long_text: textSchema,
  unit: z.string().trim().max(20).nullable(),
  quantity: num.optional(),
  unit_price: num,
  is_optional: z.boolean().optional(),
  is_lump_sum: z.boolean().optional(),
  price_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  cost_plan_item_id: z.uuid().nullable().optional(),
});
export type NodeUpdate = z.input<typeof updateSchema>;

const cleanText = (text: Record<string, string | undefined>): Json =>
  Object.fromEntries(Object.entries(text).map(([k, v]) => [k, v?.trim() ?? ""]).filter(([, v]) => v));

export async function updateTreeNode(scope: TreeScope, nodeId: string, input: NodeUpdate): Promise<Result> {
  await assertRole("admin", "planer");
  const s = scopeSchema.safeParse(scope);
  const parsed = updateSchema.safeParse(input);
  if (!s.success || !parsed.success || !z.uuid().safeParse(nodeId).success) return { error: "invalidInput" };
  if (await isReadOnly(scope)) return { error: "catalogReadOnly" };

  const { short_text, long_text, unit, quantity, unit_price, is_optional, is_lump_sum, price_date, cost_plan_item_id } = parsed.data;
  const values =
    scope.type === "lv"
      ? {
          short_text: cleanText(short_text),
          long_text: cleanText(long_text),
          unit: is_lump_sum ? null : unit || null,
          ...(is_lump_sum ? { quantity: 1 } : quantity !== undefined && { quantity }),
          unit_price,
          is_optional: is_optional ?? false,
          is_lump_sum: is_lump_sum ?? false,
          ...(cost_plan_item_id !== undefined && { cost_plan_item_id }),
        }
      : { short_text: cleanText(short_text), long_text: cleanText(long_text), unit: unit || null, unit_price, price_date: price_date ?? null };

  const supabase = await createClient();
  const { table, owner } = tableOf(scope);
  const { error } = await supabase.from(table).update(values as never).eq("id", nodeId).eq(owner, scope.id);
  if (error) return { error: "saveFailed" };

  revalidate(scope);
  return {};
}

export async function deleteTreeNode(scope: TreeScope, nodeId: string): Promise<Result> {
  await assertRole("admin", "planer");
  if (!scopeSchema.safeParse(scope).success || !z.uuid().safeParse(nodeId).success) return { error: "invalidInput" };
  if (await isReadOnly(scope)) return { error: "catalogReadOnly" };

  const supabase = await createClient();
  const { table, owner } = tableOf(scope);
  const { error } = await supabase.from(table).delete().eq("id", nodeId).eq(owner, scope.id);
  if (error) return { error: "deleteFailed" };

  await saveLayout(scope, await loadNodes(scope));
  revalidate(scope);
  return {};
}

export async function moveTreeNode(
  scope: TreeScope,
  nodeId: string,
  parentId: string | null,
  beforeId: string | null,
): Promise<Result> {
  await assertRole("admin", "planer");
  if (!scopeSchema.safeParse(scope).success) return { error: "invalidInput" };
  if (await isReadOnly(scope)) return { error: "catalogReadOnly" };

  const moved = moveNode(await loadNodes(scope), nodeId, parentId, beforeId);
  if (!moved) return { error: "invalidMove" };
  await saveLayout(scope, moved);
  revalidate(scope);
  return {};
}

/** Copies catalogue nodes (groups with their whole subtree) into an LV. */
export async function insertFromCatalog(
  lvId: string,
  catalogNodeIds: string[],
  parentId: string | null,
  beforeId: string | null,
): Promise<Result> {
  await assertRole("admin", "planer");
  if (!z.uuid().safeParse(lvId).success || !z.array(z.uuid()).min(1).max(2000).safeParse(catalogNodeIds).success) {
    return { error: "invalidInput" };
  }

  const supabase = await createClient();
  let source: Tables<"catalog_nodes">[];
  try {
    source = await fetchAll((from, to) => supabase.rpc("catalog_subtrees", { p_ids: catalogNodeIds }).range(from, to));
  } catch {
    return { error: "saveFailed" };
  }
  if (!source.length) return { error: "invalidInput" };
  if (source.length > MAX_INSERT) return { error: "tooManyEntries" };

  // Supplier articles keep their make and article number in the LV text.
  const { data: suppliers } = await supabase
    .from("catalogs")
    .select("id, supplier")
    .in("id", [...new Set(source.map((n) => n.catalog_id))])
    .eq("source", "igh");
  const supplierOf = new Map((suppliers ?? []).map((c) => [c.id, c.supplier]));
  const longText = (node: Tables<"catalog_nodes">): Json => {
    const supplier = supplierOf.get(node.catalog_id);
    if (!supplier || !node.article_number) return node.long_text;
    const text = { ...(node.long_text as Record<string, string>) };
    const languages = Object.keys(node.short_text as object) as AppLanguage[];
    for (const l of languages.length ? languages : (["de"] as const)) {
      const line = `${articleLabels[l].make}: ${supplier}, ${articleLabels[l].number} ${node.article_number}`;
      text[l] = [text[l], line].filter(Boolean).join("\n");
    }
    return text;
  };

  // Selected nodes whose ancestor is also selected are copied as part of that ancestor.
  const selected = new Set(catalogNodeIds);
  const byId = new Map(source.map((n) => [n.id, n]));
  const hasSelectedAncestor = (id: string) => {
    for (let p = byId.get(id)?.parent_id; p; p = byId.get(p)?.parent_id) if (selected.has(p)) return true;
    return false;
  };
  // sort is the document order within a catalogue.
  const order = [...source].sort((a, b) => a.sort - b.sort);
  const roots = order.filter((n) => selected.has(n.id) && !hasSelectedAncestor(n.id));

  const newId = new Map<string, string>();
  const rows: {
    id: string;
    lv_id: string;
    parent_id: string | null;
    kind: NodeKind;
    short_text: Json;
    long_text: Json;
    unit: string | null;
    quantity: number | null;
    unit_price: number | null;
    source_catalog_node_id: string;
    sort: number;
  }[] = [];
  let sort = 1_000_000;
  for (const root of roots) {
    for (const node of [root, ...descendants(source, root.id)]) {
      const id = crypto.randomUUID();
      newId.set(node.id, id);
      rows.push({
        id,
        lv_id: lvId,
        parent_id: node.id === root.id ? parentId : newId.get(node.parent_id!)!,
        kind: node.kind,
        short_text: node.short_text,
        long_text: longText(node),
        unit: node.unit,
        quantity: null,
        unit_price: node.unit_price,
        source_catalog_node_id: node.id,
        sort: sort++,
      });
    }
  }

  const { error } = await supabase.from("lv_nodes").insert(rows);
  if (error) return { error: "saveFailed" };

  // Place the copied roots, in catalogue order, before `beforeId`.
  let nodes = await loadNodes({ type: "lv", id: lvId });
  for (const root of roots) nodes = moveNode(nodes, newId.get(root.id)!, parentId, beforeId) ?? nodes;
  await saveLayout({ type: "lv", id: lvId }, nodes);

  revalidate({ type: "lv", id: lvId });
  return { id: newId.get(roots[0].id) };
}

// ---------------------------------------------------------------------------
// Vorausmass
// ---------------------------------------------------------------------------

const measurementSchema = z.object({
  description: z.string().trim().max(500).nullable(),
  count: z.number().finite(),
  factor_a: num,
  factor_b: num,
  factor_c: num,
});
export type MeasurementInput = z.input<typeof measurementSchema>;

export async function saveMeasurement(nodeId: string, measurementId: string | null, input: MeasurementInput): Promise<Result> {
  await assertRole("admin", "planer");
  const parsed = measurementSchema.safeParse(input);
  if (!parsed.success || !z.uuid().safeParse(nodeId).success) return { error: "invalidInput" };

  const supabase = await createClient();
  if (measurementId) {
    const { error } = await supabase.from("lv_measurements").update(parsed.data).eq("id", measurementId).eq("lv_node_id", nodeId);
    if (error) return { error: "saveFailed" };
  } else {
    const { count } = await supabase.from("lv_measurements").select("*", { count: "exact", head: true }).eq("lv_node_id", nodeId);
    const { error } = await supabase.from("lv_measurements").insert({ ...parsed.data, lv_node_id: nodeId, sort: count ?? 0 });
    if (error) return { error: "saveFailed" };
  }
  revalidate({ type: "lv", id: nodeId });
  return {};
}

export async function deleteMeasurement(measurementId: string): Promise<Result> {
  await assertRole("admin", "planer");
  if (!z.uuid().safeParse(measurementId).success) return { error: "invalidInput" };
  const supabase = await createClient();
  const { error } = await supabase.from("lv_measurements").delete().eq("id", measurementId);
  if (error) return { error: "deleteFailed" };
  revalidate({ type: "lv", id: measurementId });
  return {};
}

// ---------------------------------------------------------------------------
// Browsing catalogues (supplier catalogues are too large to load at once)
// ---------------------------------------------------------------------------

export type CatalogBrowseNode = Database["public"]["Functions"]["catalog_children"]["Returns"][number];
export type CatalogSearchHit = Database["public"]["Functions"]["search_catalog_nodes"]["Returns"][number];

/** Children of a node (null = top level), one page at a time. */
export async function getCatalogChildren(catalogId: string, parentId: string | null, offset = 0): Promise<CatalogBrowseNode[]> {
  await assertRole("admin", "planer", "viewer");
  if (!z.uuid().safeParse(catalogId).success || !z.uuid().nullable().safeParse(parentId).success) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("catalog_children", {
    p_catalog_id: catalogId,
    // The SQL function treats null as "top level"; the generated type does not know nullable arguments.
    p_parent_id: parentId as string,
    p_offset: Math.max(0, Math.trunc(offset)),
    p_limit: CATALOG_PAGE_SIZE,
  });
  return data ?? [];
}

/** Positions and groups matching all words of the query (number, article number, short text). */
export async function searchCatalog(catalogId: string, query: string): Promise<CatalogSearchHit[]> {
  await assertRole("admin", "planer", "viewer");
  if (!z.uuid().safeParse(catalogId).success || !query.trim()) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("search_catalog_nodes", { p_catalog_id: catalogId, p_query: query.slice(0, 200), p_limit: 200 });
  return data ?? [];
}

/** One catalogue entry with all texts, for the read-only detail panel. */
export async function getCatalogNode(nodeId: string) {
  await assertRole("admin", "planer", "viewer");
  if (!z.uuid().safeParse(nodeId).success) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("catalog_nodes").select("*").eq("id", nodeId).maybeSingle();
  return data;
}
