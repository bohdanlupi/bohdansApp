import { type FeeOfferData, phaseShare } from "./offer-schema";
import { baseFactor, type FeePhase, feePhases, type FeeTrade, feeTrades, predictedHours, tradeColumn } from "./sia108";

// Fee of a Honorarofferte: per trade and phase (SIA 108 formula or hours × rates), then the totals
// Honorar + Zusatzpositionen − Rabatt + Nebenkosten = Total exkl. MwSt. + MwSt. = Total inkl. MwSt. (5 Rp.).

export type PhaseFee = { phase: FeePhase; q: number; hours: number | null; amount: number | null };

export type TradeFee = {
  trade: FeeTrade;
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
};

const roundTo5Rappen = (value: number) => Math.round(value * 20) / 20;
const round2 = (value: number) => Math.round(value * 100) / 100;

export const activeTrades = (data: FeeOfferData) => feeTrades.filter((t) => data.trades[t].on);

/**
 * Bp per SIA 108 Art. 7.5.21: the Grundfaktor is computed per Fachgebiet, so Heizung and Kälte (both H/K) use their
 * summed costs when both are offered.
 */
export function factorCosts(data: FeeOfferData, trade: FeeTrade): number | null {
  const column = tradeColumn[trade];
  const costs = activeTrades(data)
    .filter((t) => tradeColumn[t] === column)
    .map((t) => data.trades[t].cost ?? 0);
  const sum = costs.reduce((a, b) => a + b, 0);
  return sum > 0 ? sum : null;
}

export const rateOf = (data: FeeOfferData, id: string) => data.rates.find((r) => r.id === id)?.rate ?? null;

export function tradeFee(data: FeeOfferData, trade: FeeTrade): TradeFee {
  const t = data.trades[trade];
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
      const hours = t.cost && bp ? predictedHours({ b: t.cost, bp, z1, z2, n: t.n, r: t.r, i: t.i, s: t.s, u: t.u }, q) : null;
      return { phase, q, hours, amount: hours === null || h === null ? null : round2(hours * t.s * h) };
    });

  return {
    trade,
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
  const fees = round2(trades.reduce((sum, t) => sum + t.amount, 0));
  const extras = round2(data.extras.reduce((sum, e) => sum + (e.amount ?? 0), 0));
  const subtotal = round2(fees + extras);
  const discount = round2((subtotal * data.discountPct) / 100);
  const expenses = round2(((subtotal - discount) * data.expensesPct) / 100);
  const net = round2(subtotal - discount + expenses);
  const vat = round2((net * vatRate) / 100);
  return { trades, phases, fees, extras, subtotal, discount, expenses, net, vat, total: roundTo5Rappen(net + vat) };
}
