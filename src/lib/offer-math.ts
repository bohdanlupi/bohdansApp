// Offer totals as used in the Angebotsvergleich (same order as on Swiss offers):
//   Brutto − Rabatt % − weitere Abzüge CHF = Netto − Skonto % = Netto nach Skonto + MwSt % = Total (5 Rp.)

import { isPosition, round2, type TreeNode } from "@/lib/tree";

export type OfferTerms = {
  discount_pct: number;
  skonto_pct: number;
  other_deductions: number;
  vat_pct: number;
};

export type OfferTotals = {
  gross: number;
  discount: number;
  deductions: number;
  net: number;
  skonto: number;
  netAfterSkonto: number;
  vat: number;
  total: number;
};

/** Negated amount for deduction lines, without printing "-0.00". */
export const minus = (value: number) => (value ? -value : 0);

export const roundTo5Rappen = (value: number) => Math.round(round2(value) * 20) / 20;

export function offerTotals(gross: number, terms: OfferTerms): OfferTotals {
  const discount = round2((gross * terms.discount_pct) / 100);
  const deductions = round2(terms.other_deductions);
  const net = round2(gross - discount - deductions);
  const skonto = round2((net * terms.skonto_pct) / 100);
  const netAfterSkonto = round2(net - skonto);
  const vat = round2((netAfterSkonto * terms.vat_pct) / 100);
  return { gross: round2(gross), discount, deductions, net, skonto, netAfterSkonto, vat, total: roundTo5Rappen(netAfterSkonto + vat) };
}

type PricedNode = TreeNode & { quantity: number | null; is_optional: boolean };

/** Gross total of an offer: Σ quantity × offered unit price over non-optional positions. */
export function offerGross(nodes: PricedNode[], prices: Map<string, number | null>): number {
  let sum = 0;
  for (const node of nodes) {
    if (!isPosition(node.kind) || node.is_optional) continue;
    const price = prices.get(node.id);
    if (price !== null && price !== undefined) sum = round2(sum + round2((node.quantity ?? 0) * price));
  }
  return sum;
}

/** Deviation in percent from a reference (e.g. the estimate); null without reference. */
export const deviationPct = (value: number, reference: number) => (reference ? ((value - reference) / reference) * 100 : null);
