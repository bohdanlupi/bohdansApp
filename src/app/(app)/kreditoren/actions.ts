"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { CompanyOption } from "@/components/company-picker";
import { assertRole } from "@/lib/auth";
import { creditorCategories, creditorStatuses, splitLines } from "@/lib/creditors";
import type { FormState } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";
import { optionalDate, optionalText } from "@/lib/validation";

const BUCKET = "receipts";
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });

const invoiceSchema = z.object({
  id: z.uuid(),
  company_id: z.uuid(),
  project_id: z.union([z.uuid(), z.literal("").transform(() => null)]),
  number: z.string().trim().max(80),
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  due_date: optionalDate,
  status: z.enum(creditorStatuses),
  // The form only renders the field once the status is paid, so it may be missing entirely.
  paid_date: optionalDate.optional(),
  category: z.enum(creditorCategories),
  // Amounts incl. MWST per rate, sent as JSON by the form.
  vat_lines: z
    .string()
    .transform((v, ctx) => {
      try {
        return JSON.parse(v);
      } catch {
        ctx.addIssue({ code: "custom" });
        return z.NEVER;
      }
    })
    .pipe(z.array(z.object({ rate: z.number().min(0).max(100), total: z.number().finite() })).min(1).max(4)),
  description: z.string().trim().max(2000),
  // Uploaded from the browser into <id>/<name> before the form is sent; empty = no document.
  file_path: optionalText,
  file_name: optionalText,
});

/**
 * Create (`isNew`) or update a received invoice. The id comes from the form, so the document can be uploaded to the
 * storage bucket before the row exists. Paid without a date = paid today; a replaced document is removed.
 */
export async function saveCreditorInvoice(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin", "planer");
  const parsed = invoiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalidInput" };
  const { id, ...values } = parsed.data;
  if (values.file_path && !values.file_path.startsWith(`${id}/`)) return { error: "invalidInput" };
  const vat_lines = values.vat_lines.map((l) => ({ rate: l.rate, total: Math.round(l.total * 100) / 100 }));
  const row = { ...values, vat_lines, total: splitLines(vat_lines).total, paid_date: values.status === "paid" ? (values.paid_date ?? today()) : null };

  const supabase = await createClient();
  const isNew = formData.get("isNew") === "1";
  if (isNew) {
    const { error } = await supabase.from("creditor_invoices").insert({ id, ...row });
    if (error) return { error: "saveFailed" };
  } else {
    const { data: old } = await supabase.from("creditor_invoices").select("file_path").eq("id", id).maybeSingle();
    if (!old) return { error: "invalidInput" };
    const { error } = await supabase.from("creditor_invoices").update(row).eq("id", id);
    if (error) return { error: "saveFailed" };
    if (old.file_path && old.file_path !== row.file_path) await supabase.storage.from(BUCKET).remove([old.file_path]);
  }

  revalidatePath("/kreditoren");
  if (isNew) redirect("/kreditoren");
  revalidatePath(`/kreditoren/${id}`);
  return { success: "saved" };
}

/** Mark as paid (today) or back to open, from the list. */
export async function setCreditorPaid(id: string, paid: boolean): Promise<{ error?: string }> {
  await assertRole("admin", "planer");
  if (!z.uuid().safeParse(id).success) return { error: "invalidInput" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("creditor_invoices")
    .update(paid ? { status: "paid", paid_date: today() } : { status: "open", paid_date: null })
    .eq("id", id);
  if (error) return { error: "saveFailed" };
  revalidatePath("/kreditoren");
  return {};
}

export async function deleteCreditorInvoice(id: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!z.uuid().safeParse(id).success) return { error: "invalidInput" };
  const supabase = await createClient();
  const { data: invoice } = await supabase.from("creditor_invoices").select("file_path").eq("id", id).maybeSingle();
  const { error } = await supabase.from("creditor_invoices").delete().eq("id", id);
  if (error) return { error: "deleteFailed" };
  if (invoice?.file_path) await supabase.storage.from(BUCKET).remove([invoice.file_path]);
  revalidatePath("/kreditoren");
  redirect("/kreditoren");
}

const quickCompanySchema = z.object({ name: z.string().trim().min(1).max(200), street: optionalText, zip: optionalText, city: optionalText });

/** New supplier from the invoice form: a company in the address book with the category Lieferant. */
export async function createSupplier(input: unknown): Promise<{ company?: CompanyOption; error?: string }> {
  await assertRole("admin", "planer");
  const parsed = quickCompanySchema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .insert({ ...parsed.data, categories: ["supplier"] })
    .select("id, name, city")
    .single();
  if (error || !data) return { error: "saveFailed" };
  revalidatePath("/adressen");
  return { company: data };
}
