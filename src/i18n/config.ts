import type { AppLanguage } from "@/lib/supabase/types";

/** UI locales. Swiss variants so numbers/dates format as 1'234.50 and 22.09.2026. */
export const locales = ["de-CH", "fr-CH", "it-CH"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "de-CH";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const isLocale = (value: unknown): value is Locale => locales.includes(value as Locale);

/** Content language (catalogue/LV texts) ↔ UI locale. */
export const localeToLanguage = (locale: Locale): AppLanguage => locale.slice(0, 2) as AppLanguage;
export const languageToLocale = (language: AppLanguage): Locale => `${language}-CH` as Locale;

export const localeLabels: Record<Locale, string> = {
  "de-CH": "Deutsch",
  "fr-CH": "Français",
  "it-CH": "Italiano",
};
