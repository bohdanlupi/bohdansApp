"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { NativeSelect } from "@/components/form";
import { fmt, NumberField, Section } from "@/components/planning/fields";
import type { EwsResult } from "@/lib/heating/ews";
import { type Circuit, defaultDeltaT, evaluateHydraulics, maxVelocity, pipeSizes } from "@/lib/heating/hydraulics";
import { materialSections, plantMaterial } from "@/lib/heating/material";
import { type GeneratorUnit, generatorName, type PlantData } from "@/lib/heating/plant-schema";

import type { LvWithChapters } from "../../lueftung/anlagen/[systemId]/quantities-panel";
import { insertHeatingMaterial } from "../actions";
import { ChapterMaterial } from "../chapter-material";

/**
 * Materialauszug of the Anlage: Volumenstrom and DN per circuit (ΔT of the generators and each DN can be changed),
 * the list of all components of the Prinzipschema by LV chapter (Sole-/Zwischenkreis, Erdwärmesonden and Brunnen in
 * 241, the rest in 242; .0 Apparate … .4 Warmwasserspeicher) and its insertion into an LV, each chapter into the
 * matching chapter of the structure «Heizung» of the chosen LV (changeable) or a new group.
 */
export function MaterialSection({
  number,
  data,
  ews,
  plantId,
  plantName,
  projectId,
  lvs,
  dirty,
  editable,
  setPlant,
  setUnit,
}: {
  number: number;
  data: PlantData;
  ews: EwsResult | null;
  plantId: string;
  plantName: string;
  projectId: string;
  lvs: LvWithChapters[];
  dirty: boolean;
  editable: boolean;
  setPlant: (patch: Partial<PlantData>) => void;
  setUnit: (id: string, patch: Partial<GeneratorUnit>) => void;
}) {
  const t = useTranslations("heatingPlan.generation.material");
  const tg = useTranslations("heatingPlan.generation");
  const circuits = useMemo(() => evaluateHydraulics(data, ews), [data, ews]);
  const lines = useMemo(() => plantMaterial(data, ews).filter((l) => l.quantity > 0), [data, ews]);
  const sections = useMemo(() => materialSections(lines), [lines]);
  const unitName = (u: GeneratorUnit) => generatorName(data.generators, u, (g) => tg(`short.${g}` as never));

  const circuitName = (c: Circuit) => {
    const unit = data.generators.find((u) => u.id === c.id);
    const group = data.groups.find((g) => g.id === c.id);
    if (c.kind === "generator" && unit) return unitName(unit);
    if (c.kind === "source" && unit) return `${unitName(unit)} · ${t(`sourceCircuit.${unit.type === "hpBrine" ? "hpBrine" : "hpWater"}`)}`;
    if (c.kind === "group" && group) return group.name || `${tg("schema.group")} ${data.groups.indexOf(group) + 1}`;
    return t(`circuits.${c.kind}`);
  };
  const setLength = (key: string, length: number | null) => {
    const next = { ...data.lengths };
    if (length === null || length <= 0) delete next[key];
    else next[key] = length;
    setPlant({ lengths: next });
  };
  const setDn = (key: string, dn: number | null) => {
    const next = { ...data.dn };
    if (dn === null) delete next[key];
    else next[key] = dn;
    setPlant({ dn: next });
  };

  return (
    <Section title={`${number} · ${t("title")}`} description={t("hint")} collapseKey="heating-generation:material">
      {/* Volumenströme und Nennweiten */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">{t("hydraulics")}</h3>
        {circuits.length === 0 ? (
          <p className="text-sm text-muted-foreground">–</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2 font-medium">{t("columns.circuit")}</th>
                  <th className="w-24 py-1 pr-2 text-right font-medium">{t("columns.power")}</th>
                  <th className="w-24 py-1 pr-2 text-right font-medium">{t("columns.deltaT")}</th>
                  <th className="w-24 py-1 pr-2 text-right font-medium">{t("columns.flow")}</th>
                  <th className="w-24 py-1 pr-2 text-right font-medium">{t("columns.length")}</th>
                  <th className="w-24 py-1 pr-2 text-right font-medium">{t("columns.volume")}</th>
                  <th className="w-28 py-1 pr-2 text-right font-medium">{t("columns.calculated")}</th>
                  <th className="w-36 py-1 font-medium">{t("columns.dn")}</th>
                </tr>
              </thead>
              <tbody>
                {circuits.map((c) => {
                  const unit = c.kind === "generator" ? data.generators.find((u) => u.id === c.id) : undefined;
                  return (
                    <tr key={c.key} className="border-t">
                      <td className="py-1.5 pr-2">{circuitName(c)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{c.power !== null ? `${fmt(c.power, 1)} kW` : "–"}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {unit ? (
                          <NumberField
                            value={unit.deltaT}
                            decimals={1}
                            label={t("columns.deltaT")}
                            placeholder={fmt(defaultDeltaT(unit.type), 0)}
                            disabled={!editable}
                            onChange={(v) => setUnit(unit.id, { deltaT: v })}
                            className="h-8 rounded-lg"
                          />
                        ) : c.deltaT !== null ? (
                          `${fmt(c.deltaT, 1)} K`
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{c.flow !== null ? `${fmt(c.flow, 2)} m³/h` : "–"}</td>
                      <td className="py-1.5 pr-2">
                        <NumberField value={c.length} decimals={1} label={`${t("columns.length")} ${circuitName(c)}`} disabled={!editable} onChange={(v) => setLength(c.key, v)} className="h-8 rounded-lg" />
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{c.volume !== null ? `${fmt(c.volume, 1)} dm³` : "–"}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{c.calculated ? `DN ${c.calculated.dn}` : "–"}</td>
                      <td className="py-1.5">
                        <NativeSelect
                          value={c.overridden && c.size ? String(c.size.dn) : ""}
                          disabled={!editable}
                          aria-label={`${t("columns.dn")} ${circuitName(c)}`}
                          onChange={(e) => setDn(c.key, e.target.value ? Number(e.target.value) : null)}
                          className="h-8"
                        >
                          <option value="">{c.calculated ? t("auto", { dn: c.calculated.dn }) : t("autoNone")}</option>
                          {pipeSizes.map((s) => (
                            <option key={s.dn} value={s.dn}>
                              DN {s.dn} ({s.d} mm)
                            </option>
                          ))}
                        </NativeSelect>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {t("hydraulicsHint", { v1: fmt(maxVelocity(20), 1), v2: fmt(maxVelocity(32), 1), v3: fmt(maxVelocity(50), 1), v4: fmt(maxVelocity(65), 1) })}
        </p>
      </div>

      {/* Materialauszug by LV chapter and its insertion into an LV */}
      <div className="space-y-3 border-t pt-3">
        <ChapterMaterial
          sections={sections}
          lvs={lvs}
          plantName={plantName}
          projectId={projectId}
          defaultTitle={t("lvGroup", { name: plantName })}
          hint={t("listHint")}
          dirty={dirty}
          editable={editable}
          insert={(lvId, title, targets) => insertHeatingMaterial(plantId, projectId, lvId, title, targets)}
        />
      </div>
    </Section>
  );
}
