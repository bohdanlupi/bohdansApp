import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/** Project by id (null for unknown or malformed ids). Deduplicated per request. */
export const loadProject = cache(async (id: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  return data;
});
