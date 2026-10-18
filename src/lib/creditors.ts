// Kreditoren (received invoices) and the quarterly MWST-Abrechnung (effective method, vereinbarte Entgelte).

export const creditorStatuses = ["open", "paid"] as const;
export type CreditorStatus = (typeof creditorStatuses)[number];

export const creditorCategories = ["material", "subcontractor", "office", "vehicle", "software", "rent", "investment", "other"] as const;
export type CreditorCategory = (typeof creditorCategories)[number];

/** Swiss MWST rates since 2024 (normal, reduced, accommodation) and 0 for invoices without MWST. */
export const vatRates = [8.1, 2.6, 3.8, 0] as const;

export const isCreditorStatus = (v: unknown): v is CreditorStatus => creditorStatuses.includes(v as CreditorStatus);
export const isCreditorCategory = (v: unknown): v is CreditorCategory => creditorCategories.includes(v as CreditorCategory);

/** ESTV Ziffer of the Vorsteuer: 400 Material- und Dienstleistungsaufwand, 405 Investitionen und übriger Betriebsaufwand. */
export const inputTaxZiffer = (category: string): 400 | 405 => (category === "material" || category === "subcontractor" ? 400 : 405);

/** ESTV Ziffer of the Umsatzsteuer per rate (2024 rates). */
export const outputTaxZiffer = (rate: number) => (rate === 8.1 ? 303 : rate === 2.6 ? 313 : rate === 3.8 ? 343 : null);

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Net amount and MWST contained in a total incl. MWST. */
export function splitVat(total: number, rate: number) {
  const vat = round2((total * rate) / (100 + rate));
  return { net: round2(total - vat), vat };
}

export type Quarter = { year: number; quarter: 1 | 2 | 3 | 4 };

const pad = (n: number) => String(n).padStart(2, "0");

/** First and last day of a quarter (ISO dates). */
export function quarterRange({ year, quarter }: Quarter) {
  const first = (quarter - 1) * 3 + 1;
  const lastDay = new Date(Date.UTC(year, first + 2, 0)).getUTCDate();
  return { from: `${year}-${pad(first)}-01`, to: `${year}-${pad(first + 2)}-${pad(lastDay)}` };
}

export function quarterOf(isoDate: string): Quarter {
  const [year, month] = isoDate.split("-").map(Number);
  return { year, quarter: (Math.floor((month - 1) / 3) + 1) as Quarter["quarter"] };
}

export function parseQuarter(year: unknown, quarter: unknown): Quarter | null {
  const y = Number(year);
  const q = Number(quarter);
  if (!Number.isInteger(y) || y < 2000 || y > 2100 || ![1, 2, 3, 4].includes(q)) return null;
  return { year: y, quarter: q as Quarter["quarter"] };
}

/** Outgoing invoice (Honorarrechnung) in the MWST-Abrechnung. */
export type VatOutgoing = { number: string; date: string; client: string; project: string; net: number; vat: number; total: number; rate: number };
/** Received invoice (Kreditor) in the MWST-Abrechnung. */
export type VatIncoming = {
  supplier: string;
  number: string;
  date: string;
  category: string;
  net: number;
  vat: number;
  total: number;
  rate: number;
  /** Number of the attached document in the report, null without one. */
  attachment: number | null;
};

export type VatReport = {
  /** 200 Total der vereinbarten Entgelte. */
  revenue: number;
  /** 303 / 313 / 343: taxable revenue and tax per rate. */
  outputTax: { rate: number; ziffer: number | null; base: number; tax: number }[];
  /** 399 Total geschuldete Steuer. */
  outputTaxTotal: number;
  /** 400 Vorsteuer auf Material- und Dienstleistungsaufwand. */
  inputTax400: number;
  /** 405 Vorsteuer auf Investitionen und übrigem Betriebsaufwand. */
  inputTax405: number;
  /** 479 Total Vorsteuer. */
  inputTaxTotal: number;
  /** 500 zu bezahlen (positive) or 510 Guthaben (negative). */
  balance: number;
};

export function vatReport(outgoing: VatOutgoing[], incoming: VatIncoming[]): VatReport {
  const sum = (values: number[]) => round2(values.reduce((a, b) => a + b, 0));
  const rates = [...new Set(outgoing.filter((o) => o.rate > 0).map((o) => o.rate))].sort((a, b) => b - a);
  const outputTax = rates.map((rate) => {
    const rows = outgoing.filter((o) => o.rate === rate);
    return { rate, ziffer: outputTaxZiffer(rate), base: sum(rows.map((o) => o.net)), tax: sum(rows.map((o) => o.vat)) };
  });
  const outputTaxTotal = sum(outputTax.map((r) => r.tax));
  const inputTax400 = sum(incoming.filter((i) => inputTaxZiffer(i.category) === 400).map((i) => i.vat));
  const inputTax405 = sum(incoming.filter((i) => inputTaxZiffer(i.category) === 405).map((i) => i.vat));
  const inputTaxTotal = round2(inputTax400 + inputTax405);
  return {
    revenue: sum(outgoing.map((o) => o.net)),
    outputTax,
    outputTaxTotal,
    inputTax400,
    inputTax405,
    inputTaxTotal,
    balance: round2(outputTaxTotal - inputTaxTotal),
  };
}
