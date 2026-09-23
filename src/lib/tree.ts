// Tree helpers shared by the catalogue and the LV editor (runs on server and client).
//
// Numbering (NPK-like, assigned after every structural change):
//   top-level groups        100, 200, 300, …
//   groups inside a group   110, 120, …   (third level: 111, 112, …)
//   positions in a group    110.101, 110.102, …  (top level: 101, 102, …)
//   texts                   no number
//
// LV groups can have a number set by hand (custom_number, e.g. BKP codes 24 › 242 › 242.0). Groups after it
// continue from it (242 → 243, 242.0 → 242.1), the first subgroup of such a group gets 241 (below a one- or
// two-digit number) or 242.0, and positions keep .101, .102, … (242.1.101).

import type { Enums } from "@/lib/supabase/database.types";

export type NodeKind = Enums<"node_kind">;

export type TreeNode = {
  id: string;
  parent_id: string | null;
  kind: NodeKind;
  sort: number;
  number: string | null;
  /** LV groups only: number set by hand (null = automatic). */
  custom_number?: string | null;
};

/** Entries of a group loaded at once when browsing a catalogue ("show more" loads the next page). */
export const CATALOG_PAGE_SIZE = 500;

export const isPosition = (kind: NodeKind) => kind === "position" || kind === "r_position";

/** Children per parent id ("" = root), each list ordered by sort. */
export function childrenMap<T extends TreeNode>(nodes: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const node of [...nodes].sort((a, b) => a.sort - b.sort)) {
    const key = node.parent_id ?? "";
    const list = map.get(key);
    if (list) list.push(node);
    else map.set(key, [node]);
  }
  return map;
}

/** Nodes in document order with their depth (0 = top level). */
export function flatten<T extends TreeNode>(nodes: T[]): { node: T; depth: number }[] {
  const children = childrenMap(nodes);
  const result: { node: T; depth: number }[] = [];
  const walk = (parentId: string, depth: number) => {
    for (const node of children.get(parentId) ?? []) {
      result.push({ node, depth });
      walk(node.id, depth + 1);
    }
  };
  walk("", 0);
  return result;
}

/** All descendants of a node (not including the node). */
export function descendants<T extends TreeNode>(nodes: T[], id: string): T[] {
  const children = childrenMap(nodes);
  const result: T[] = [];
  const walk = (parentId: string) => {
    for (const child of children.get(parentId) ?? []) {
      result.push(child);
      walk(child.id);
    }
  };
  walk(id);
  return result;
}

/**
 * The selected nodes that have no selected ancestor, in document order. A selected group stands for its
 * whole subtree, so its selected descendants are not handled separately (delete, copy, move).
 */
export function topmostSelected<T extends TreeNode>(nodes: T[], ids: Iterable<string>): T[] {
  const selected = new Set(ids);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hasSelectedAncestor = (node: T) => {
    for (let p = node.parent_id; p; p = byId.get(p)?.parent_id ?? null) if (selected.has(p)) return true;
    return false;
  };
  return flatten(nodes)
    .map(({ node }) => node)
    .filter((n) => selected.has(n.id) && !hasSelectedAncestor(n));
}

/**
 * Assigns sort (document order) and numbers. Returns only the nodes whose parent, sort or
 * number changed, ready to be written back.
 */
export function renumber<T extends TreeNode>(nodes: T[]): (T & { sort: number; number: string | null })[] {
  const children = childrenMap(nodes);
  const changed: (T & { sort: number; number: string | null })[] = [];
  let sort = 0;

  // `custom`: the number was set by hand or continues from such a number (then the NPK steps do not apply).
  type Numbered = { number: string; custom: boolean };
  const walk = (parentId: string, parent: Numbered | null, depth: number) => {
    let groupIndex = 0;
    let positionIndex = 0;
    let previous: Numbered | null = null;
    for (const node of children.get(parentId) ?? []) {
      let number: string | null = null;
      let group: Numbered | null = null;
      if (node.kind === "group") {
        groupIndex++;
        const custom = node.custom_number?.trim();
        if (custom) group = { number: custom, custom: true };
        else if (previous?.custom) group = { number: nextNumber(previous.number), custom: true };
        else if (parent?.custom) group = { number: firstChildNumber(parent.number), custom: true };
        else {
          const step = depth === 0 ? 100 : depth === 1 ? 10 : 1;
          group = { number: String(Number(parent?.number ?? 0) + groupIndex * step), custom: false };
        }
        number = group.number;
        previous = group;
      } else if (isPosition(node.kind)) {
        positionIndex++;
        number = parent === null ? String(100 + positionIndex) : `${parent.number}.${100 + positionIndex}`;
      }
      sort++;
      if (node.sort !== sort || node.number !== number) changed.push({ ...node, sort, number });
      walk(node.id, group ?? parent, depth + 1);
    }
  };
  walk("", null, 0);
  return changed;
}

/** Next sibling number: the last run of digits + 1, keeping leading zeros (242 → 243, 242.0 → 242.1, 09 → 10). */
export function nextNumber(number: string): string {
  const match = number.match(/^(.*?)(\d+)(\D*)$/);
  if (!match) return `${number}.1`;
  const [, head, digits, tail] = match;
  return `${head}${String(Number(digits) + 1).padStart(digits.length, "0")}${tail}`;
}

/** Number of the first subgroup: 24 → 241, 242 → 242.0, 242.0 → 242.0.0. */
export function firstChildNumber(number: string): string {
  return /^\d{1,2}$/.test(number) ? `${number}1` : `${number}.0`;
}

/**
 * Moves a node (with its subtree) to `parentId`, before `beforeId` (null = at the end).
 * Returns the updated node list, or null when the move is not allowed (into itself / a descendant,
 * or into a node that is not a group).
 */
export function moveNode<T extends TreeNode>(
  nodes: T[],
  id: string,
  parentId: string | null,
  beforeId: string | null,
): T[] | null {
  if (parentId === id || beforeId === id) return null;
  if (parentId) {
    const parent = nodes.find((n) => n.id === parentId);
    if (!parent || parent.kind !== "group") return null;
    if (descendants(nodes, id).some((d) => d.id === parentId)) return null;
  }

  const moving = nodes.find((n) => n.id === id);
  if (!moving) return null;

  const siblings = (childrenMap(nodes).get(parentId ?? "") ?? []).filter((n) => n.id !== id);
  const index = beforeId ? siblings.findIndex((n) => n.id === beforeId) : -1;
  siblings.splice(index === -1 ? siblings.length : index, 0, { ...moving, parent_id: parentId });

  // Sibling order is expressed through sort; renumber() turns it into document order later.
  const order = new Map(siblings.map((n, i) => [n.id, i]));
  return nodes.map((n) =>
    n.id === id
      ? { ...n, parent_id: parentId, sort: order.get(n.id)! }
      : order.has(n.id)
        ? { ...n, sort: order.get(n.id)! }
        : n,
  );
}

/** Where a new node goes: into a selected group (last), or after the selected node. */
export function insertionPoint<T extends TreeNode>(
  nodes: T[],
  selectedId: string | null,
  kind: NodeKind,
  asChild = false,
): { parentId: string | null; beforeId: string | null } {
  const selected = nodes.find((n) => n.id === selectedId);
  if (!selected) return { parentId: null, beforeId: null };
  if (selected.kind === "group" && (asChild || kind !== "group")) return { parentId: selected.id, beforeId: null };

  const siblings = childrenMap(nodes).get(selected.parent_id ?? "") ?? [];
  const next = siblings[siblings.findIndex((n) => n.id === selected.id) + 1];
  return { parentId: selected.parent_id, beforeId: next?.id ?? null };
}

/** Rounds to Rappen (toPrecision removes float noise, so 4.995 rounds to 5.00 like in Postgres). */
export const round2 = (value: number) => (Math.sign(value) * Math.round(Number(Math.abs(value * 100).toPrecision(12)))) / 100;

type Priced = TreeNode & { quantity?: number | null; unit_price: number | null; is_optional?: boolean };

/** Total of a position (quantity × unit price). */
export const positionTotal = (node: Priced) => round2((node.quantity ?? 0) * (node.unit_price ?? 0));

/** Totals per group id (sum of all non-optional positions below it) plus the overall total under "". */
export function groupTotals<T extends Priced>(nodes: T[]): Map<string, number> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const totals = new Map<string, number>([["", 0]]);
  for (const node of nodes) {
    if (!isPosition(node.kind) || node.is_optional) continue;
    const amount = positionTotal(node);
    totals.set("", round2(totals.get("")! + amount));
    let parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    while (parent) {
      totals.set(parent.id, round2((totals.get(parent.id) ?? 0) + amount));
      parent = parent.parent_id ? byId.get(parent.parent_id) : undefined;
    }
  }
  return totals;
}
