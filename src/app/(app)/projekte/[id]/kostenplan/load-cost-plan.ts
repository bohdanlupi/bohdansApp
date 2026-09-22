import "server-only";

import { costRows, type CostItem, type CostValues } from "@/lib/cost-plan";
import type { I18nText } from "@/lib/i18n-text";
import type { AppLanguage } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/server";

/** Everything the cost plan page and the KV PDF need. */
export async function loadCostPlan(projectId: string, templateId: string | null, language: AppLanguage) {
  const supabase = await createClient();
  const [{ data: items }, { data: values }, { data: lvAmounts }, { data: lvs }, { data: template }] = await Promise.all([
    templateId
      ? supabase.from("cost_plan_items").select("id, parent_id, code, name, sort").eq("template_id", templateId)
      : Promise.resolve({ data: [] }),
    supabase.from("project_cost_items").select("cost_plan_item_id, budget, manual_amount, note").eq("project_id", projectId),
    supabase.from("project_cost_lv_amounts").select("cost_plan_item_id, amount").eq("project_id", projectId),
    supabase.from("lv_list").select("id, number, title, cost_plan_item_id, estimate_total").eq("project_id", projectId).order("number"),
    templateId ? supabase.from("cost_plan_templates").select("name").eq("id", templateId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const rows = costRows(
    (items ?? []).map((i) => ({ ...i, name: i.name as I18nText })) as CostItem[],
    new Map((values ?? []).map((v) => [v.cost_plan_item_id, v as CostValues])),
    new Map((lvAmounts ?? []).filter((a) => a.cost_plan_item_id).map((a) => [a.cost_plan_item_id!, a.amount ?? 0])),
    language,
  );

  // LVs without a code: their positions only count when they have their own code.
  const assigned = new Set((items ?? []).map((i) => i.id));
  const unassignedLvs = (lvs ?? []).filter((lv) => !lv.cost_plan_item_id || !assigned.has(lv.cost_plan_item_id));

  return { rows, templateName: template?.name ?? null, lvs: lvs ?? [], unassignedLvs };
}
