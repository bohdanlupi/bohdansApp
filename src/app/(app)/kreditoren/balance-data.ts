import "server-only";

import { accountBalance, isCreditorStatus } from "@/lib/creditors";
import type { createClient } from "@/lib/supabase/server";

import { invoiceRows } from "../debitoren/rechnungen/invoice-rows";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * What should be on the account: the opening balance from the settings, plus every paid Honorarrechnung, minus
 * every paid Kreditor; and the open amounts on both sides still to come. Outgoing invoices need all invoices of
 * their offers (each bills the difference to the previous one).
 */
export async function loadAccountBalance(supabase: Supabase, today: string) {
  const [{ data: firm }, { data: creditors }, { data: billed }] = await Promise.all([
    supabase.from("firm_settings").select("opening_balance, vat_rate").eq("id", true).single(),
    supabase.from("creditor_invoices").select("status, total, due_date"),
    supabase.from("fee_invoices").select("offer_id").in("status", ["sent", "paid"]),
  ]);
  const offerIds = [...new Set((billed ?? []).map((i) => i.offer_id))];
  const [{ data: offers }, { data: offerInvoices }] = offerIds.length
    ? await Promise.all([
        supabase.from("fee_offers").select("id, number, title, data").in("id", offerIds),
        supabase.from("fee_invoices").select("id, number, offer_id, invoice_date, due_date, status, data, created_at").in("offer_id", offerIds).order("created_at"),
      ])
    : [{ data: [] }, { data: [] }];

  return accountBalance({
    opening: firm?.opening_balance ?? 0,
    today,
    outgoing: invoiceRows(offers ?? [], offerInvoices ?? [], firm?.vat_rate ?? 0).map((i) => ({ status: i.status, total: i.total, due_date: i.due_date })),
    incoming: (creditors ?? []).map((c) => ({ status: isCreditorStatus(c.status) ? c.status : "open", total: c.total, due_date: c.due_date })),
  });
}
