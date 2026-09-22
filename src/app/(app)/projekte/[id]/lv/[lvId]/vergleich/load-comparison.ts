import "server-only";

import type { I18nText } from "@/lib/i18n-text";
import { offerGross, offerTotals, type OfferTotals } from "@/lib/offer-math";
import type { AppLanguage } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/server";
import { flatten, groupTotals, type NodeKind } from "@/lib/tree";

export type ComparisonNode = {
  id: string;
  parent_id: string | null;
  kind: NodeKind;
  sort: number;
  number: string | null;
  short_text: I18nText;
  unit: string | null;
  quantity: number | null;
  unit_price: number | null;
  is_optional: boolean;
  is_lump_sum: boolean;
  depth: number;
};

export type ComparisonBidder = {
  id: string;
  company: { id: string; name: string; street: string | null; zip: string | null; city: string | null; language: AppLanguage };
  contact: { first_name: string | null; last_name: string; salutation: string | null; language: AppLanguage | null } | null;
  offer_received_at: string | null;
  offer_reference: string | null;
  terms: { discount_pct: number; skonto_pct: number; other_deductions: number; vat_pct: number };
  prices: Record<string, number | null>;
  /** Group totals of this offer (group id → gross amount). */
  groupTotals: Record<string, number>;
  totals: OfferTotals;
  missing: number;
  rank: number;
};

/** LV, positions, offered bidders (ranked by total incl. VAT) and the estimate for the comparison. */
export async function loadComparison(lvId: string) {
  const supabase = await createClient();
  const [{ data: lv }, { data: nodes }, { data: bidders }, { data: prices }, { data: firm }] = await Promise.all([
    supabase.from("lvs").select("*, project:projects(id, number, name, city, street, zip)").eq("id", lvId).maybeSingle(),
    supabase.from("lv_nodes").select("id, parent_id, kind, sort, number, short_text, unit, quantity, unit_price, is_optional, is_lump_sum").eq("lv_id", lvId),
    supabase
      .from("lv_bidders")
      .select(
        "*, company:companies(id, name, street, zip, city, language), contact:contacts(first_name, last_name, salutation, language)",
      )
      .eq("lv_id", lvId)
      .eq("status", "offered"),
    supabase.from("offer_prices").select("lv_bidder_id, lv_node_id, unit_price").eq("lv_id", lvId),
    supabase.from("firm_settings").select("*").eq("id", true).single(),
  ]);
  if (!lv || !lv.project || !firm) return null;

  const rows: ComparisonNode[] = flatten(nodes ?? []).map(({ node, depth }) => ({ ...node, short_text: node.short_text as I18nText, depth }));
  const positions = rows.filter((r) => r.kind === "position" || r.kind === "r_position");

  const priceMaps = new Map<string, Map<string, number | null>>();
  for (const p of prices ?? []) {
    if (!priceMaps.has(p.lv_bidder_id)) priceMaps.set(p.lv_bidder_id, new Map());
    priceMaps.get(p.lv_bidder_id)!.set(p.lv_node_id, p.unit_price);
  }

  const list: ComparisonBidder[] = (bidders ?? [])
    .filter((b) => b.company)
    .map((b) => {
      const map = priceMaps.get(b.id) ?? new Map<string, number | null>();
      const terms = { discount_pct: b.discount_pct, skonto_pct: b.skonto_pct, other_deductions: b.other_deductions, vat_pct: b.vat_pct };
      // Group totals use the offered prices in place of the estimate prices.
      const offered = rows.map((r) => ({ ...r, unit_price: map.get(r.id) ?? null }));
      return {
        id: b.id,
        company: b.company!,
        contact: b.contact,
        offer_received_at: b.offer_received_at,
        offer_reference: b.offer_reference,
        terms,
        prices: Object.fromEntries(map),
        groupTotals: Object.fromEntries(groupTotals(offered)),
        totals: offerTotals(offerGross(rows, map), terms),
        missing: positions.filter((p) => map.get(p.id) === null || map.get(p.id) === undefined).length,
        rank: 0,
      };
    })
    .sort((a, b) => a.totals.total - b.totals.total);
  list.forEach((b, i) => (b.rank = i + 1));

  const estimateGross = offerGross(rows, new Map(rows.map((r) => [r.id, r.unit_price])));
  const estimate = offerTotals(estimateGross, { discount_pct: 0, skonto_pct: 0, other_deductions: 0, vat_pct: firm.vat_rate });

  return {
    lv,
    project: lv.project,
    firm,
    rows,
    bidders: list,
    estimate,
    estimateGroups: Object.fromEntries(groupTotals(rows)),
  };
}

export type Comparison = NonNullable<Awaited<ReturnType<typeof loadComparison>>>;
