import { z } from "zod";

import type { AppLanguage } from "@/lib/supabase/types";

// Shared parts of the SIA 108 planning dossiers (Lüftung, Heizung): checklist items, their states and the
// lenient parsing helpers of the plan data.

export type L10n = Record<AppLanguage, string>;

/** Checklist item; `ref` is the clause to look up, `when` limits it to matching design criteria. */
export type PlanChecklistItem<P> = { id: string; ref: string; text: L10n; when?: (p: P) => boolean };

export const checkSchema = z.object({
  s: z.enum(["done", "na", "open"]),
  n: z.string().max(1000).catch("").optional(),
});

export type CheckState = z.infer<typeof checkSchema>;

/** Record whose invalid entries are dropped one by one (instead of losing the whole record). */
export const lenientRecord = <T extends z.ZodType>(value: T, keyMax = 60) =>
  z
    .record(z.string(), z.unknown())
    .transform((obj) => {
      const out: Record<string, z.infer<T>> = {};
      for (const [key, raw] of Object.entries(obj)) {
        const parsed = value.safeParse(raw);
        if (key.length <= keyMax && parsed.success) out[key] = parsed.data;
      }
      return out;
    })
    .catch({});

/** An item counts as handled when it is done or not applicable. */
export const isHandled = (state: { s: string } | undefined) => state?.s === "done" || state?.s === "na";

type ChecklistPhase<P> = { sections: ({ kind: "checklist"; items: PlanChecklistItem<P>[] } | { kind: string })[] };

/** Checklist items of a phase that apply to the project. */
export const phaseItems = <P>(phase: ChecklistPhase<P>, params: P): PlanChecklistItem<P>[] =>
  phase.sections.flatMap((s) =>
    s.kind === "checklist" && "items" in s ? s.items.filter((item) => !item.when || item.when(params)) : [],
  );

export function phaseProgress<P>(phase: ChecklistPhase<P>, params: P, checks: Record<string, { s: string }>) {
  const items = phaseItems(phase, params);
  const done = items.filter((item) => isHandled(checks[item.id])).length;
  return { done, total: items.length };
}
