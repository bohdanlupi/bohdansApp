import "server-only";

import { costItemOptions, type CostItem } from "@/lib/cost-plan";
import type { I18nText } from "@/lib/i18n-text";
import type { AppLanguage } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/server";

/** Cost codes of the project's code list as select options. */
export async function loadCostOptions(templateId: string | null, language: AppLanguage) {
  if (!templateId) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("cost_plan_items").select("id, parent_id, code, name, sort").eq("template_id", templateId);
  return costItemOptions((data ?? []).map((i) => ({ ...i, name: i.name as I18nText })) as CostItem[], language);
}
