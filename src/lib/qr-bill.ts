// Swiss QR-Rechnung (Swiss Payment Standards, Implementation Guidelines QR-bill v2.3): payload of the Swiss QR Code
// for a normal IBAN without reference (NON) and an unstructured message. Addresses are structured (type S); the
// house number stays in the street line, which the standard allows.

export type QrAddress = { name: string; street: string | null; zip: string | null; city: string | null; country: string | null };

export type QrBill = {
  iban: string;
  creditor: QrAddress;
  debtor: QrAddress | null;
  /** CHF; null = amount left open on the slip. */
  amount: number | null;
  message: string;
};

const clean = (value: string | null | undefined, max: number) => (value ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
const countryCode = (value: string | null) => (value && /^[A-Z]{2}$/i.test(value.trim()) ? value.trim().toUpperCase() : "CH");

/** IBAN without spaces, only for Swiss and Liechtenstein accounts (the QR-bill accepts no others). */
export function qrIban(value: string | null | undefined): string | null {
  const iban = (value ?? "").replace(/\s+/g, "").toUpperCase();
  if (!/^(CH|LI)\d{7}[0-9A-Z]{12}$/.test(iban)) return null;
  // Mod-97 check (ISO 13616)
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1 ? iban : null;
}

/** QR-IBANs (IID 30000–31999) need a QR reference and cannot be used with "NON". */
export const isQrIban = (iban: string) => {
  const iid = Number(iban.slice(4, 9));
  return iid >= 30000 && iid <= 31999;
};

const address = (a: QrAddress | null) =>
  a ? ["S", clean(a.name, 70), clean(a.street, 70), "", clean(a.zip, 16), clean(a.city, 35), countryCode(a.country)] : ["", "", "", "", "", "", ""];

export const formatQrAmount = (amount: number) => amount.toFixed(2);

export function qrPayload(bill: QrBill): string {
  return [
    "SPC",
    "0200",
    "1",
    bill.iban,
    ...address(bill.creditor),
    ...["", "", "", "", "", "", ""],
    bill.amount !== null ? formatQrAmount(bill.amount) : "",
    "CHF",
    ...address(bill.debtor),
    "NON",
    "",
    clean(bill.message, 140),
    "EPD",
  ].join("\n");
}

/** IBAN in blocks of four for the slip. */
export const formatIban = (iban: string) => iban.replace(/(.{4})/g, "$1 ").trim();

/** Amount on the slip: blank as thousands separator, two decimals ("1 234.50"). */
export const formatSlipAmount = (amount: number) => {
  const [int, dec] = amount.toFixed(2).split(".");
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${dec}`;
};
