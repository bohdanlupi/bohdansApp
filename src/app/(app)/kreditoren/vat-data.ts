import "server-only";

import { parseVatLines, type Quarter, quarterRange, ratesLabel, splitLines, type VatIncoming, type VatOutgoing, vatReport } from "@/lib/creditors";
import type { createClient } from "@/lib/supabase/server";

import { invoiceRows } from "../debitoren/rechnungen/invoice-rows";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Invoices of a quarter for the MWST-Abrechnung (vereinbarte Entgelte: by invoice date). Outgoing: Honorarrechnungen
 * once Versendet or Bezahlt, with their amount after the deduction of the previous invoice. Incoming: all Kreditoren.
 */
export async function loadVatData(supabase: Supabase, quarter: Quarter) {
  const { from, to } = quarterRange(quarter);

  const [{ data: billed }, { data: received }, { data: firm }] = await Promise.all([
    supabase.from("fee_invoices").select("offer_id").in("status", ["sent", "paid"]).gte("invoice_date", from).lte("invoice_date", to),
    supabase
      .from("creditor_invoices")
      .select("id, number, invoice_date, category, vat_lines, file_path, file_name, company:companies(name)")
      .gte("invoice_date", from)
      .lte("invoice_date", to)
      .order("invoice_date")
      .order("created_at"),
    supabase.from("firm_settings").select("vat_rate").eq("id", true).single(),
  ]);
  const vatRate = firm?.vat_rate ?? 0;

  // Amounts of outgoing invoices need all invoices of their offers (each bills the difference to the previous one).
  const offerIds = [...new Set((billed ?? []).map((i) => i.offer_id))];
  const [{ data: offers }, { data: offerInvoices }] = offerIds.length
    ? await Promise.all([
        supabase.from("fee_offers").select("id, number, title, data, project:projects(number), company:companies(name)").in("id", offerIds),
        supabase.from("fee_invoices").select("id, number, offer_id, invoice_date, due_date, status, data, created_at").in("offer_id", offerIds).order("created_at"),
      ])
    : [{ data: [] }, { data: [] }];
  const outgoing: VatOutgoing[] = invoiceRows(offers ?? [], offerInvoices ?? [], vatRate)
    .filter((i) => (i.status === "sent" || i.status === "paid") && i.invoice_date >= from && i.invoice_date <= to)
    .sort((a, b) => a.invoice_date.localeCompare(b.invoice_date) || a.number.localeCompare(b.number, "de", { numeric: true }))
    .map((i) => ({
      number: i.number,
      date: i.invoice_date,
      client: i.client ?? "",
      project: [i.project?.number, i.project?.title].filter(Boolean).join(" "),
      net: i.net,
      vat: Math.round((i.total - i.net) * 100) / 100,
      total: i.total,
      rate: vatRate,
    }));

  let attachment = 0;
  const receipts: { number: number; path: string; name: string; label: string }[] = [];
  const incoming: VatIncoming[] = (received ?? []).map((r) => {
    const supplier = r.company?.name ?? "";
    const n = r.file_path ? ++attachment : null;
    if (r.file_path && n) receipts.push({ number: n, path: r.file_path, name: r.file_name ?? "", label: [supplier, r.number].filter(Boolean).join(" · ") });
    const lines = parseVatLines(r.vat_lines);
    return { supplier, number: r.number, date: r.invoice_date, category: r.category, ...splitLines(lines), rates: ratesLabel(lines), attachment: n };
  });

  return { outgoing, incoming, receipts, report: vatReport(outgoing, incoming) };
}
