// CSV parsing and column mapping for the address import (runs in the browser).

export const companyImportFields = [
  "name",
  "name2",
  "street",
  "po_box",
  "zip",
  "city",
  "country",
  "phone",
  "email",
  "website",
  "uid_number",
  "notes",
] as const;

export const contactImportFields = [
  "salutation",
  "first_name",
  "last_name",
  "function",
  "phone",
  "mobile",
  "email",
] as const;

/** Mapping target: `company.<field>` or `contact.<field>`. */
export type ImportTarget =
  | `company.${(typeof companyImportFields)[number]}`
  | `contact.${(typeof contactImportFields)[number]}`;

/** Row as sent to the import: company fields plus `contact_*` fields. */
export type ImportRow = Partial<Record<string, string>>;

/** Lowercase header words (DE/FR/IT/EN) that suggest a target field. First match wins. */
const headerHints: [RegExp, ImportTarget][] = [
  [/^(anrede|salutation|civilit[eé]|appellativo|titel)$/, "contact.salutation"],
  [/^(vorname|first ?name|pr[eé]nom|nome)$/, "contact.first_name"],
  [/^(nachname|name kontakt|kontakt ?name|last ?name|nom de famille|cognome)$/, "contact.last_name"],
  [/^(funktion|function|fonction|funzione|position)$/, "contact.function"],
  [/(natel|mobile|handy|cellulare|portable)/, "contact.mobile"],
  [/^(e-?mail kontakt|kontakt e-?mail|e-?mail person)$/, "contact.email"],
  [/^(firma|firmenname|company|name|entreprise|raison sociale|ditta|nome ditta|name ?1)$/, "company.name"],
  [/^(zusatz|name ?2|firma ?2|compl[eé]ment|complemento)$/, "company.name2"],
  [/^(strasse|straße|adresse|street|address|rue|via|indirizzo)$/, "company.street"],
  [/^(postfach|case postale|casella postale|po box)$/, "company.po_box"],
  [/^(plz|zip|postleitzahl|npa|cap|postal code)$/, "company.zip"],
  [/^(ort|city|stadt|localit[eé]|lieu|luogo|ville)$/, "company.city"],
  [/^(land|country|pays|paese)$/, "company.country"],
  [/^(telefon|tel\.?|phone|t[eé]l[eé]phone|telefono)$/, "company.phone"],
  [/^(e-?mail|mail|courriel)$/, "company.email"],
  [/^(website|web|homepage|internet|www|site web|sito web)$/, "company.website"],
  [/^(uid|uid-nr\.?|uid-nummer|mwst-nr\.?|ide|idi)$/, "company.uid_number"],
  [/^(bemerkung(en)?|notiz(en)?|notes?|remarques?|osservazioni)$/, "company.notes"],
];

export function guessTarget(header: string): ImportTarget | null {
  const h = header.trim().toLowerCase();
  return headerHints.find(([pattern]) => pattern.test(h))?.[1] ?? null;
}

/** Guesses targets for all headers; each target is used at most once. */
export function guessMapping(headers: string[]): (ImportTarget | null)[] {
  const used = new Set<ImportTarget>();
  return headers.map((header) => {
    const target = guessTarget(header);
    if (!target || used.has(target)) return null;
    used.add(target);
    return target;
  });
}

/**
 * Parses CSV text (RFC 4180 quoting). The delimiter is detected from the header line:
 * Swiss Excel exports use `;`, other tools `,` or tab.
 */
export function parseCsv(text: string): string[][] {
  const content = text.replace(/^﻿/, "");
  const firstLine = content.slice(0, content.search(/\r?\n|$/));
  const delimiter = [";", "\t", ","]
    .map((d) => ({ d, n: firstLine.split(d).length }))
    .sort((a, b) => b.n - a.n)[0].d;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (quoted) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && field === "") {
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && content[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  // Drop completely empty lines (Excel often appends ";;;;" rows).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** "Herr"/"Monsieur"/"Mr" → mr, "Frau"/"Madame"/"Mme" → ms. */
export function parseSalutation(value: string | undefined): "mr" | "ms" | undefined {
  const v = value?.trim().toLowerCase().replace(/\./g, "") ?? "";
  if (/^(herr|hr|monsieur|m|mr|signor|sig)$/.test(v)) return "mr";
  if (/^(frau|fr|madame|mme|ms|mrs|signora|sigra)$/.test(v)) return "ms";
  return undefined;
}

/** Applies the column mapping to the data rows (without the header row). */
export function mapRows(dataRows: string[][], mapping: (ImportTarget | null)[]): ImportRow[] {
  return dataRows.map((cells) => {
    const row: ImportRow = {};
    mapping.forEach((target, index) => {
      const value = cells[index]?.trim();
      if (!target || !value) return;
      const [group, field] = target.split(".");
      const key = group === "company" ? field : `contact_${field}`;
      // Two columns mapped to notes are joined instead of overwritten.
      row[key] = row[key] && key === "notes" ? `${row[key]}\n${value}` : value;
    });
    if (row.contact_salutation !== undefined) row.contact_salutation = parseSalutation(row.contact_salutation);
    if (row.country) row.country = row.country.slice(0, 2).toUpperCase();
    return row;
  });
}
