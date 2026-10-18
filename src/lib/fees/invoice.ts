import { feeTotals } from "./calc";
import type { FeeOfferData } from "./offer-schema";
import { type FeePhase, feePhases, type FeeTrade, feeTrades } from "./sia108";

// Honorarrechnung (fee_invoices.data): the cumulative Leistungsstand in % per trade and phase and per Zusatzposition
// of the accepted offer. An invoice bills everything earned so far minus what the previous invoice of the same
// offer had earned (SIA Teilrechnung with Akonto-Abzug); Rabatt and Nebenkosten apply pro rata as in the offer.

export const feeInvoiceStatuses = ["draft", "sent", "paid"] as const;
export type FeeInvoiceStatus = (typeof feeInvoiceStatuses)[number];

export type FeeInvoiceData = {
  /** Leistungsstand 0–100 % per trade and phase (missing = 0). */
  progress: Partial<Record<FeeTrade, Partial<Record<FeePhase, number>>>>;
  /** Leistungsstand 0–100 % per Zusatzposition id. */
  extras: Record<string, number>;
  /** Remark printed above the table. */
  text: string;
};

const record = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const pct = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null);

export function parseFeeInvoiceData(raw: unknown): FeeInvoiceData {
  const v = record(raw);
  const progress: FeeInvoiceData["progress"] = {};
  for (const trade of feeTrades) {
    const phases = record(record(v.progress)[trade]);
    const out: Partial<Record<FeePhase, number>> = {};
    for (const phase of feePhases) {
      const p = pct(phases[phase]);
      if (p) out[phase] = p;
    }
    if (Object.keys(out).length) progress[trade] = out;
  }
  const extras: Record<string, number> = {};
  for (const [id, value] of Object.entries(record(v.extras))) {
    const p = pct(value);
    if (id.length <= 60 && p) extras[id] = p;
  }
  return { progress, extras, text: typeof v.text === "string" ? v.text.slice(0, 2000) : "" };
}

export const emptyInvoiceData = (): FeeInvoiceData => ({ progress: {}, extras: {}, text: "" });

const round2 = (value: number) => Math.round(value * 100) / 100;
const roundTo5Rappen = (value: number) => Math.round(value * 20) / 20;

export type InvoiceLine = {
  /** Fee of the offer for this line. */
  fee: number;
  pct: number;
  prevPct: number;
  /** Earned so far (fee × pct) and by the previous invoice. */
  earned: number;
  prevEarned: number;
  /** earned − prevEarned. */
  amount: number;
};

export type InvoiceTradeLines = { trade: FeeTrade; phases: ({ phase: FeePhase } & InvoiceLine)[] };

/** Cumulative sums of one Leistungsstand: earned fees, Rabatt, Nebenkosten and the net amount. */
type Cumulative = { fees: number; extras: number; subtotal: number; discount: number; expenses: number; net: number };

export type InvoiceTotals = {
  trades: InvoiceTradeLines[];
  extras: ({ id: string; text: string } & InvoiceLine)[];
  current: Cumulative;
  previous: Cumulative;
  /** This invoice: net = current.net − previous.net, MwSt. and total (5 Rp.). */
  net: number;
  vat: number;
  total: number;
};

const line = (fee: number, pct: number, prevPct: number): InvoiceLine => {
  const earned = round2((fee * pct) / 100);
  const prevEarned = round2((fee * prevPct) / 100);
  return { fee, pct, prevPct, earned, prevEarned, amount: round2(earned - prevEarned) };
};

function cumulative(offer: FeeOfferData, fees: number, extras: number): Cumulative {
  const subtotal = round2(fees + extras);
  const discount = round2((subtotal * offer.discountPct) / 100);
  const expenses = round2(((subtotal - discount) * offer.expensesPct) / 100);
  return { fees, extras, subtotal, discount, expenses, net: round2(subtotal - discount + expenses) };
}

/** Lines and totals of an invoice; `previous` is the data of the previous invoice of the offer (null = first). */
export function invoiceTotals(offer: FeeOfferData, vatRate: number, data: FeeInvoiceData, previous: FeeInvoiceData | null): InvoiceTotals {
  const fees = feeTotals(offer, vatRate);
  const trades = fees.trades.map((t) => ({
    trade: t.trade,
    phases: t.phases.map((p) => ({
      phase: p.phase,
      ...line(p.amount ?? 0, data.progress[t.trade]?.[p.phase] ?? 0, previous?.progress[t.trade]?.[p.phase] ?? 0),
    })),
  }));
  const extras = offer.extras
    .filter((e) => e.amount)
    .map((e) => ({ id: e.id, text: e.text, ...line(e.amount ?? 0, data.extras[e.id] ?? 0, previous?.extras[e.id] ?? 0) }));

  const sum = (key: "earned" | "prevEarned") => ({
    fees: round2(trades.reduce((s, t) => s + t.phases.reduce((a, p) => a + p[key], 0), 0)),
    extras: round2(extras.reduce((s, e) => s + e[key], 0)),
  });
  const cur = sum("earned");
  const prev = sum("prevEarned");
  const current = cumulative(offer, cur.fees, cur.extras);
  const before = cumulative(offer, prev.fees, prev.extras);
  const net = round2(current.net - before.net);
  const vat = round2((net * vatRate) / 100);
  return { trades, extras, current, previous: before, net, vat, total: roundTo5Rappen(net + vat) };
}
