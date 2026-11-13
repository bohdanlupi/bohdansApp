"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { FormMessageKey } from "@/components/form";
import type { SaveStatus } from "@/components/planning/use-plan";
import type { FirePlans, FireTrade } from "@/lib/fire/phases";
import type { CheckState } from "@/lib/planning";

import { patchTradePlan } from "./actions";

export type TradePlans = Pick<FirePlans, FireTrade>;

/**
 * The Heizung / Lüftung / Sanitär plans as seen from the Brandschutz pages: changes are applied locally at once and
 * sent as a patch of the changed keys only (the trade pages may be edited in parallel).
 */
export function useTradePlans(projectId: string, initial: TradePlans, editable: boolean) {
  const tForms = useTranslations("forms");
  const [plans, setPlans] = useState(initial);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(false);

  const send = useCallback(
    async (trade: FireTrade, patch: { checks?: Record<string, CheckState | null>; params?: Record<string, unknown> }) => {
      setPending((n) => n + 1);
      const result = await patchTradePlan(projectId, trade, patch);
      setPending((n) => n - 1);
      setFailed(!!result.error);
      if (result.error) toast.error(tForms(result.error as FormMessageKey));
    },
    [projectId, tForms],
  );

  const setCheck = useCallback(
    (trade: FireTrade, id: string, value: CheckState | null) => {
      if (!editable) return;
      setPlans((prev) => {
        const checks: Record<string, CheckState> = { ...prev[trade].checks };
        if (value) checks[id] = value;
        else delete checks[id];
        return { ...prev, [trade]: { ...prev[trade], checks } };
      });
      void send(trade, { checks: { [id]: value } });
    },
    [editable, send],
  );

  const setParam = useCallback(
    <T extends FireTrade, K extends keyof TradePlans[T]["params"] & string>(trade: T, key: K, value: TradePlans[T]["params"][K]) => {
      if (!editable) return;
      setPlans((prev) => ({ ...prev, [trade]: { ...prev[trade], params: { ...prev[trade].params, [key]: value } } }));
      void send(trade, { params: { [key]: value } });
    },
    [editable, send],
  );

  const status: SaveStatus = pending > 0 ? "saving" : failed ? "error" : "saved";
  return { plans, setCheck, setParam, status };
}
