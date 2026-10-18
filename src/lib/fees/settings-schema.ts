import { z } from "zod";

import { defaultShares, feePhases, type PhaseShares, type SiaColumn, siaColumns } from "./sia108";

// Firm-wide defaults of the fee offers (firm_settings.fee_settings): Z1/Z2 per Fachgebiet, Leistungsanteile q per
// phase, rate categories and the Nebenkosten. A new offer copies them, so later changes do not alter sent offers.
// Parsed leniently: invalid values fall back to the defaults.

export type FeeRate = { id: string; label: string; rate: number };
export type ZValues = { z1: number | null; z2: number | null };

export type FeeSettings = {
  z: Record<SiaColumn, ZValues>;
  shares: Record<SiaColumn, PhaseShares>;
  rates: FeeRate[];
  /** Rate used by the SIA formula (h). */
  siaRateId: string;
  expensesPct: number;
  /** Lines of the Nebenkosten section, one per line. */
  expensesText: string;
};

export const MAX_RATES = 12;

/** LUPI rate categories A–G. */
export const defaultRates: FeeRate[] = [
  { id: "a", label: "A Geschäftsführer", rate: 210 },
  { id: "b", label: "B Gesamtprojektleiter", rate: 160 },
  { id: "c", label: "C Fachprojektleiter", rate: 150 },
  { id: "d", label: "D Techniker", rate: 145 },
  { id: "e", label: "E Sachbearbeiter", rate: 100 },
  { id: "f", label: "F Administration", rate: 95 },
  { id: "g", label: "G Lernender", rate: 85 },
];

/** Default rate of the SIA formula (h). */
const defaultSiaRateId = "c";

/** Z1/Z2 used until the user enters own values (same for all Fachgebiete). */
const defaultZ: ZValues = { z1: 0.066, z2: 11.28 };

export const defaultExpensesText = "Reisespesen: CHF 0.75 / km\nPlotterkosten werden nach Aufwand verrechnet";

const nullableNum = (max: number) => z.number().finite().min(0).max(max).nullable().catch(null);
const zSchema = z.object({ z1: nullableNum(100), z2: nullableNum(10_000) }).catch({ z1: null, z2: null });

export const rateSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().max(80).catch(""),
  rate: z.number().finite().min(0).max(1000).catch(0),
});

const record = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});

/** Shares q of one column; each phase falls back to the default on its own. */
export function parseShares(raw: unknown, fallback: PhaseShares): PhaseShares {
  const obj = record(raw);
  const out = { ...fallback };
  for (const phase of feePhases) {
    const v = obj[phase];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100) out[phase] = v;
  }
  return out;
}

export function parseRates(raw: unknown, fallback: FeeRate[]): FeeRate[] {
  if (!Array.isArray(raw)) return fallback;
  const seen = new Set<string>();
  return raw
    .flatMap((r) => {
      const parsed = rateSchema.safeParse(r);
      if (!parsed.success || seen.has(parsed.data.id)) return [];
      seen.add(parsed.data.id);
      return [parsed.data];
    })
    .slice(0, MAX_RATES);
}

const pct = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : fallback);

export function parseFeeSettings(raw: unknown): FeeSettings {
  const v = record(raw);
  const z = record(v.z);
  const shares = record(v.shares);
  const rates = parseRates(v.rates, defaultRates);
  return {
    z: Object.fromEntries(siaColumns.map((c) => [c, c in z ? zSchema.parse(z[c]) : defaultZ])) as Record<SiaColumn, ZValues>,
    shares: Object.fromEntries(siaColumns.map((c) => [c, parseShares(shares[c], defaultShares[c])])) as Record<SiaColumn, PhaseShares>,
    rates,
    siaRateId: typeof v.siaRateId === "string" && rates.some((r) => r.id === v.siaRateId) ? v.siaRateId : (rates.find((r) => r.id === defaultSiaRateId) ?? rates[0])?.id ?? "",
    expensesPct: pct(v.expensesPct, 3),
    expensesText: typeof v.expensesText === "string" ? v.expensesText.slice(0, 2000) : defaultExpensesText,
  };
}
