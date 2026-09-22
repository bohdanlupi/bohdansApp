// Swiss business documents use 5'000.00 and 22.09.2026 regardless of language
// (fr-CH/it-CH CLDR formats differ and use characters Helvetica cannot render),
// so all printed numbers and dates use de-CH formatting.
const amountFormat = new Intl.NumberFormat("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantityFormat = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 3 });
const dateFormat = new Intl.DateTimeFormat("de-CH", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Zurich",
});

/** 5000 → "5'000.00" */
export const formatAmount = (value: number) => amountFormat.format(value);

export const formatChf = (value: number) => `CHF ${formatAmount(value)}`;

export const formatQuantity = (value: number) => quantityFormat.format(value);

export const formatDate = (date: Date) => dateFormat.format(date);

/** Swiss 5-Rappen rounding for totals. */
export const roundTo5Rappen = (value: number) => Math.round(value * 20) / 20;
