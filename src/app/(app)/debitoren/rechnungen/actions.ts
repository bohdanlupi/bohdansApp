"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { assertRole } from "@/lib/auth";
import { emptyInvoiceData, feeInvoiceStatuses, parseFeeInvoiceData } from "@/lib/fees/invoice";
import type { FormState } from "@/lib/form-state";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { PG_UNIQUE_VIOLATION } from "@/lib/validation";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * A paid invoice is locked, and so are the invoices before it (they set its deduction "bisher verrechnet"): only the
 * status of the paid invoice itself can still be changed (e.g. back to Versendet to unlock it).
 */
async function invoiceLock(id: string) {
  const supabase = await createClient();
  const { data: invoice } = await supabase.from("fee_invoices").select("offer_id, status, created_at").eq("id", id).maybeSingle();
  if (!invoice) return null;
  const { count } = await supabase
    .from("fee_invoices")
    .select("id", { count: "exact", head: true })
    .eq("offer_id", invoice.offer_id)
    .eq("status", "paid")
    .gt("created_at", invoice.created_at);
  return { paid: invoice.status === "paid", laterPaid: (count ?? 0) > 0 };
}

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });

/**
 * New invoice of an accepted offer: number <project>-HR<n> (running per project), Leistungsstand copied from the
 * previous invoice of the offer, due date after the firm's payment terms.
 */
export async function createFeeInvoice(offerId: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!z.uuid().safeParse(offerId).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { data: offer } = await supabase.from("fee_offers").select("id, status, project:projects(id, number)").eq("id", offerId).maybeSingle();
  if (!offer?.project || offer.status !== "accepted") return { error: "invalidInput" };
  const project = offer.project;

  const [{ data: numbers }, { data: previous }, { data: firm }] = await Promise.all([
    supabase.from("fee_invoices").select("number").like("number", `${project.number}-HR%`),
    supabase.from("fee_invoices").select("data").eq("offer_id", offerId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("firm_settings").select("payment_terms_days").eq("id", true).single(),
  ]);
  const used = (numbers ?? []).map((r) => Number(r.number.match(/-HR(\d+)$/)?.[1] ?? 0));
  const data = previous ? { ...parseFeeInvoiceData(previous.data), text: "" } : emptyInvoiceData();

  const { data: row, error } = await supabase
    .from("fee_invoices")
    .insert({
      number: `${project.number}-HR${Math.max(0, ...used) + 1}`,
      offer_id: offerId,
      due_date: addDays(new Date(), firm?.payment_terms_days ?? 30),
      data: data as unknown as Json,
    })
    .select("id")
    .single();
  if (error || !row) return { error: error?.code === PG_UNIQUE_VIOLATION ? "invoiceNumberExists" : "saveFailed" };

  revalidatePath(`/projekte/${project.id}/honorar`);
  redirect(`/debitoren/rechnungen/${row.id}`);
}

const headerSchema = z.object({
  number: z.string().trim().min(1).max(50),
  status: z.enum(feeInvoiceStatuses),
  invoice_date: isoDate,
  due_date: isoDate.nullable(),
});

export type FeeInvoiceHeader = z.input<typeof headerSchema>;

/** Autosave of the invoice editor: header columns and the Leistungsstand. */
export async function saveFeeInvoice(id: string, payload: unknown): Promise<{ error?: string }> {
  await assertRole("admin", "planer");
  const p = (payload && typeof payload === "object" ? payload : {}) as { header?: unknown; data?: unknown };
  const header = headerSchema.safeParse(p.header);
  if (!z.uuid().safeParse(id).success || !header.success) return { error: "invalidInput" };

  const lock = await invoiceLock(id);
  if (!lock) return { error: "invalidInput" };
  if (lock.laterPaid) return { error: "invoiceLocked" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("fee_invoices")
    .update(lock.paid ? { status: header.data.status } : { ...header.data, data: parseFeeInvoiceData(p.data) as unknown as Json })
    .eq("id", id);
  if (error) return { error: error.code === PG_UNIQUE_VIOLATION ? "invoiceNumberExists" : "saveFailed" };

  revalidatePath("/projekte", "layout");
  return {};
}

export async function deleteFeeInvoice(id: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!z.uuid().safeParse(id).success) return { error: "invalidInput" };
  const lock = await invoiceLock(id);
  if (lock?.paid || lock?.laterPaid) return { error: "invoiceLocked" };
  const supabase = await createClient();
  const { data: invoice } = await supabase.from("fee_invoices").select("offer:fee_offers(project_id)").eq("id", id).maybeSingle();
  const { error } = await supabase.from("fee_invoices").delete().eq("id", id);
  if (error) return { error: "deleteFailed" };
  const projectId = invoice?.offer?.project_id;
  revalidatePath("/projekte", "layout");
  redirect(projectId ? `/projekte/${projectId}/honorar` : "/projekte");
}
