"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useCallback, useMemo } from "react";

import { NativeSelect } from "@/components/form";
import { NumberField, Notice, Section } from "@/components/planning/fields";
import { Fact, NumberParam, OptionField, SaveIndicator, Toggle } from "@/components/planning/plan-ui";
import { usePlan } from "@/components/planning/use-plan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { buildGenerationSchema, generationLabels } from "@/lib/heating/generation-schema";
import { emitterTypes, generatorTypes, type HeatingParams, type HeatingPlan } from "@/lib/heating/plan-schema";
import { storageTemperatures } from "@/lib/heating/hydraulics";
import {
  circuitMismatch,
  circuitTypes,
  distributorTypes,
  type GeneratorUnit,
  generatorName,
  hotWaterCoilTypes,
  hotWaterConnections,
  hotWaterHeaters,
  hotWaterUnit,
  type HeatingGroup,
  pumpsInside,
  type PlantData,
  storageConnections,
  tankSensors,
} from "@/lib/heating/plant-schema";
import { evaluateEws, ewsContextOf } from "@/lib/heating/ews";
import { evaluateSafety } from "@/lib/heating/safety";
import type { SchemaPlan } from "@/lib/kwl/schema-plan";
import { formatNumber } from "@/lib/number-input";
import { cn } from "@/lib/utils";

import type { LvWithChapters } from "../../lueftung/anlagen/[systemId]/quantities-panel";
import { SchemaPrintButton } from "../../lueftung/anlagen/[systemId]/schema-print-dialog";
import { saveHeatingPlan, saveHeatingPlant, saveHeatingSchemaPlan } from "../actions";
import { GenerationSchemaView } from "./generation-schema-view";
import { EwsSection } from "./ews-section";
import { MaterialSection } from "./material-section";
import { SafetySection } from "./safety-section";

/**
 * 242 Wärmeerzeugung: the building data of the project (for the checklists) and the chosen Anlage in four sectors –
 * Wärmequelle, Warmwasser, Energiespeicher, Verteiler with the Heizgruppen – with its Prinzipschema drawn live below.
 * Both save automatically (the building into heating_plans, the Anlage into heating_plants).
 */
export function GenerationEditor({
  projectId,
  initialPlan,
  plant,
  power,
  lvs,
  editable,
}: {
  projectId: string;
  initialPlan: HeatingPlan;
  plant: { id: string; name: string; data: PlantData; schemaPlan: SchemaPlan };
  /** Building heat load of all calculations [kW], null without calculation. */
  power: number | null;
  /** LVs of the project with their chapters, for inserting the Materialauszug. */
  lvs: LvWithChapters[];
  editable: boolean;
}) {
  const t = useTranslations("heatingPlan");
  const tg = useTranslations("heatingPlan.generation");
  const building = usePlan(projectId, initialPlan, editable, saveHeatingPlan);
  const savePlant = useCallback((pid: string, data: unknown) => saveHeatingPlant(plant.id, pid, plant.name, data), [plant.id, plant.name]);
  const anlage = usePlan(projectId, plant.data, editable, savePlant);
  const p = building.plan.params;
  const d = anlage.plan;
  const setParam = <K extends keyof HeatingParams>(key: K, value: HeatingParams[K]) => building.update((x) => ({ ...x, params: { ...x.params, [key]: value } }));
  const setPlant = (patch: Partial<PlantData>) => anlage.update((x) => ({ ...x, ...patch }));
  const setUnit = (id: string, patch: Partial<GeneratorUnit>) => anlage.update((x) => ({ ...x, generators: x.generators.map((u) => (u.id === id ? { ...u, ...patch } : u)) }));
  const unitName = (u: GeneratorUnit) => generatorName(d.generators, u, (g) => tg(`short.${g}` as never));
  const setGroup = (id: string, patch: Partial<HeatingGroup>) => anlage.update((x) => ({ ...x, groups: x.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
  const o = (group: string) => (value: string) => t(`options.${group}.${value}` as never);
  const status = building.status !== "saved" ? building.status : anlage.status;

  const labels = useMemo(() => generationLabels((key) => tg(key as never)), [tg]);
  const ewsCtx = useMemo(() => ewsContextOf(building.plan, (power ?? 0) * 1000), [building.plan, power]);
  const hasEws = d.generators.some((g) => g.type === "hpBrine");
  const ews = useMemo(() => (hasEws ? evaluateEws(d, ewsCtx) : null), [d, ewsCtx, hasEws]);
  const schema = useMemo(() => buildGenerationSchema(d, labels, { ews: ewsCtx }), [d, labels, ewsCtx]);
  const safety = useMemo(() => evaluateSafety(d, ews), [d, ews]);
  const temps = useMemo(() => storageTemperatures(d), [d]);
  const wwUnit = hotWaterUnit(d);
  const mismatched = d.groups.filter((g) => circuitMismatch(g.circuit, d.distributor));

  return (
    <div className="space-y-4">
      {editable && (
        <div className="flex justify-end">
          <SaveIndicator status={status} />
        </div>
      )}
      <Section title={t("system.building")} description={t("system.buildingHint")} collapseKey="heating-generation:building">
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

      <Section title={`1 · ${tg("sectors.source")}`} description={t("system.generatorsHint")} collapseKey="heating-generation:source">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{t("system.generators")}</h3>
            {editable && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => anlage.update((x) => ({ ...x, generators: [...x.generators, { id: crypto.randomUUID(), type: x.generators.at(-1)?.type ?? "hpAir", name: "", power: null, deltaT: null, internalPumps: { source: false, heating: false, hotWater: false } }] }))}
              >
                <Plus /> {tg("addGenerator")}
              </Button>
            )}
          </div>
          {d.generators.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tg("noGenerators")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2 font-medium">{tg("generatorColumns.type")}</th>
                    <th className="py-1 pr-2 font-medium">{tg("generatorColumns.name")}</th>
                    <th className="w-28 py-1 pr-2 text-right font-medium">{tg("generatorColumns.power")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {d.generators.map((u) => (
                    <Fragment key={u.id}>
                      <tr className="border-t">
                        <td className="py-1.5 pr-2">
                          <NativeSelect value={u.type} disabled={!editable} aria-label={tg("generatorColumns.type")} onChange={(e) => setUnit(u.id, { type: e.target.value as GeneratorUnit["type"] })}>
                            {generatorTypes.map((g) => (
                              <option key={g} value={g}>
                                {o("generators")(g)}
                              </option>
                            ))}
                          </NativeSelect>
                        </td>
                        <td className="py-1.5 pr-2">
                          <Input value={u.name} maxLength={60} disabled={!editable} placeholder={unitName(u)} aria-label={tg("generatorColumns.name")} onChange={(e) => setUnit(u.id, { name: e.target.value })} className="h-8 bg-field" />
                        </td>
                        <td className="py-1.5 pr-2">
                          <NumberField value={u.power} decimals={1} label={tg("generatorColumns.power")} disabled={!editable} onChange={(v) => setUnit(u.id, { power: v })} className="h-8 rounded-lg" />
                        </td>
                        <td className="py-1.5 text-right">
                          {editable && (
                            <Button size="icon" variant="ghost" aria-label={tg("removeGenerator")} onClick={() => anlage.update((x) => ({ ...x, generators: x.generators.filter((y) => y.id !== u.id) }))}>
                              <Trash2 />
                            </Button>
                          )}
                        </td>
                      </tr>
                      <InternalPumps unit={u} wwUnit={d.hotWaterConnection === "generator" ? wwUnit : null} forced={pumpsInside(d, u).forced} editable={editable} onChange={(internalPumps) => setUnit(u.id, { internalPumps })} />
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Toggle label={t("system.cooling")} checked={d.cooling} editable={editable} onChange={(v) => setPlant({ cooling: v })} />
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={`2 · ${tg("sectors.hotWater")}`} collapseKey="heating-generation:hotWater">
          <Toggle label={tg("hotWater")} checked={d.hotWater} editable={editable} onChange={(v) => setPlant({ hotWater: v })} />
          {d.hotWater && (
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberParam label={tg("volume")} value={d.hotWaterVolume} editable={editable} onChange={(v) => setPlant({ hotWaterVolume: v })} />
              <OptionField label={tg("hotWaterHeater")} value={d.hotWaterHeater} options={hotWaterHeaters} optionLabel={(v) => tg(`hotWaterHeaters.${v}`)} editable={editable} onChange={(v) => setPlant({ hotWaterHeater: v })} />
              {d.hotWaterHeater === "coil" && (
                <OptionField label={tg("hotWaterCoils")} value={d.hotWaterCoils} options={hotWaterCoilTypes} optionLabel={(v) => tg(`hotWaterCoilTypes.${v}`)} editable={editable} onChange={(v) => setPlant({ hotWaterCoils: v })} />
              )}
              <OptionField label={tg("tankSensor")} value={d.hotWaterSensor} options={tankSensors} optionLabel={(v) => tg(`tankSensors.${v}`)} editable={editable} onChange={(v) => setPlant({ hotWaterSensor: v })} />
              <NumberParam label={tg("hotWaterElectric")} value={d.hotWaterElectric} decimals={1} editable={editable} onChange={(v) => setPlant({ hotWaterElectric: v ?? 0 })} hint={tg("hotWaterElectricHint")} />
              <OptionField label={tg("hotWaterConnection")} value={d.hotWaterConnection} options={hotWaterConnections} optionLabel={(v) => tg(`hotWaterConnections.${v}`)} editable={editable} onChange={(v) => setPlant({ hotWaterConnection: v })} />
              {(d.hotWaterConnection === "generator" || d.hotWaterConnection === "internal") && d.generators.length > 1 && (
                <OptionField
                  label={tg("hotWaterGenerator")}
                  value={d.generators.some((u) => u.id === d.hotWaterGenerator) ? d.hotWaterGenerator! : d.generators[0].id}
                  options={d.generators.map((u) => u.id)}
                  optionLabel={(id) => unitName(d.generators.find((u) => u.id === id)!)}
                  editable={editable}
                  onChange={(v) => setPlant({ hotWaterGenerator: v })}
                />
              )}
              {d.hotWaterConnection === "group" && (
                <div className="space-y-1.5">
                  <label htmlFor="ww-group" className="text-sm font-medium">
                    {tg("hotWaterGroup")}
                  </label>
                  <NativeSelect id="ww-group" value={d.hotWaterGroup ?? ""} disabled={!editable} onChange={(e) => setPlant({ hotWaterGroup: e.target.value || null })}>
                    <option value="">–</option>
                    {d.groups.map((g, i) => (
                      <option key={g.id} value={g.id}>
                        {g.name || `${tg("schema.group")} ${i + 1}`}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              )}
            </div>
          )}
          {d.hotWater && (d.hotWaterConnection === "generator" || d.hotWaterConnection === "internal") && d.generators.length === 0 && <Notice>{tg("hotWaterNoGenerator")}</Notice>}
          {d.hotWater && d.hotWaterConnection === "group" && !d.groups.some((g) => g.id === d.hotWaterGroup) && <Notice>{tg("hotWaterNoGroup")}</Notice>}
        </Section>
        <Section title={`3 · ${tg("sectors.storage")}`} collapseKey="heating-generation:storage">
          <Toggle label={t("storageToggle")} checked={d.storage} editable={editable} onChange={(v) => setPlant({ storage: v })} />
          {d.storage && (
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberParam label={tg("volume")} value={d.storageVolume} editable={editable} onChange={(v) => setPlant({ storageVolume: v })} />
              <OptionField label={tg("storageConnection")} value={d.storageConnection} options={storageConnections} optionLabel={(v) => tg(`storageConnections.${v}`)} editable={editable} onChange={(v) => setPlant({ storageConnection: v })} hint={tg(`storageConnectionHint.${d.storageConnection}`)} />
              <OptionField label={tg("tankSensor")} value={d.storageSensor} options={tankSensors} optionLabel={(v) => tg(`tankSensors.${v}`)} editable={editable} onChange={(v) => setPlant({ storageSensor: v })} />
              <Fact label={tg("storageTemp")} value={temps.storage !== null ? `${formatNumber(temps.storage, 0)} °C` : tg("storageTempNone")} />
              <Fact label={tg("storageReturn")} value={temps.ret !== null ? `${formatNumber(temps.ret, 1)} °C${temps.flow !== null ? ` · ${formatNumber(temps.flow * 1000, 0)} l/h` : ""}` : "–"} />
            </div>
          )}
          {d.storage && <p className="text-xs text-muted-foreground">{tg("storageTempHint")}</p>}
        </Section>
      </div>

      <Section
        title={`4 · ${tg("sectors.distribution")}`}
        collapseKey="heating-generation:distribution"
        actions={
          editable && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                anlage.update((x) => ({
                  ...x,
                  groups: [...x.groups, { id: crypto.randomUUID(), name: "", circuit: x.distributor === "pressurized" ? "injection3" : "mixing", emitter: null, power: null, supplyTemp: null, returnTemp: null, heatMeter: false, safetyThermostat: false }],
                }))
              }
            >
              <Plus /> {tg("addGroup")}
            </Button>
          )
        }
      >
        <div className="max-w-sm">
          <OptionField label={tg("distributor")} value={d.distributor} options={distributorTypes} optionLabel={(v) => tg(`distributors.${v}`)} editable={editable} onChange={(v) => setPlant({ distributor: v })} hint={tg(`distributorHint.${d.distributor}`)} />
        </div>
        {d.groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tg("noGroups")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2 font-medium">{tg("columns.name")}</th>
                  <th className="py-1 pr-2 font-medium">{tg("columns.circuit")}</th>
                  <th className="py-1 pr-2 font-medium">{tg("columns.emitter")}</th>
                  <th className="w-20 py-1 pr-2 text-right font-medium">{tg("columns.power")}</th>
                  <th className="w-16 py-1 pr-2 text-right font-medium">{tg("columns.supply")}</th>
                  <th className="w-16 py-1 pr-2 text-right font-medium">{tg("columns.return")}</th>
                  <th className="py-1 pr-2 text-center font-medium">{tg("columns.heatMeter")}</th>
                  <th className="py-1 pr-2 text-center font-medium">{tg("columns.safetyThermostat")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.groups.map((g, i) => (
                  <tr key={g.id} className="border-t">
                    <td className="py-1.5 pr-2">
                      <Input value={g.name} maxLength={80} disabled={!editable} placeholder={`${tg("schema.group")} ${i + 1}`} aria-label={tg("columns.name")} onChange={(e) => setGroup(g.id, { name: e.target.value })} className="h-8 bg-field" />
                    </td>
                    <td className="py-1.5 pr-2">
                      <NativeSelect value={g.circuit} disabled={!editable} aria-label={tg("columns.circuit")} onChange={(e) => setGroup(g.id, { circuit: e.target.value as HeatingGroup["circuit"] })}>
                        {circuitTypes.map((c) => (
                          <option key={c} value={c}>
                            {tg(`circuits.${c}`)}
                          </option>
                        ))}
                      </NativeSelect>
                    </td>
                    <td className="py-1.5 pr-2">
                      <NativeSelect value={g.emitter ?? ""} disabled={!editable} aria-label={tg("columns.emitter")} onChange={(e) => setGroup(g.id, { emitter: (e.target.value || null) as HeatingGroup["emitter"] })}>
                        <option value="">–</option>
                        {emitterTypes.map((x) => (
                          <option key={x} value={x}>
                            {o("emitters")(x)}
                          </option>
                        ))}
                      </NativeSelect>
                    </td>
                    <td className="py-1.5 pr-2">
                      <NumberField value={g.power} decimals={1} label={tg("columns.power")} disabled={!editable} onChange={(v) => setGroup(g.id, { power: v })} className="h-8 rounded-lg" />
                    </td>
                    <td className="py-1.5 pr-2">
                      <NumberField value={g.supplyTemp} decimals={0} label={tg("columns.supply")} disabled={!editable} onChange={(v) => setGroup(g.id, { supplyTemp: v })} className="h-8 rounded-lg" />
                    </td>
                    <td className="py-1.5 pr-2">
                      <NumberField value={g.returnTemp} decimals={0} label={tg("columns.return")} disabled={!editable} onChange={(v) => setGroup(g.id, { returnTemp: v })} className="h-8 rounded-lg" />
                    </td>
                    <td className="py-1.5 pr-2 text-center">
                      <input type="checkbox" checked={g.heatMeter} disabled={!editable} aria-label={tg("columns.heatMeter")} onChange={(e) => setGroup(g.id, { heatMeter: e.target.checked })} />
                    </td>
                    <td className="py-1.5 pr-2 text-center">
                      <input type="checkbox" checked={g.safetyThermostat} disabled={!editable} aria-label={tg("columns.safetyThermostat")} onChange={(e) => setGroup(g.id, { safetyThermostat: e.target.checked })} />
                    </td>
                    <td className="py-1.5 text-right">
                      {editable && (
                        <Button size="icon" variant="ghost" aria-label={tg("removeGroup")} onClick={() => anlage.update((x) => ({ ...x, groups: x.groups.filter((y) => y.id !== g.id) }))}>
                          <Trash2 />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {mismatched.length > 0 && (
          <Notice>
            {tg(`mismatch.${d.distributor}`, { groups: mismatched.map((g) => g.name || `${tg("schema.group")} ${d.groups.indexOf(g) + 1}`).join(", ") })}
          </Notice>
        )}
      </Section>

      <Section
        title={tg("schemaTitle")}
        collapseKey="heating-generation:schema"
        description={tg("schemaHint")}
        actions={
          <SchemaPrintButton
            systemId={plant.id}
            projectId={projectId}
            plan={plant.schemaPlan}
            editable={editable}
            dirty={anlage.status !== "saved"}
            url={`/api/pdf/heating-schema/${plant.id}`}
            save={saveHeatingSchemaPlan}
          />
        }
      >
        <GenerationSchemaView schema={schema} label={tg("schemaTitle")} />
      </Section>

      <SafetySection data={d} result={safety} editable={editable} setSafety={(patch) => setPlant({ safety: { ...d.safety, ...patch } })} />

      {ews && <EwsSection data={d} ctx={ewsCtx} result={ews} editable={editable} setEws={(patch) => setPlant({ ews: { ...d.ews, ...patch } })} />}

      <MaterialSection
        number={ews ? 7 : 6}
        data={d}
        ews={ews}
        plantId={plant.id}
        plantName={plant.name}
        projectId={projectId}
        lvs={lvs}
        dirty={anlage.status !== "saved"}
        editable={editable}
        setPlant={setPlant}
        setUnit={setUnit}
      />

      <Section title={t("system.notes")} collapseKey="heating-generation:notes">
        <Textarea id="plant-notes" aria-label={t("system.notes")} value={d.notes} maxLength={4000} disabled={!editable} onChange={(e) => setPlant({ notes: e.target.value })} className="min-h-24 bg-field" />
      </Section>
    </div>
  );
}

/**
 * Pumps built into a generator (Quellenpumpe of a Sole/Wasser- or Wasser/Wasser-WP, Heizungspumpe, WW-Ladepumpe of the
 * separate Warmwasser connection) as toggle buttons below its row: pressed, the pump is neither drawn in the schema
 * nor listed in the Materialauszug.
 */
function InternalPumps({
  unit,
  wwUnit,
  forced,
  editable,
  onChange,
}: {
  unit: GeneratorUnit;
  /** Generator with the separate connection «VL/RL ab Wärmeerzeuger» (its WW-Ladepumpe), else null. */
  wwUnit: GeneratorUnit | null;
  /** «Umschaltung intern» at this generator: its Heizungs- and WW-Ladepumpe are in it anyway (no buttons). */
  forced: boolean;
  editable: boolean;
  onChange: (value: GeneratorUnit["internalPumps"]) => void;
}) {
  const tg = useTranslations("heatingPlan.generation.internalPumps");
  const keys = [
    ...(unit.type === "hpBrine" || unit.type === "hpWater" ? (["source"] as const) : []),
    ...(forced ? [] : (["heating"] as const)),
    ...(wwUnit?.id === unit.id ? (["hotWater"] as const) : []),
  ];
  if (!keys.length) return null;
  return (
    <tr>
      <td colSpan={4} className="pb-2">
        <div className="flex flex-wrap gap-1.5">
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              disabled={!editable}
              aria-pressed={unit.internalPumps[k]}
              title={tg("hint")}
              onClick={() => onChange({ ...unit.internalPumps, [k]: !unit.internalPumps[k] })}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-60",
                "aria-pressed:border-brand aria-pressed:bg-brand/10 aria-pressed:text-foreground",
              )}
            >
              {tg(k)}
            </button>
          ))}
        </div>
      </td>
    </tr>
  );
}
