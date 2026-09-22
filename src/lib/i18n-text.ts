import type { AppLanguage } from "@/lib/supabase/types";

/** Multilingual content as stored in jsonb columns: { de: "...", fr: "...", it: "..." }. */
export type I18nText = Partial<Record<AppLanguage, string>>;

export const contentLanguages: AppLanguage[] = ["de", "fr", "it"];

/**
 * Text in the requested language, falling back to German, then any language.
 * `missing` is true when the requested translation had to be substituted.
 */
export function pickText(text: I18nText | null | undefined, language: AppLanguage) {
  const wanted = text?.[language]?.trim();
  if (wanted) return { value: wanted, missing: false };

  const fallback = text?.de?.trim() || contentLanguages.map((l) => text?.[l]?.trim()).find(Boolean) || "";
  return { value: fallback, missing: true };
}
