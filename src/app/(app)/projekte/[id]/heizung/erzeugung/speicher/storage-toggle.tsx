"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

import { SaveIndicator, Toggle } from "@/components/planning/plan-ui";
import { usePlan } from "@/components/planning/use-plan";
import type { PlantData } from "@/lib/heating/plant-schema";

import { saveHeatingPlant } from "../../actions";

/** Energy storage present in the Anlage (filters the checklists until the chapter is worked out). */
export function StorageToggle({ projectId, plant, editable }: { projectId: string; plant: { id: string; name: string; data: PlantData }; editable: boolean }) {
  const t = useTranslations("heatingPlan");
  const save = useCallback((pid: string, data: unknown) => saveHeatingPlant(plant.id, pid, plant.name, data), [plant.id, plant.name]);
  const { plan, update, status } = usePlan(projectId, plant.data, editable, save);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
      <Toggle label={t("storageToggle")} checked={plan.storage} editable={editable} onChange={(v) => update((d) => ({ ...d, storage: v }))} />
      {editable && <SaveIndicator status={status} />}
    </div>
  );
}
