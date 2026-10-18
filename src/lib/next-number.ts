import { createClient } from "@/lib/supabase/server";

/** Next free number of the form 2026-001 in `table` (only numbers following that pattern count). */
export async function nextYearNumber(table: "projects" | "fee_offers") {
  const year = new Date().getFullYear();
  const supabase = await createClient();
  const { data } = await supabase.from(table).select("number").like("number", `${year}-%`);
  const highest = Math.max(0, ...(data ?? []).map((r) => Number(r.number.match(/^\d{4}-(\d+)$/)?.[1] ?? 0)));
  return `${year}-${String(highest + 1).padStart(3, "0")}`;
}
