import { invoiceTotals, parseFeeInvoiceData } from "@/lib/fees/invoice";
import { parseFeeOfferData } from "@/lib/fees/offer-schema";
import type { Json } from "@/lib/supabase/database.types";

import type { InvoiceRow } from "./invoice-table";

type Offer = { id: string; number: string; title: string; data: Json; project?: { number: string } | null; company?: { name: string } | null;
  contact?: { first_name: string | null; last_name: string; mobile: string | null; phone: string | null; email: string | null } | null;
};
type Invoice = { id: string; number: string; offer_id: string; invoice_date: string; due_date: string | null; status: string; data: Json; created_at: string };

/**
 * Table rows with the amount of each invoice: its Leistungsstand minus that of the previous invoice of the same
 * offer, so `invoices` must contain all invoices of the offers (sorted by created_at).
 */
export function invoiceRows(offers: Offer[], invoices: Invoice[], vatRate: number): InvoiceRow[] {
  const rows: InvoiceRow[] = [];
  for (const offer of offers) {
    const offerData = parseFeeOfferData(offer.data);
    let previous = null;
    for (const inv of invoices.filter((i) => i.offer_id === offer.id)) {
      const data = parseFeeInvoiceData(inv.data);
      const totals = invoiceTotals(offerData, vatRate, data, previous);
      rows.push({
        id: inv.id,
        number: inv.number,
        offerNumber: offer.number,
        invoice_date: inv.invoice_date,
        due_date: inv.due_date,
        status: inv.status,
        total: totals.total,
        net: totals.net,
        client: offer.company?.name ?? null,
        contact: offer.contact ?? null,
        project: { number: offer.project?.number ?? "", title: offer.title },
      });
      previous = data;
    }
  }
  return rows;
}
