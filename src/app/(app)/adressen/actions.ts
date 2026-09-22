"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { companyCategories, onlyKnown, salutations, trades } from "@/lib/address-options";
import { assertRole } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";
import { languageSchema, optionalText, PG_FOREIGN_KEY_VIOLATION } from "@/lib/validation";

const companySchema = z.object({
  name: z.string().trim().min(1),
  name2: optionalText,
  street: optionalText,
  po_box: optionalText,
  zip: optionalText,
  city: optionalText,
  country: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase() || "CH"),
  phone: optionalText,
  email: optionalText,
  website: optionalText,
  uid_number: optionalText,
  language: languageSchema,
  notes: optionalText,
});

function readCompany(formData: FormData) {
  const parsed = companySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    categories: onlyKnown(formData.getAll("categories").map(String), companyCategories),
    trades: onlyKnown(formData.getAll("trades").map(String), trades),
    archived: formData.get("archived") === "on",
  };
}

export async function createCompany(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin", "planer");
  const company = readCompany(formData);
  if (!company) return { error: "invalidInput" };

  const supabase = await createClient();
  const { data, error } = await supabase.from("companies").insert(company).select("id").single();
  if (error || !data) return { error: "saveFailed" };

  revalidatePath("/adressen");
  redirect(`/adressen/${data.id}`);
}

export async function updateCompany(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin", "planer");
  const id = z.uuid().safeParse(formData.get("id"));
  const company = readCompany(formData);
  if (!id.success || !company) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.from("companies").update(company).eq("id", id.data);
  if (error) return { error: "saveFailed" };

  revalidatePath("/adressen");
  revalidatePath(`/adressen/${id.data}`);
  return { success: "saved" };
}

export async function deleteCompany(id: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!z.uuid().safeParse(id).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) return { error: error.code === PG_FOREIGN_KEY_VIOLATION ? "companyInUse" : "deleteFailed" };

  revalidatePath("/adressen");
  redirect("/adressen");
}

const contactSchema = z.object({
  id: z.union([z.uuid(), z.literal("")]),
  company_id: z.uuid(),
  salutation: z.union([z.enum(salutations), z.literal("")]).transform((v) => v || null),
  first_name: optionalText,
  last_name: z.string().trim().min(1),
  function: optionalText,
  phone: optionalText,
  mobile: optionalText,
  email: optionalText,
  language: z.union([languageSchema, z.literal("")]).transform((v) => v || null),
  notes: optionalText,
});

export async function saveContact(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin", "planer");
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalidInput" };

  const { id, ...contact } = parsed.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("contacts").update(contact).eq("id", id)
    : await supabase.from("contacts").insert(contact);
  if (error) return { error: "saveFailed" };

  revalidatePath(`/adressen/${contact.company_id}`);
  return { success: "saved" };
}

export async function deleteContact(id: string, companyId: string): Promise<FormState> {
  await assertRole("admin", "planer");
  if (!z.uuid().safeParse(id).success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) return { error: "deleteFailed" };

  revalidatePath(`/adressen/${companyId}`);
  return {};
}

