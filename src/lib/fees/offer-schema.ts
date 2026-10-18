import { z } from "zod";

import { type FeeRate, type FeeSettings, parseRates, parseShares, type ZValues } from "./settings-schema";
import type { ServiceState } from "./services";
import { fkCriteria } from "./factor-guide";
import {
  basisSystems,
  buildingTypes,
  defaultShares,
  factorLimits,
  type FeePhase,
  feePhases,
  type FeeTrade,
  feeTrades,
  isBasisTrade,
  type PhaseShares,
  type SiaColumn,
  siaColumns,
  tradeColumn,
} from "./sia108";

// Data of a Honorarofferte (fee_offers.data): fee method, trades with their SIA 108 factors and phases, the
// services per trade and phase, and the copy of the firm settings (rates, Z values, shares) taken at creation.
// The Bauwerksart is chosen once per offer; n per trade follows from it unless entered.
// Parsed leniently: invalid parts fall back to the defaults one by one.

export type FeeMethod = "sia" | "hours";

/** "sia": fee per trade and phase (SIA 108 formula or hours); "positions": free positions, no SIA 108. */
export const offerKinds = ["sia", "positions"] as const;
export type OfferKind = (typeof offerKinds)[number];

export const positionUnits = ["h", "lump", "pcs", "day"] as const;
export type PositionUnit = (typeof positionUnits)[number];

/** Free position: Menge × Ansatz; for hours the Ansatz can come from a rate category of the offer (rateId). */
export type OfferPosition = { id: string; text: string; qty: number | null; unit: PositionUnit; rateId: string | null; price: number | null };

export type TradePhase = {
  on: boolean;
  /** Leistungsanteil q in %; null = the offer's default share. */
  q: number | null;
  /** Hours per rate category (method "hours"). */
  hours: Record<string, number>;
};

/** Own service line of a phase with its state per trade (missing trade = not listed). */
export type CustomService = { id: string; phase: FeePhase; text: string; states: Partial<Record<FeeTrade, ServiceState>> };

/** Line of the basis of Gebäudeautomation / Fachkoordination; null = linked trade cost resp. default share. */
export type BasisLine = { cost: number | null; pct: number | null };

export type TradeData = {
  on: boolean;
  /** Aufwandbestimmende Baukosten B in CHF exkl. MwSt. (not used by Gebäudeautomation / Fachkoordination). */
  cost: number | null;
  /** Schwierigkeitsgrad n; null = from the Bauwerksart of the offer. */
  n: number | null;
  r: number;
  i: number;
  s: number;
  /** Faktor für Umbauten U (1.0 = Neubau). */
  u: number;
  /** Faktor für die Fachkoordination k (Art. 9.6.1). */
  k: number;
  /** Basis of Gebäudeautomation / Fachkoordination per system (Art. 8.3 / 9.7). */
  basis: Record<string, BasisLine>;
  phases: Record<FeePhase, TradePhase>;
  /** Service choices that differ from the defaults (see services.ts). */
  services: Record<string, ServiceState>;
};

export type ExtraItem = { id: string; text: string; amount: number | null };

export type FeeOfferData = {
  kind: OfferKind;
  method: FeeMethod;
  /** Bauwerksart (SIA 108 Art. 7.6.5) for all trades. */
  buildingType: string | null;
  /** Scores 1–3 of the Fachkoordination criteria (Art. 9.2). */
  fkScores: Record<string, number>;
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
  /** Zusätzliche Bedingungen (own chapter in the PDF, left out when empty). */
  conditions: string;
  customServices: CustomService[];
  /** Lump-sum items besides the phase fees (e.g. Fachkoordination, Kanalisationseingabe); SIA offers only. */
  extras: ExtraItem[];
  /** Positions of a free offer (kind "positions"). */
  positions: OfferPosition[];
  /** Skonto as payment condition: pct within days (0 % = none). */
  skontoPct: number;
  skontoDays: number;
};

export const MAX_CUSTOM = 40;
export const MAX_EXTRAS = 20;
export const MAX_POSITIONS = 80;

const record = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const inRange = (value: unknown, [min, max]: readonly [number, number], fallback: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
const money = z.number().finite().min(0).max(1e10).nullable().catch(null);
/** Prices are rounded to 5 Rappen. */
const price = (value: unknown) => {
  const v = money.parse(value ?? null);
  return v === null ? null : Math.round(v * 20) / 20;
};

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

const nullablePct = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null);

function parseBasis(trade: FeeTrade, raw: unknown): Record<string, BasisLine> {
  if (!isBasisTrade(trade)) return {};
  const v = record(raw);
  const out: Record<string, BasisLine> = {};
  for (const system of basisSystems[trade]) {
    const line = record(v[system.id]);
    const cost = money.parse(line.cost ?? null);
    const pct = nullablePct(line.pct);
    if (cost !== null || pct !== null) out[system.id] = { cost, pct };
  }
  return out;
}

const validBuildingType = (value: unknown) => (typeof value === "string" && buildingTypes.some((b) => b.id === value) ? value : null);

function parseTrade(trade: FeeTrade, raw: unknown): TradeData {
  const v = record(raw);
  const services: Record<string, ServiceState> = {};
  for (const [id, state] of Object.entries(record(v.services))) {
    if (id.length <= 60 && serviceStates.has(state as ServiceState)) services[id] = state as ServiceState;
  }
  const phases = record(v.phases);
  return {
    on: v.on === true,
    cost: money.parse(v.cost ?? null),
    n: typeof v.n === "number" ? inRange(v.n, factorLimits.n, 1) : null,
    r: inRange(v.r, factorLimits.r, 1),
    i: inRange(v.i, factorLimits.i, 1),
    s: inRange(v.s, factorLimits.s, 1),
    u: inRange(v.u, factorLimits.u, 1),
    k: inRange(v.k, factorLimits.k, 0.15),
    basis: parseBasis(trade, v.basis),
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
    return [{ id: o.id.slice(0, 40), text: text(o.text, 300), amount: price(o.amount) }];
  }).slice(0, MAX_EXTRAS);
}

function parsePositions(raw: unknown): OfferPosition[] {
  return (Array.isArray(raw) ? raw : []).flatMap((e): OfferPosition[] => {
    const o = record(e);
    if (typeof o.id !== "string") return [];
    const qty = typeof o.qty === "number" && Number.isFinite(o.qty) && Math.abs(o.qty) <= 1e7 ? o.qty : null;
    return [{
      id: o.id.slice(0, 40),
      text: text(o.text, 1000),
      qty,
      unit: positionUnits.includes(o.unit as PositionUnit) ? (o.unit as PositionUnit) : "h",
      rateId: typeof o.rateId === "string" && o.rateId ? o.rateId.slice(0, 40) : null,
      price: price(o.price),
    }];
  }).slice(0, MAX_POSITIONS);
}

export function parseFeeOfferData(raw: unknown): FeeOfferData {
  const v = record(raw);
  const trades = record(v.trades);
  const z = record(v.z);
  const shares = record(v.shares);
  const rates = parseRates(v.rates, []);
  const parsedTrades = Object.fromEntries(feeTrades.map((t) => [t, parseTrade(t, trades[t])])) as Record<FeeTrade, TradeData>;
  // Offers before the Bauwerksart per offer stored it per trade together with its n: take the first one and keep
  // n only where it differs from the table value.
  let buildingType = validBuildingType(v.buildingType);
  if (!("buildingType" in v)) {
    const legacy = feeTrades.map((t) => validBuildingType(record(trades[t]).buildingType)).find(Boolean) ?? null;
    buildingType = legacy;
    const type = buildingTypes.find((b) => b.id === legacy);
    if (type) {
      for (const t of feeTrades) if (parsedTrades[t].n === type.n[tradeColumn[t]]) parsedTrades[t].n = null;
    }
  }
  const fkScores: Record<string, number> = {};
  const scores = record(v.fkScores);
  for (const c of fkCriteria) if (scores[c.id] === 1 || scores[c.id] === 2 || scores[c.id] === 3) fkScores[c.id] = scores[c.id] as number;
  return {
    kind: v.kind === "positions" ? "positions" : "sia",
    method: v.method === "hours" ? "hours" : "sia",
    buildingType,
    fkScores,
    trades: parsedTrades,
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
    conditions: text(v.conditions, 4000),
    customServices: parseCustomServices(v.customServices),
    extras: parseExtras(v.extras),
    positions: parsePositions(v.positions),
    skontoPct: inRange(v.skontoPct, [0, 100], 0),
    skontoDays: Math.round(inRange(v.skontoDays, [0, 365], 10)),
  };
}

/** New offer: all phases switched on for the chosen trades (or one empty position for a free offer), settings copied. */
export function newFeeOfferData(settings: FeeSettings, trades: FeeTrade[], kind: OfferKind = "sia"): FeeOfferData {
  const data = parseFeeOfferData({ kind });
  if (kind === "positions") data.positions = [{ id: crypto.randomUUID(), text: "", qty: null, unit: "h", rateId: settings.siaRateId || null, price: null }];
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

/** Schwierigkeitsgrad n of a trade: entered, else from the Bauwerksart, else 1.0. */
export function tradeN(data: FeeOfferData, trade: FeeTrade): number {
  const own = data.trades[trade].n;
  if (own !== null) return own;
  return buildingTypes.find((b) => b.id === data.buildingType)?.n[tradeColumn[trade]] ?? 1;
}

/** Leistungsanteil q of a phase: the offer's override, else the share of the trade's Fachgebiet. */
export const phaseShare = (data: FeeOfferData, trade: FeeTrade, phase: FeePhase) =>
  data.trades[trade].phases[phase].q ?? data.shares[tradeColumn[trade]][phase];
