"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { companyCategories, onlyKnown, trades } from "@/lib/address-options";
import { assertRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { languageSchema } from "@/lib/validation";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

const rowSchema = z.object({
  name: text(300),
  name2: text(300),
  street: text(300),
  po_box: text(100),
  zip: text(20),
  city: text(200),
  country: text(2),
  phone: text(100),
  email: text(300),
  website: text(300),
  uid_number: text(50),
  notes: text(5000),
  contact_salutation: z.enum(["mr", "ms"]).optional().transform((v) => v ?? null),
  contact_first_name: text(200),
  contact_last_name: text(200),
  contact_function: text(200),
  contact_phone: text(100),
  contact_mobile: text(100),
  contact_email: text(300),
});

const importSchema = z.object({
  rows: z.array(rowSchema).min(1).max(10000),
  language: languageSchema,
  categories: z.array(z.string()),
  trades: z.array(z.string()),
});

export type ImportResult = { error?: "invalidInput" | "importFailed"; companies?: number; contacts?: number; skipped?: number };

/** Imports mapped CSV rows in one transaction (see supabase/migrations/…_import_addresses.sql). */
export async function importAddresses(input: z.input<typeof importSchema>): Promise<ImportResult> {
  await assertRole("admin", "planer");
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_addresses", {
    import_rows: parsed.data.rows,
    company_language: parsed.data.language,
    company_categories: onlyKnown(parsed.data.categories, companyCategories),
    company_trades: onlyKnown(parsed.data.trades, trades),
  });
  if (error || !data) return { error: "importFailed" };

  revalidatePath("/adressen");
  const result = data as { companies: number; contacts: number; skipped: number };
  return { companies: result.companies, contacts: result.contacts, skipped: result.skipped };
}
