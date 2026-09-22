import { z } from "zod";

/** Trimmed text; empty input becomes null. */
export const optionalText = z
  .string()
  .trim()
  .transform((v) => v || null);

/** yyyy-mm-dd from a date input; empty input becomes null. */
export const optionalDate = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v))
  .transform((v) => v || null);

export const languageSchema = z.enum(["de", "fr", "it"]);

/** Postgres error codes returned by Supabase. */
export const PG_UNIQUE_VIOLATION = "23505";
export const PG_FOREIGN_KEY_VIOLATION = "23503";

/**
 * Splits a search query into lowercase words that are safe inside a PostgREST `ilike` filter.
 * Every word has to appear somewhere in the row's `search_text`.
 */
export function searchWords(query: string | undefined): string[] {
  return (query ?? "")
    .toLowerCase()
    .replace(/[%_*,()\\"]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
}

/** First value of a search param (Next passes repeated params as arrays). */
export function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
