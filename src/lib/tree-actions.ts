"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertRole } from "@/lib/auth";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { descendants, flatten, moveNode, renumber, type NodeKind, type TreeNode } from "@/lib/tree";

// Catalogue and LV nodes share their columns; only the table and the owner column differ.
// The casts below pick the LV types for both, which is safe for the shared columns used here.
export type TreeScope = { type: "catalog" | "lv"; id: string };

type Result = { error?: string; id?: string };

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
  const { data, error } = await supabase.from(table).select("id, parent_id, kind, sort, number").eq(owner, scope.id);
  if (error) throw error;
  return data;
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
});
export type NodeUpdate = z.input<typeof updateSchema>;

const cleanText = (text: Record<string, string | undefined>): Json =>
  Object.fromEntries(Object.entries(text).map(([k, v]) => [k, v?.trim() ?? ""]).filter(([, v]) => v));

export async function updateTreeNode(scope: TreeScope, nodeId: string, input: NodeUpdate): Promise<Result> {
  await assertRole("admin", "planer");
  const s = scopeSchema.safeParse(scope);
  const parsed = updateSchema.safeParse(input);
  if (!s.success || !parsed.success || !z.uuid().safeParse(nodeId).success) return { error: "invalidInput" };

  const { short_text, long_text, unit, quantity, unit_price, is_optional, is_lump_sum, price_date } = parsed.data;
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
  const { data: picked } = await supabase.from("catalog_nodes").select("catalog_id").in("id", catalogNodeIds);
  const catalogIds = [...new Set((picked ?? []).map((n) => n.catalog_id))];
  if (!catalogIds.length) return { error: "invalidInput" };
  const { data: source } = await supabase.from("catalog_nodes").select("*").in("catalog_id", catalogIds);
  if (!source) return { error: "saveFailed" };

  // Selected nodes whose ancestor is also selected are copied as part of that ancestor.
  const selected = new Set(catalogNodeIds);
  const byId = new Map(source.map((n) => [n.id, n]));
  const hasSelectedAncestor = (id: string) => {
    for (let p = byId.get(id)?.parent_id; p; p = byId.get(p)?.parent_id) if (selected.has(p)) return true;
    return false;
  };
  const order = flatten(source).map(({ node }) => node);
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
        long_text: node.long_text,
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

/** Nodes of a catalogue, for the "insert from catalogue" dialog. */
export async function getCatalogNodes(catalogId: string) {
  await assertRole("admin", "planer");
  if (!z.uuid().safeParse(catalogId).success) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("catalog_nodes")
    .select("id, parent_id, kind, sort, number, short_text, unit, unit_price")
    .eq("catalog_id", catalogId);
  return data ?? [];
}
