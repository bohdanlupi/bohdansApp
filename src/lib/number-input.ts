// Number input helpers: accept Swiss (1'234.50) and comma decimals (1234,5), display with apostrophes.

/** "1'234.50", "1 234,5" → 1234.5; empty or invalid → null. */
export function parseNumber(input: string): number | null {
  const cleaned = input.replace(/['’\s]/g, "").replace(",", ".");
  if (cleaned === "" || cleaned === "-") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

const formats = new Map<string, Intl.NumberFormat>();

/** 1234.5 → "1'234.50" (decimals fixed) or "1'234.5" (maxDecimals only). */
export function formatNumber(value: number | null | undefined, decimals: number, fixed = true): string {
  if (value === null || value === undefined) return "";
  const key = `${decimals}-${fixed}`;
  let format = formats.get(key);
  if (!format) {
    format = new Intl.NumberFormat("de-CH", {
      minimumFractionDigits: fixed ? decimals : 0,
      maximumFractionDigits: decimals,
    });
    formats.set(key, format);
  }
  return format.format(value);
}

export const formatMoney = (value: number | null | undefined) => formatNumber(value, 2);
export const formatQty = (value: number | null | undefined) => formatNumber(value, 3, false);
