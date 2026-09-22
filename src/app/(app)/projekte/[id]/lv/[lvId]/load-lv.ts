import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/** LV (with totals) of the given project, or null. Deduplicated per request. */
export const loadLv = cache(async (projectId: string, lvId: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(lvId)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("lv_list").select("*").eq("id", lvId).eq("project_id", projectId).maybeSingle();
  return data;
});
