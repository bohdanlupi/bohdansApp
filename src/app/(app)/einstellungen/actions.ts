"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { languageToLocale, LOCALE_COOKIE } from "@/i18n/config";
import { assertRole, getCurrentProfile } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { languageSchema, optionalText } from "@/lib/validation";

const firmSchema = z.object({
  name: z.string().trim().min(1),
  street: optionalText,
  zip: optionalText,
  city: optionalText,
  phone: optionalText,
  email: optionalText,
  website: optionalText,
  uid_number: optionalText,
  bank_name: optionalText,
  iban: optionalText,
  bic: optionalText,
  managing_director: optionalText,
  vat_rate: z.coerce.number().min(0).max(100),
  offer_validity_days: z.coerce.number().int().min(0).max(365),
  payment_terms_days: z.coerce.number().int().min(0).max(365),
});

export async function updateFirmSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await assertRole("admin");
  const parsed = firmSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("firm_settings")
    .update({ ...parsed.data, updated_by: admin.id })
    .eq("id", true);
  if (error) return { error: "saveFailed" };

  revalidatePath("/einstellungen");
  return { success: "saved" };
}

const roleSchema = z.enum(["admin", "planer", "viewer"]);

const inviteSchema = z.object({
  email: z.email(),
  full_name: z.string().trim().min(1),
  role: roleSchema,
  language: languageSchema,
});

export async function inviteUser(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertRole("admin");
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalidInput" };

  const { email, full_name, role, language } = parsed.data;
  const adminClient = createAdminClient();

  // The invite email template links to {{ .SiteURL }}/auth/confirm (Supabase dashboard setting).
  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name, language },
  });
  if (error || !data.user) {
    return { error: error?.code === "email_exists" ? "userExists" : "inviteFailed" };
  }

  // The profile row is created by a trigger; set the chosen role on it.
  await adminClient.from("profiles").update({ role }).eq("id", data.user.id);

  revalidatePath("/einstellungen/benutzer");
  return { success: "inviteSent" };
}

const userUpdateSchema = z.object({
  id: z.uuid(),
  role: roleSchema,
  active: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export async function updateUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await assertRole("admin");
  const parsed = userUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalidInput" };

  // Admins cannot lock themselves out.
  if (parsed.data.id === admin.id && (parsed.data.role !== "admin" || !parsed.data.active)) {
    return { error: "cannotDemoteSelf" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role: parsed.data.role, active: parsed.data.active })
    .eq("id", parsed.data.id);
  if (error) return { error: "saveFailed" };

  revalidatePath("/einstellungen/benutzer");
  return { success: "saved" };
}

const profileSchema = z.object({
  full_name: z.string().trim().min(1),
  language: languageSchema,
});

export async function updateOwnProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "notLoggedIn" };

  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", profile.id);
  if (error) return { error: "saveFailed" };

  (await cookies()).set(LOCALE_COOKIE, languageToLocale(parsed.data.language), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  revalidatePath("/", "layout");
  return { success: "saved" };
}
