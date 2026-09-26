"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { FormMessageKey } from "@/components/form";

export type SaveStatus = "saved" | "pending" | "saving" | "error";

export type SavePlan = (projectId: string, data: unknown) => Promise<{ error?: string }>;

/** Plan data with debounced autosave (every change is saved ~0.8 s later). */
export function usePlan<T>(projectId: string, initial: T, editable: boolean, savePlan: SavePlan) {
  const tForms = useTranslations("forms");
  const [plan, setPlan] = useState(initial);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const latest = useRef(plan);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    timer.current = null;
    setStatus("saving");
    const result = await savePlan(projectId, latest.current);
    if (result.error) {
      setStatus("error");
      toast.error(tForms(result.error as FormMessageKey));
    } else if (!timer.current) {
      setStatus("saved");
    }
  }, [projectId, savePlan, tForms]);

  const update = useCallback(
    (change: (plan: T) => T) => {
      if (!editable) return;
      setPlan((prev) => {
        const next = change(prev);
        latest.current = next;
        return next;
      });
      setStatus("pending");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 800);
    },
    [editable, flush],
  );

  // Save pending changes when leaving the page.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (timer.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (timer.current) {
        clearTimeout(timer.current);
        void savePlan(projectId, latest.current);
      }
    };
  }, [projectId, savePlan]);

  return { plan, update, status };
}
