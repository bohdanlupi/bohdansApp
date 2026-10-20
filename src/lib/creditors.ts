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

/** Amount incl. MWST at one rate; an invoice has one line per rate it contains. */
export type VatLine = { rate: number; total: number };

/** vat_lines column → valid lines (unknown entries dropped). */
export function parseVatLines(value: unknown): VatLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((l) => {
    const rate = Number(l?.rate);
    const total = Number(l?.total);
    return Number.isFinite(rate) && rate >= 0 && rate <= 100 && Number.isFinite(total) ? [{ rate, total: round2(total) }] : [];
  });
}

/** Totals of an invoice over all its lines. */
export function splitLines(lines: VatLine[]) {
  const parts = lines.map((l) => splitVat(l.total, l.rate));
  return {
    total: round2(lines.reduce((a, l) => a + l.total, 0)),
    net: round2(parts.reduce((a, p) => a + p.net, 0)),
    vat: round2(parts.reduce((a, p) => a + p.vat, 0)),
  };
}

/** "8.1 / 2.6 %" – the rates of an invoice for lists. */
export const ratesLabel = (lines: VatLine[]) => `${[...new Set(lines.map((l) => l.rate))].sort((a, b) => b - a).join(" / ") || "0"} %`;

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
  /** Rates of the invoice, e.g. "8.1 / 2.6 %". */
  rates: string;
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

type BalanceInvoice = { status: string; total: number; due_date: string | null };
/** Sum and count of invoices. */
type Amount = { sum: number; count: number };

export type AccountBalance = {
  opening: number;
  /** Paid Honorarrechnungen. */
  received: Amount;
  /** Paid Kreditoren. */
  paid: Amount;
  /** opening + received − paid: what should be on the account today. */
  expected: number;
  /** Honorarrechnungen Versendet, not paid yet. */
  receivable: Amount;
  /** Open Kreditoren, and the part of them whose due date has passed. */
  payable: Amount;
  overdue: Amount;
  /** expected + receivable − payable. */
  afterOpen: number;
};

/**
 * Expected account balance: the opening balance plus every paid outgoing invoice minus every paid received invoice,
 * and the open amounts still to come. Skonto taken by clients is not known to the app and not deducted.
 */
export function accountBalance({ opening, today, outgoing, incoming }: { opening: number; today: string; outgoing: BalanceInvoice[]; incoming: BalanceInvoice[] }): AccountBalance {
  const amount = (rows: BalanceInvoice[]): Amount => ({ sum: round2(rows.reduce((a, r) => a + r.total, 0)), count: rows.length });
  const received = amount(outgoing.filter((i) => i.status === "paid"));
  const paid = amount(incoming.filter((i) => i.status === "paid"));
  const receivable = amount(outgoing.filter((i) => i.status === "sent"));
  const open = incoming.filter((i) => i.status === "open");
  const payable = amount(open);
  const overdue = amount(open.filter((i) => i.due_date !== null && i.due_date < today));
  const expected = round2(opening + received.sum - paid.sum);
  return { opening, received, paid, expected, receivable, payable, overdue, afterOpen: round2(expected + receivable.sum - payable.sum) };
}

/** Columns of the Kreditoren list that can be sorted (URL param `sortierung`). */
export const creditorSortKeys = ["supplier", "number", "quarter", "invoiceDate", "dueDate", "category", "project", "vat", "total", "status"] as const;
export type CreditorSortKey = (typeof creditorSortKeys)[number];
export const isCreditorSortKey = (v: unknown): v is CreditorSortKey => creditorSortKeys.includes(v as CreditorSortKey);

export type CreditorSort = { key: CreditorSortKey; desc: boolean };

/** Fields the list sorting and the text search need; the table row type extends it. */
export type CreditorListItem = {
  number: string;
  invoice_date: string;
  due_date: string | null;
  paid_date: string | null;
  status: CreditorStatus;
  category: string;
  total: number;
  vat_lines: VatLine[];
  description: string;
  company: { name: string } | null;
  project: { number: string; name: string } | null;
};

/** True when every search word appears in supplier, number, description or project of the invoice. */
export function matchesCreditorSearch(item: CreditorListItem, words: string[]) {
  const text = [item.company?.name, item.number, item.description, item.project?.number, item.project?.name].filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => text.includes(w));
}

/** Comparator for the list; ties fall back to the invoice date (newest first) so the order is stable. */
export function compareCreditors(sort: CreditorSort) {
  const text = (a: string, b: string) => a.localeCompare(b, "de", { numeric: true, sensitivity: "base" });
  const nullable = (a: string | null, b: string | null) => (a ?? "9999").localeCompare(b ?? "9999");
  const value = (a: CreditorListItem, b: CreditorListItem): number => {
    switch (sort.key) {
      case "supplier":
        return text(a.company?.name ?? "", b.company?.name ?? "");
      case "number":
        return text(a.number, b.number);
      case "quarter": {
        const qa = quarterOf(a.invoice_date);
        const qb = quarterOf(b.invoice_date);
        return qa.year - qb.year || qa.quarter - qb.quarter;
      }
      case "invoiceDate":
        return a.invoice_date.localeCompare(b.invoice_date);
      case "dueDate":
        // Open invoices by due date, paid ones by paid date (the column shows that date).
        return nullable(a.status === "paid" ? a.paid_date : a.due_date, b.status === "paid" ? b.paid_date : b.due_date);
      case "category":
        return text(a.category, b.category);
      case "project":
        return text(a.project?.number ?? "\uffff", b.project?.number ?? "\uffff");
      case "vat":
        return splitLines(a.vat_lines).vat - splitLines(b.vat_lines).vat;
      case "total":
        return a.total - b.total;
      case "status":
        return text(a.status, b.status);
    }
  };
  return (a: CreditorListItem, b: CreditorListItem) => {
    const v = value(a, b);
    return (sort.desc ? -v : v) || b.invoice_date.localeCompare(a.invoice_date);
  };
}
