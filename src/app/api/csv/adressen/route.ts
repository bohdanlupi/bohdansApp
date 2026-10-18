import { getTranslations } from "next-intl/server";

import { companyCategories, onlyKnown, trades } from "@/lib/address-options";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { searchWords } from "@/lib/validation";

// GET /api/csv/adressen?q=&kategorie=&gewerk=&archiv=1 – the address list with the filters of /adressen as CSV:
// one row per contact person (company columns repeated), companies without contacts as one row. Swiss Excel
// format (UTF-8 with BOM, ";" and CRLF); the column names are recognised by the CSV import.

const PAGE = 1000;

const companyColumns = ["name", "name2", "street", "po_box", "zip", "city", "country", "phone", "email", "website", "uid_number", "categories", "trades", "notes"] as const;
const contactColumns = ["salutation", "first_name", "last_name", "function", "phone", "mobile", "email"] as const;

/** Quotes a field when it contains the delimiter, quotes or line breaks (RFC 4180). */
const field = (value: string | null | undefined) => {
  const v = value ?? "";
  return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim() ?? "";
  const category = onlyKnown([params.get("kategorie") ?? ""], companyCategories)[0];
  const trade = onlyKnown([params.get("gewerk") ?? ""], trades)[0];
  const showArchived = params.get("archiv") === "1";

  const supabase = await createClient();
  const companies = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("company_list")
      .select("id, name, name2, street, po_box, zip, city, country, phone, email, website, uid_number, categories, trades, notes")
      .order("name")
      .order("id")
      .range(from, from + PAGE - 1);
    for (const word of searchWords(q)) query = query.ilike("search_text", `%${word}%`);
    if (category) query = query.contains("categories", [category]);
    if (trade) query = query.contains("trades", [trade]);
    if (!showArchived) query = query.eq("archived", false);
    const { data, error } = await query;
    if (error) return new Response("Export failed", { status: 500 });
    companies.push(...data);
    if (data.length < PAGE) break;
  }

  const ids = new Set(companies.map((c) => c.id));
  const contacts = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("contacts")
      .select("company_id, salutation, first_name, last_name, function, phone, mobile, email")
      .order("last_name")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return new Response("Export failed", { status: 500 });
    contacts.push(...data.filter((c) => ids.has(c.company_id)));
    if (data.length < PAGE) break;
  }
  const byCompany = Map.groupBy(contacts, (c) => c.company_id);

  const t = await getTranslations();
  const header = [...companyColumns.map((c) => t(`addresses.export.company.${c}`)), ...contactColumns.map((c) => t(`addresses.export.contact.${c}`))];
  const lines = [header.map(field).join(";")];
  for (const c of companies) {
    const company = [
      c.name,
      c.name2,
      c.street,
      c.po_box,
      c.zip,
      c.city,
      c.country,
      c.phone,
      c.email,
      c.website,
      c.uid_number,
      onlyKnown(c.categories ?? [], companyCategories).map((x) => t(`options.categories.${x}`)).join(", "),
      onlyKnown(c.trades ?? [], trades).map((x) => t(`options.trades.${x}`)).join(", "),
      c.notes,
    ];
    const people = (c.id && byCompany.get(c.id)) || [];
    for (const p of people.length ? people : [null]) {
      const person = p
        ? [p.salutation === "mr" || p.salutation === "ms" ? t(`options.salutations.${p.salutation}`) : "", p.first_name, p.last_name, p.function, p.phone, p.mobile, p.email]
        : contactColumns.map(() => "");
      lines.push([...company, ...person].map(field).join(";"));
    }
  }

  const date = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="Adressen-${date}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
