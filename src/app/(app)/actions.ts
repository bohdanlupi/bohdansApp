"use server";

import { cookies } from "next/headers";

import { isLocale, LOCALE_COOKIE, localeToLanguage, type Locale } from "@/i18n/config";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Switches the UI language and remembers it on the user's profile. */
export async function setLocale(locale: Locale) {
  if (!isLocale(locale)) return;

  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });

  const profile = await getCurrentProfile();
  if (profile) {
    const supabase = await createClient();
    await supabase.from("profiles").update({ language: localeToLanguage(locale) }).eq("id", profile.id);
  }
}
