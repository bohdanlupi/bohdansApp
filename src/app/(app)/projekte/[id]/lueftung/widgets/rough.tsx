"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { DwellingType } from "@/lib/kwl/plan-schema";
import { roughDwellingFlow } from "@/lib/kwl/sia3825";

import { fmt, NumberField, Result, Section } from "@/components/planning/fields";
import type { WidgetProps } from "./types";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

type CountKey = "count" | "rooms" | "baths" | "wcs" | "shortUse";

/** Vorprojekt: rough design flows per dwelling type (Tables 2 + 3, step 3) and total device size. */
export function RoughWidget({ plan, update, editable }: WidgetProps) {
  const t = useTranslations("kwlPlan.rough");
  const types = plan.dwellingTypes;
  const set = (list: DwellingType[]) => update((d) => ({ ...d, dwellingTypes: list }));
  const change = (index: number, patch: Partial<DwellingType>) => set(types.map((x, i) => (i === index ? { ...x, ...patch } : x)));
  const rows = types.map((x) => ({
    type: x,
    ...roughDwellingFlow({ rooms: x.rooms ?? 0, baths: x.baths ?? 0, wcs: x.wcs ?? 0, shortUse: x.shortUse ?? 0, closedKitchen: x.closedKitchen }),
  }));
  const total = rows.reduce((s, r) => s + r.governing * (r.type.count ?? 0), 0);
  const dwellings = rows.reduce((s, r) => s + (r.type.count ?? 0), 0);
  const simultaneity = plan.params.unit === "multi" ? (plan.params.simultaneity ?? 1) : 1;
  const largest = Math.max(0, ...rows.map((r) => r.governing));

  const num = (index: number, key: CountKey, label: string) => (
    <td className="px-1 py-1">
      <NumberField value={types[index][key]} decimals={0} label={label} disabled={!editable} onChange={(v) => change(index, { [key]: v })} className="w-16" />
    </td>
  );

  return (
    <Section title={t("title")} description={t("description")}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-1.5 text-left font-medium">{t("name")}</th>
              <th className="px-1 text-right font-medium">{t("count")}</th>
              <th className="px-1 text-right font-medium">{t("rooms")}</th>
              <th className="px-1 text-right font-medium">{t("baths")}</th>
              <th className="px-1 text-right font-medium">{t("wcs")}</th>
              <th className="px-1 text-right font-medium">{t("shortUse")}</th>
              <th className="px-1 text-center font-medium">{t("closedKitchen")}</th>
              <th className="px-2 text-right font-medium">{t("supply")}</th>
              <th className="px-2 text-right font-medium">{t("extract")}</th>
              <th className="px-2 text-right font-medium">{t("governing")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="py-6 text-center text-muted-foreground">
                  {t("empty")}
                </td>
              </tr>
            )}
            {rows.map((row, index) => (
              <tr key={row.type.id} className="border-b last:border-0">
                <td className="py-1 pr-1">
                  <input
                    aria-label={t("name")}
                    defaultValue={row.type.name}
                    maxLength={120}
                    disabled={!editable}
                    onBlur={(e) => e.target.value !== row.type.name && change(index, { name: e.target.value })}
                    className="h-7 w-full rounded border border-input bg-transparent px-1.5 outline-none focus:border-ring"
                  />
                </td>
                {num(index, "count", t("count"))}
                {num(index, "rooms", t("rooms"))}
                {num(index, "baths", t("baths"))}
                {num(index, "wcs", t("wcs"))}
                {num(index, "shortUse", t("shortUse"))}
                <td className="px-1 text-center">
                  <input
                    type="checkbox"
                    aria-label={t("closedKitchen")}
                    checked={row.type.closedKitchen}
                    disabled={!editable}
                    onChange={(e) => change(index, { closedKitchen: e.target.checked })}
                  />
                </td>
                <td className="px-2 text-right tabular-nums">{fmt(row.supply)}</td>
                <td className="px-2 text-right tabular-nums">{fmt(row.extract)}</td>
                <td className="px-2 text-right font-medium tabular-nums">{fmt(row.governing)}</td>
                <td className="text-right">
                  {editable && (
                    <Button variant="ghost" size="icon-sm" aria-label={t("remove")} onClick={() => set(types.filter((_, i) => i !== index))}>
                      <Trash2 />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            set([...types, { id: newId(), name: t("defaultName", { n: types.length + 1 }), count: 1, rooms: 3, baths: 1, wcs: 1, shortUse: 1, closedKitchen: false }])
          }
        >
          <Plus />
          {t("add")}
        </Button>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Result label={t("dwellings")} value={fmt(dwellings)} />
        <Result label={t("total")} value={fmt(total)} unit="m³/h" hint={t("totalHint")} />
        {plan.params.unit === "multi" ? (
          <Result label={t("device")} value={fmt(total * simultaneity)} unit="m³/h" hint={t("deviceHint", { factor: fmt(simultaneity, 2) })} />
        ) : (
          <Result label={t("largest")} value={fmt(largest)} unit="m³/h" hint={t("largestHint")} />
        )}
      </div>
    </Section>
  );
}
