import "server-only";

import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Suppliers (all active companies) and projects for the invoice form. */
export async function loadCreditorOptions(supabase: Supabase) {
  const [{ data: companies }, { data: projects }] = await Promise.all([
    supabase.from("companies").select("id, name, city").eq("archived", false).order("name"),
    supabase.from("projects").select("id, number, name").neq("status", "archived").order("number", { ascending: false }),
  ]);
  return { companies: companies ?? [], projects: projects ?? [] };
}
