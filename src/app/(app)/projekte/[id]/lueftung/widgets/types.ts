import type { KwlEvaluation } from "@/lib/kwl/evaluate";
import type { PlanData } from "@/lib/kwl/plan-schema";
import type { KwlData } from "@/lib/kwl/schema";
import type { AppLanguage } from "@/lib/supabase/types";

export type WidgetCalc = { id: string; name: string; data: KwlData; result: KwlEvaluation };

export type WidgetProps = {
  plan: PlanData;
  update: (change: (plan: PlanData) => PlanData) => void;
  projectId: string;
  calcs: WidgetCalc[];
  lvs: { id: string; number: string; title: string; position_count: number | null; estimate_total: number | null }[];
  language: AppLanguage;
  editable: boolean;
};

/** Reads / writes a free numeric input of the plan. */
export const planInput = (props: Pick<WidgetProps, "plan" | "update">, key: string, fallback: number | null = null) => ({
  value: key in props.plan.inputs ? props.plan.inputs[key] : fallback,
  set: (value: number | null) => props.update((d) => ({ ...d, inputs: { ...d.inputs, [key]: value } })),
});
