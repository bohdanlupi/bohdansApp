"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { languageToLocale, LOCALE_COOKIE } from "@/i18n/config";
import type { FormState } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

/** Only allow redirects to local paths. */
const safeNext = (next: string | undefined) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/");

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalidCredentials" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) return { error: "invalidCredentials" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("active, language")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile?.active) {
    await supabase.auth.signOut();
    return { error: "accountInactive" };
  }

  (await cookies()).set(LOCALE_COOKIE, languageToLocale(profile.language), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  redirect(safeNext(parsed.data.next));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object({ email: z.email() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalidEmail" };

  const supabase = await createClient();
  // The recovery email template links to {{ .SiteURL }}/auth/confirm with a token hash.
  await supabase.auth.resetPasswordForEmail(parsed.data.email);

  // Same answer whether or not the address exists.
  return { success: "resetEmailSent" };
}

const passwordSchema = z
  .object({ password: z.string().min(10), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"] });

export async function setPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const confirmMismatch = parsed.error.issues.some((i) => i.path[0] === "confirm");
    return { error: confirmMismatch ? "passwordMismatch" : "passwordTooShort" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "passwordUpdateFailed" };

  // From the profile page we stay; after an invite/recovery link we enter the app.
  if (formData.get("stay")) return { success: "passwordChanged" };
  redirect("/");
}
