import { type FeeOfferData, type OfferPosition, phaseShare, tradeN } from "./offer-schema";
import {
  type BasisSystem,
  basisSystems,
  type BasisTrade,
  baseFactor,
  defaultBasisPct,
  type FeePhase,
  feePhases,
  type FeeTrade,
  feeTrades,
  isBasisTrade,
  predictedHours,
  tradeColumn,
} from "./sia108";

// Fee of a Honorarofferte: per trade and phase (SIA 108 formula or hours × rates), then the totals
// Honorar + Zusatzpositionen − Rabatt + Nebenkosten = Total exkl. MwSt. + MwSt. = Total inkl. MwSt. (5 Rp.).
// Free offers (kind "positions") take Σ Menge × Ansatz of their positions as Honorar instead.
// Skonto is a payment condition: shown with its amount, the total stays the full amount.

export type PhaseFee = { phase: FeePhase; q: number; hours: number | null; amount: number | null };

export type TradeFee = {
  trade: FeeTrade;
  /** Aufwandbestimmende Baukosten B (Gebäudeautomation / Fachkoordination: the weighted basis Ba). */
  b: number | null;
  n: number;
  /** Faktorbestimmende Baukosten Bp and Grundfaktor p (method "sia"). */
  bp: number | null;
  p: number | null;
  phases: PhaseFee[];
  q: number;
  hours: number;
  amount: number;
  /** Some phase has no amount (costs or Z values missing). */
  incomplete: boolean;
};

export type FeeTotals = {
  trades: TradeFee[];
  /** Phases switched on in any trade, with the sum over the trades. */
  phases: { phase: FeePhase; amount: number }[];
  fees: number;
  extras: number;
  subtotal: number;
  discount: number;
  expenses: number;
  net: number;
  vat: number;
  total: number;
  /** Skonto on the total when paid within the Skonto days (0 without Skonto). */
  skonto: number;
};

const roundTo5Rappen = (value: number) => Math.round(value * 20) / 20;
const round2 = (value: number) => Math.round(value * 100) / 100;

export const activeTrades = (data: FeeOfferData) => (data.kind === "sia" ? feeTrades.filter((t) => data.trades[t].on) : []);

/** Costs of a basis system: entered, else the summed costs of its linked trades in the offer. */
export function linkedCost(data: FeeOfferData, system: BasisSystem): number {
  return (system.link ?? []).reduce((sum, t) => sum + (data.trades[t].on ? (data.trades[t].cost ?? 0) : 0), 0);
}

export type BasisRow = { system: BasisSystem; cost: number; pct: number; amount: number };

/** Basis Ba of Gebäudeautomation (Art. 8.3) or Fachkoordination (Art. 9.7): Σ Anlagekosten × Anteil. */
export function basisRows(data: FeeOfferData, trade: BasisTrade): BasisRow[] {
  return basisSystems[trade].map((system) => {
    const line = data.trades[trade].basis[system.id];
    const cost = line?.cost ?? linkedCost(data, system);
    const pct = line?.pct ?? defaultBasisPct(system);
    return { system, cost, pct, amount: round2((cost * pct) / 100) };
  });
}

/** Aufwandbestimmende Baukosten B of a trade. */
export function tradeCost(data: FeeOfferData, trade: FeeTrade): number | null {
  if (!isBasisTrade(trade)) return data.trades[trade].cost;
  const sum = basisRows(data, trade).reduce((a, r) => a + r.amount, 0);
  return sum > 0 ? round2(sum) : null;
}

/**
 * Bp per SIA 108 Art. 7.5.21: the Grundfaktor is computed per Fachgebiet, so Heizung and Kälte (both H/K) use their
 * summed costs when both are offered.
 */
export function factorCosts(data: FeeOfferData, trade: FeeTrade): number | null {
  const column = tradeColumn[trade];
  const costs = activeTrades(data)
    .filter((t) => tradeColumn[t] === column)
    .map((t) => tradeCost(data, t) ?? 0);
  const sum = costs.reduce((a, b) => a + b, 0);
  return sum > 0 ? sum : null;
}

/** Ansatz of a position: the rate category for hours, else the entered price. */
export function positionPrice(data: FeeOfferData, p: OfferPosition): number | null {
  if (p.unit === "h" && p.rateId) return rateOf(data, p.rateId) ?? p.price;
  return p.price;
}

export const positionAmount = (data: FeeOfferData, p: OfferPosition) => round2((p.qty ?? 0) * (positionPrice(data, p) ?? 0));

export const rateOf = (data: FeeOfferData, id: string) => data.rates.find((r) => r.id === id)?.rate ?? null;

export function tradeFee(data: FeeOfferData, trade: FeeTrade): TradeFee {
  const t = data.trades[trade];
  const b = tradeCost(data, trade);
  const n = tradeN(data, trade);
  const fk = trade === "coordination";
  const bp = factorCosts(data, trade);
  const { z1, z2 } = data.z[tradeColumn[trade]];
  const p = baseFactor(z1, z2, bp);
  const h = rateOf(data, data.siaRateId);

  const phases = feePhases
    .filter((phase) => t.phases[phase].on)
    .map((phase): PhaseFee => {
      const q = phaseShare(data, trade, phase);
      if (data.method === "hours") {
        const entries = Object.entries(t.phases[phase].hours);
        const hours = entries.reduce((sum, [, v]) => sum + v, 0);
        const amount = entries.reduce((sum, [id, v]) => sum + v * (rateOf(data, id) ?? 0), 0);
        return { phase, q, hours, amount: round2(amount) };
      }
      // Fachkoordination: Tm with k instead of U (Art. 9.6.1). Whole hours per phase as displayed, so the fee is
      // hours × s × h exactly.
      const raw = b && bp ? predictedHours({ b, bp, z1, z2, n, r: t.r, i: t.i, s: t.s, u: fk ? 1 : t.u, k: fk ? t.k : 1 }, q) : null;
      const hours = raw === null ? null : Math.round(raw);
      return { phase, q, hours, amount: hours === null || h === null ? null : round2(hours * t.s * h) };
    });

  return {
    trade,
    b,
    n,
    bp,
    p,
    phases,
    q: phases.reduce((sum, ph) => sum + ph.q, 0),
    hours: phases.reduce((sum, ph) => sum + (ph.hours ?? 0), 0),
    amount: round2(phases.reduce((sum, ph) => sum + (ph.amount ?? 0), 0)),
    incomplete: phases.some((ph) => ph.amount === null),
  };
}

export function feeTotals(data: FeeOfferData, vatRate: number): FeeTotals {
  const trades = activeTrades(data).map((t) => tradeFee(data, t));
  const phases = feePhases.flatMap((phase) => {
    const fees = trades.flatMap((t) => t.phases.filter((p) => p.phase === phase));
    return fees.length ? [{ phase, amount: round2(fees.reduce((sum, p) => sum + (p.amount ?? 0), 0)) }] : [];
  });
  const positions = data.kind === "positions";
  const fees = positions ? round2(data.positions.reduce((sum, p) => sum + positionAmount(data, p), 0)) : round2(trades.reduce((sum, t) => sum + t.amount, 0));
  const extras = positions ? 0 : round2(data.extras.reduce((sum, e) => sum + (e.amount ?? 0), 0));
  const subtotal = round2(fees + extras);
  const discount = round2((subtotal * data.discountPct) / 100);
  const expenses = round2(((subtotal - discount) * data.expensesPct) / 100);
  const net = round2(subtotal - discount + expenses);
  const vat = round2((net * vatRate) / 100);
  const total = roundTo5Rappen(net + vat);
  return { trades, phases, fees, extras, subtotal, discount, expenses, net, vat, total, skonto: round2((total * data.skontoPct) / 100) };
}
