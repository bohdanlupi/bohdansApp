"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

import { Section } from "@/components/planning/fields";
import { Fact, NumberParam, OptionField, SaveIndicator, Toggle } from "@/components/planning/plan-ui";
import { usePlan } from "@/components/planning/use-plan";
import { Textarea } from "@/components/ui/textarea";
import { generatorTypes, type HeatingParams, type HeatingPlan } from "@/lib/heating/plan-schema";
import type { PlantData } from "@/lib/heating/plant-schema";
import { formatNumber } from "@/lib/number-input";

import { saveHeatingPlan, saveHeatingPlant } from "../../actions";

/**
 * 242 System: the building data of the project (for the checklists) and the heat generators of the chosen Anlage.
 * Both save automatically (the building into heating_plans, the Anlage into heating_plants).
 */
export function SystemEditor({
  projectId,
  initialPlan,
  plant,
  power,
  editable,
}: {
  projectId: string;
  initialPlan: HeatingPlan;
  plant: { id: string; name: string; data: PlantData };
  /** Building heat load of all calculations [kW], null without calculation. */
  power: number | null;
  editable: boolean;
}) {
  const t = useTranslations("heatingPlan");
  const building = usePlan(projectId, initialPlan, editable, saveHeatingPlan);
  const savePlant = useCallback((pid: string, data: unknown) => saveHeatingPlant(plant.id, pid, plant.name, data), [plant.id, plant.name]);
  const anlage = usePlan(projectId, plant.data, editable, savePlant);
  const p = building.plan.params;
  const d = anlage.plan;
  const setParam = <K extends keyof HeatingParams>(key: K, value: HeatingParams[K]) => building.update((x) => ({ ...x, params: { ...x.params, [key]: value } }));
  const setPlant = (patch: Partial<PlantData>) => anlage.update((x) => ({ ...x, ...patch }));
  const o = (group: string) => (value: string) => t(`options.${group}.${value}` as never);
  const status = building.status !== "saved" ? building.status : anlage.status;

  return (
    <div className="space-y-4">
      {editable && (
        <div className="flex justify-end">
          <SaveIndicator status={status} />
        </div>
      )}
      <Section title={t("system.building")} description={t("system.buildingHint")}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <OptionField label={t("params.buildingType")} value={p.buildingType} options={["efh", "mfh", "nonResidential"] as const} optionLabel={o("buildingType")} editable={editable} onChange={(v) => setParam("buildingType", v)} />
          <OptionField label={t("params.construction")} value={p.construction} options={["new", "renovation", "replacement"] as const} optionLabel={o("construction")} editable={editable} onChange={(v) => setParam("construction", v)} />
          <OptionField label={t("params.standard")} value={p.standard} options={["standard", "minergie"] as const} optionLabel={o("standard")} editable={editable} onChange={(v) => setParam("standard", v)} />
          <NumberParam label={t("params.energyArea")} value={p.energyArea} editable={editable} onChange={(v) => setParam("energyArea", v)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Toggle label={t("params.multiUnit")} checked={p.multiUnit} editable={editable} onChange={(v) => setParam("multiUnit", v)} />
          <Fact label={t("system.power")} value={power !== null ? `${formatNumber(power, 1)} kW` : t("system.powerNone")} />
        </div>
      </Section>

      <Section title={`${t("plant.label")}: ${plant.name}`}>
        <div className="grid gap-6 md:grid-cols-2">
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">{t("system.generators")}</legend>
            {generatorTypes.map((g) => (
              <Toggle
                key={g}
                label={o("generators")(g)}
                checked={d.generators.includes(g)}
                editable={editable}
                onChange={(on) => setPlant({ generators: generatorTypes.filter((x) => (x === g ? on : d.generators.includes(x))) })}
              />
            ))}
            <p className="text-xs text-muted-foreground">{t("system.generatorsHint")}</p>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">{t("system.more")}</legend>
            <Toggle label={t("system.cooling")} checked={d.cooling} editable={editable} onChange={(v) => setPlant({ cooling: v })} />
          </fieldset>
        </div>
        <div className="space-y-1">
          <label htmlFor="plant-notes" className="text-sm font-medium">
            {t("system.notes")}
          </label>
          <Textarea id="plant-notes" value={d.notes} maxLength={4000} disabled={!editable} onChange={(e) => setPlant({ notes: e.target.value })} className="min-h-24 bg-field" />
        </div>
      </Section>
    </div>
  );
}
