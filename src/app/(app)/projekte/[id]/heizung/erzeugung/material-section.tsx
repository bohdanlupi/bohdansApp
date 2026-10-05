"use client";

import { FileInput } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import type { FormMessageKey } from "@/components/form";
import { NativeSelect } from "@/components/form";
import { fmt, NumberField, Section } from "@/components/planning/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EwsResult } from "@/lib/heating/ews";
import { type Circuit, defaultDeltaT, evaluateHydraulics, maxVelocity, pipeSizes } from "@/lib/heating/hydraulics";
import { type MaterialGroup, materialGroups, plantMaterial } from "@/lib/heating/material";
import { type GeneratorUnit, generatorName, type PlantData } from "@/lib/heating/plant-schema";

import type { LvWithChapters } from "../../lueftung/anlagen/[systemId]/quantities-panel";
import { insertHeatingMaterial } from "../actions";

/**
 * Materialauszug of the Anlage: Volumenstrom and DN per circuit (ΔT of the generators and each DN can be changed),
 * the list of all components of the Prinzipschema and its insertion into an LV, one chapter per group.
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
  const tForms = useTranslations("forms");
  const circuits = useMemo(() => evaluateHydraulics(data, ews), [data, ews]);
  const lines = useMemo(() => plantMaterial(data, ews).filter((l) => l.quantity > 0), [data, ews]);
  const unitName = (u: GeneratorUnit) => generatorName(data.generators, u, (g) => tg(`short.${g}` as never));

  const circuitName = (c: Circuit) => {
    const unit = data.generators.find((u) => u.id === c.id);
    const group = data.groups.find((g) => g.id === c.id);
    if (c.kind === "generator" && unit) return unitName(unit);
    if (c.kind === "source" && unit) return `${unitName(unit)} · ${t(`sourceCircuit.${unit.type === "hpBrine" ? "hpBrine" : "hpWater"}`)}`;
    if (c.kind === "group" && group) return group.name || `${tg("schema.group")} ${data.groups.indexOf(group) + 1}`;
    return t(`circuits.${c.kind}`);
  };
  const setDn = (key: string, dn: number | null) => {
    const next = { ...data.dn };
    if (dn === null) delete next[key];
    else next[key] = dn;
    setPlant({ dn: next });
  };

  // LV insertion: chosen chapter per LV and group ("" = new group).
  const [lvId, setLvId] = useState(lvs[0]?.id ?? "");
  const lv = lvs.find((l) => l.id === lvId);
  const [chosen, setChosen] = useState<Record<string, Partial<Record<MaterialGroup, string>>>>({});
  const targetOf = (g: MaterialGroup) => chosen[lvId]?.[g] ?? "";
  const [title, setTitle] = useState(t("lvGroup", { name: plantName }));
  const [pending, startTransition] = useTransition();
  const present = materialGroups.filter((g) => lines.some((l) => l.group === g));
  const needsGroup = present.some((g) => !targetOf(g));
  const options = useMemo(() => {
    if (!lv) return [];
    const out: { id: string; label: string }[] = [];
    const walk = (parentId: string | null, depth: number) =>
      lv.groups
        .filter((g) => g.parentId === parentId)
        .forEach((g) => {
          out.push({ id: g.id, label: `${"  ".repeat(depth)}${g.number ?? ""} ${g.text}`.trimEnd() });
          walk(g.id, depth + 1);
        });
    walk(null, 0);
    return out;
  }, [lv]);
  const insert = () =>
    startTransition(async () => {
      const targets = Object.fromEntries(present.map((g) => [g, targetOf(g) || null]));
      const res = await insertHeatingMaterial(plantId, projectId, lvId, title, targets);
      if (res.error) toast.error(tForms(res.error as FormMessageKey));
      else toast.success(t("inserted", { count: res.count ?? 0 }));
    });

  return (
    <Section title={`${number} · ${t("title")}`} description={t("hint")} collapseKey="heating-generation:material">
      {/* Volumenströme und Nennweiten */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">{t("hydraulics")}</h3>
        {circuits.length === 0 ? (
          <p className="text-sm text-muted-foreground">–</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2 font-medium">{t("columns.circuit")}</th>
                  <th className="w-24 py-1 pr-2 text-right font-medium">{t("columns.power")}</th>
                  <th className="w-24 py-1 pr-2 text-right font-medium">{t("columns.deltaT")}</th>
                  <th className="w-24 py-1 pr-2 text-right font-medium">{t("columns.flow")}</th>
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

      {/* Materialauszug */}
      <div className="space-y-2 border-t pt-3">
        <h3 className="text-sm font-medium">{t("list")}</h3>
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">–</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-1 font-normal">{t("article")}</th>
                  <th className="py-1 font-normal">{t("text")}</th>
                  <th className="py-1 text-right font-normal">{t("quantity")}</th>
                </tr>
              </thead>
              <tbody>
                {present.map((g) => [
                  <tr key={g}>
                    <td colSpan={3} className="pt-3 pb-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold">{t(`groups.${g}`)}</span>
                        {editable && lv && (
                          <NativeSelect
                            value={targetOf(g)}
                            onChange={(e) => setChosen((c) => ({ ...c, [lvId]: { ...c[lvId], [g]: e.target.value } }))}
                            className="h-7 w-72 text-xs"
                            aria-label={`${t("chapter")} ${t(`groups.${g}`)}`}
                          >
                            <option value="">{t("newGroupOption")}</option>
                            {options.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.label}
                              </option>
                            ))}
                          </NativeSelect>
                        )}
                      </div>
                    </td>
                  </tr>,
                  ...lines
                    .filter((l) => l.group === g)
                    .map((l) => (
                      <tr key={l.key} className="border-b last:border-0">
                        <td className="py-1 pr-3 text-xs whitespace-nowrap text-muted-foreground tabular-nums">{l.article ? `${l.manufacturer} ${l.article}` : t("neutral")}</td>
                        <td className="py-1 pr-3">{l.label}</td>
                        <td className="py-1 text-right whitespace-nowrap tabular-nums">
                          {fmt(l.quantity, 0)} {l.unit}
                        </td>
                      </tr>
                    )),
                ])}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{t("listHint")}</p>
      </div>

      {editable &&
        lines.length > 0 &&
        (lvs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("noLv")}{" "}
            <Link href={`/projekte/${projectId}/lv`} className="underline">
              {t("toLvs")}
            </Link>
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-2 border-t pt-3">
            <div className="space-y-1">
              <label htmlFor="hm-lv" className="text-xs text-muted-foreground">
                {t("targetLv")}
              </label>
              <NativeSelect id="hm-lv" value={lvId} onChange={(e) => setLvId(e.target.value)} className="w-72">
                {lvs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.number} {l.title}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {needsGroup && (
              <div className="space-y-1">
                <label htmlFor="hm-title" className="text-xs text-muted-foreground">
                  {t("groupTitle")}
                </label>
                <Input id="hm-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="w-72" />
              </div>
            )}
            <Button onClick={insert} disabled={pending || dirty || !lvId || (needsGroup && !title.trim())} title={dirty ? t("saveFirst") : undefined}>
              <FileInput />
              {t("insertIntoLv")}
            </Button>
            {dirty && <span className="text-xs text-muted-foreground">{t("saveFirst")}</span>}
          </div>
        ))}
    </Section>
  );
}
