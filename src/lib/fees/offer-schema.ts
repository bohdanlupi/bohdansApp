import { z } from "zod";

import { type FeeRate, type FeeSettings, parseRates, parseShares, type ZValues } from "./settings-schema";
import type { ServiceState } from "./services";
import { buildingTypes, defaultShares, factorLimits, type FeePhase, feePhases, type FeeTrade, feeTrades, type PhaseShares, type SiaColumn, siaColumns, tradeColumn } from "./sia108";

// Data of a Honorarofferte (fee_offers.data): fee method, trades with their SIA 108 factors and phases, the
// services per trade and phase, and the copy of the firm settings (rates, Z values, shares) taken at creation.
// Parsed leniently: invalid parts fall back to the defaults one by one.

export type FeeMethod = "sia" | "hours";

export type TradePhase = {
  on: boolean;
  /** Leistungsanteil q in %; null = the offer's default share. */
  q: number | null;
  /** Hours per rate category (method "hours"). */
  hours: Record<string, number>;
};

/** Own service line of a phase with its state per trade (missing trade = not listed). */
export type CustomService = { id: string; phase: FeePhase; text: string; states: Partial<Record<FeeTrade, ServiceState>> };

export type TradeData = {
  on: boolean;
  /** Aufwandbestimmende Baukosten B in CHF exkl. MwSt. */
  cost: number | null;
  buildingType: string | null;
  n: number;
  r: number;
  i: number;
  s: number;
  /** Faktor für Umbauten U (1.0 = Neubau). */
  u: number;
  phases: Record<FeePhase, TradePhase>;
  /** Service choices that differ from the defaults (see services.ts). */
  services: Record<string, ServiceState>;
};

export type ExtraItem = { id: string; text: string; amount: number | null };

export type FeeOfferData = {
  method: FeeMethod;
  trades: Record<FeeTrade, TradeData>;
  rates: FeeRate[];
  siaRateId: string;
  z: Record<SiaColumn, ZValues>;
  shares: Record<SiaColumn, PhaseShares>;
  expensesPct: number;
  discountPct: number;
  expensesText: string;
  /** Projektbeschrieb (building, standard, systems). */
  description: string;
  /** Further Grundlagen, e.g. the project documents with their date. */
  basis: string;
  customServices: CustomService[];
  /** Lump-sum items besides the phase fees (e.g. Fachkoordination, Kanalisationseingabe). */
  extras: ExtraItem[];
};

export const MAX_CUSTOM = 40;
export const MAX_EXTRAS = 20;

const record = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const inRange = (value: unknown, [min, max]: readonly [number, number], fallback: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
const money = z.number().finite().min(0).max(1e10).nullable().catch(null);

function parsePhase(raw: unknown): TradePhase {
  const v = record(raw);
  const hours: Record<string, number> = {};
  for (const [id, h] of Object.entries(record(v.hours))) {
    if (id.length <= 40 && typeof h === "number" && Number.isFinite(h) && h > 0 && h <= 100_000) hours[id] = h;
  }
  return {
    on: v.on === true,
    q: typeof v.q === "number" && Number.isFinite(v.q) && v.q >= 0 && v.q <= 100 ? v.q : null,
    hours,
  };
}

const serviceStates = new Set<ServiceState>(["in", "out", "no"]);

function parseTrade(raw: unknown): TradeData {
  const v = record(raw);
  const services: Record<string, ServiceState> = {};
  for (const [id, state] of Object.entries(record(v.services))) {
    if (id.length <= 60 && serviceStates.has(state as ServiceState)) services[id] = state as ServiceState;
  }
  const phases = record(v.phases);
  return {
    on: v.on === true,
    cost: money.parse(v.cost ?? null),
    buildingType: typeof v.buildingType === "string" && buildingTypes.some((b) => b.id === v.buildingType) ? v.buildingType : null,
    n: inRange(v.n, factorLimits.n, 1),
    r: inRange(v.r, factorLimits.r, 1),
    i: inRange(v.i, factorLimits.i, 1),
    s: inRange(v.s, factorLimits.s, 1),
    u: inRange(v.u, factorLimits.u, 1),
    phases: Object.fromEntries(feePhases.map((p) => [p, parsePhase(phases[p])])) as Record<FeePhase, TradePhase>,
    services,
  };
}

function parseCustomServices(raw: unknown): CustomService[] {
  return (Array.isArray(raw) ? raw : []).flatMap((c): CustomService[] => {
    const o = record(c);
    if (typeof o.id !== "string" || !feePhases.includes(o.phase as FeePhase)) return [];
    const states: Partial<Record<FeeTrade, ServiceState>> = {};
    for (const [trade, state] of Object.entries(record(o.states))) {
      if (feeTrades.includes(trade as FeeTrade) && serviceStates.has(state as ServiceState)) states[trade as FeeTrade] = state as ServiceState;
    }
    return [{ id: o.id.slice(0, 40), phase: o.phase as FeePhase, text: text(o.text, 500), states }];
  }).slice(0, MAX_CUSTOM);
}

function parseExtras(raw: unknown): ExtraItem[] {
  return (Array.isArray(raw) ? raw : []).flatMap((e): ExtraItem[] => {
    const o = record(e);
    if (typeof o.id !== "string") return [];
    return [{ id: o.id.slice(0, 40), text: text(o.text, 300), amount: money.parse(o.amount ?? null) }];
  }).slice(0, MAX_EXTRAS);
}

export function parseFeeOfferData(raw: unknown): FeeOfferData {
  const v = record(raw);
  const trades = record(v.trades);
  const z = record(v.z);
  const shares = record(v.shares);
  const rates = parseRates(v.rates, []);
  return {
    method: v.method === "hours" ? "hours" : "sia",
    trades: Object.fromEntries(feeTrades.map((t) => [t, parseTrade(trades[t])])) as Record<FeeTrade, TradeData>,
    rates,
    siaRateId: typeof v.siaRateId === "string" ? v.siaRateId.slice(0, 40) : "",
    z: Object.fromEntries(
      siaColumns.map((c) => {
        const o = record(z[c]);
        const n = (x: unknown, max: number) => (typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= max ? x : null);
        return [c, { z1: n(o.z1, 100), z2: n(o.z2, 10_000) }];
      }),
    ) as Record<SiaColumn, ZValues>,
    shares: Object.fromEntries(siaColumns.map((c) => [c, parseShares(shares[c], defaultShares[c])])) as Record<SiaColumn, PhaseShares>,
    expensesPct: inRange(v.expensesPct, [0, 100], 0),
    discountPct: inRange(v.discountPct, [0, 100], 0),
    expensesText: text(v.expensesText, 2000),
    description: text(v.description, 4000),
    basis: text(v.basis, 2000),
    customServices: parseCustomServices(v.customServices),
    extras: parseExtras(v.extras),
  };
}

/** New offer: all phases switched on for the chosen trades, settings copied. */
export function newFeeOfferData(settings: FeeSettings, trades: FeeTrade[]): FeeOfferData {
  const data = parseFeeOfferData({});
  for (const t of trades) {
    data.trades[t].on = true;
    for (const p of feePhases) data.trades[t].phases[p].on = true;
  }
  return {
    ...data,
    rates: settings.rates,
    siaRateId: settings.siaRateId,
    z: settings.z,
    shares: settings.shares,
    expensesPct: settings.expensesPct,
    expensesText: settings.expensesText,
  };
}

/** Leistungsanteil q of a phase: the offer's override, else the share of the trade's Fachgebiet. */
export const phaseShare = (data: FeeOfferData, trade: FeeTrade, phase: FeePhase) =>
  data.trades[trade].phases[phase].q ?? data.shares[tradeColumn[trade]][phase];
