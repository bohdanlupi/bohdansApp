// Cost plan (BKP / eBKP-H) rows with roll-ups along the code hierarchy.

import { pickText, type I18nText } from "@/lib/i18n-text";
import type { AppLanguage } from "@/lib/supabase/types";
import { round2 } from "@/lib/tree";

export type CostItem = { id: string; parent_id: string | null; code: string; name: I18nText; sort: number };
export type CostValues = { budget: number | null; manual_amount: number | null; note: string | null };

export type CostRow = {
  item: CostItem;
  depth: number;
  name: string;
  hasChildren: boolean;
  /** Values entered on this code itself. */
  own: { budget: number | null; lv: number; manual: number | null; note: string | null };
  /** Own values plus all descendants. */
  total: { budget: number; lv: number; manual: number; kv: number };
  /** Whether this code or a descendant has any amount. */
  used: boolean;
};

/** Rows in code order with totals rolled up to the parents. */
export function costRows(
  items: CostItem[],
  values: Map<string, CostValues>,
  lvAmounts: Map<string, number>,
  language: AppLanguage,
): CostRow[] {
  const children = new Map<string, CostItem[]>();
  for (const item of [...items].sort((a, b) => compareCodes(a.code, b.code))) {
    const key = item.parent_id ?? "";
    children.set(key, [...(children.get(key) ?? []), item]);
  }

  const rows: CostRow[] = [];
  const walk = (parentId: string, depth: number): CostRow["total"] => {
    const sum = { budget: 0, lv: 0, manual: 0, kv: 0 };
    for (const item of children.get(parentId) ?? []) {
      const v = values.get(item.id);
      const row: CostRow = {
        item,
        depth,
        name: pickText(item.name, language).value,
        hasChildren: (children.get(item.id)?.length ?? 0) > 0,
        own: { budget: v?.budget ?? null, lv: lvAmounts.get(item.id) ?? 0, manual: v?.manual_amount ?? null, note: v?.note ?? null },
        total: { budget: 0, lv: 0, manual: 0, kv: 0 },
        used: false,
      };
      rows.push(row);
      const below = walk(item.id, depth + 1);
      row.total = {
        budget: round2((row.own.budget ?? 0) + below.budget),
        lv: round2(row.own.lv + below.lv),
        manual: round2((row.own.manual ?? 0) + below.manual),
        kv: 0,
      };
      row.total.kv = round2(row.total.lv + row.total.manual);
      row.used = row.total.budget !== 0 || row.total.kv !== 0 || Boolean(row.own.note);
      for (const key of ["budget", "lv", "manual", "kv"] as const) sum[key] = round2(sum[key] + row.total[key]);
    }
    return sum;
  };
  const grand = walk("", 0);
  rows.push({
    item: { id: "", parent_id: null, code: "", name: {}, sort: Number.MAX_SAFE_INTEGER },
    depth: -1,
    name: "",
    hasChildren: true,
    own: { budget: null, lv: 0, manual: null, note: null },
    total: grand,
    used: true,
  });
  return rows;
}

/** Parent of a code = the longest other code that is a prefix of it ("242" → "24", "D05" → "D"). */
export function parentCode(code: string, codes: string[]): string | null {
  return (
    codes
      .filter((c) => c !== code && code.startsWith(c))
      .sort((a, b) => b.length - a.length)[0] ?? null
  );
}

/** Natural sort key so that "9" < "10" within a level and letters stay in order. */
export function compareCodes(a: string, b: string) {
  return a.localeCompare(b, "de-CH", { numeric: true });
}

export type CostItemOption = { id: string; label: string; depth: number };

/** Select options in hierarchy order, e.g. "242 Wärmeerzeugung" (indented by depth). */
export function costItemOptions(items: CostItem[], language: AppLanguage): CostItemOption[] {
  return costRows(items, new Map(), new Map(), language)
    .filter((row) => row.item.id)
    .map((row) => ({ id: row.item.id, label: `${row.item.code} ${row.name}`, depth: row.depth }));
}
