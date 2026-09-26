"use client";

import { useTranslations } from "next-intl";

import { NativeSelect } from "@/components/form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  extractFilterMinimum,
  extractFilterRecommended,
  formerFilterClasses,
  idaClasses,
  odaClasses,
  settlementOptions,
  supplyFilterMatrix,
  trafficOptions,
} from "@/lib/kwl/calc";
import { effectiveOda } from "@/lib/kwl/evaluate";
import type { KwlFilterInput } from "@/lib/kwl/schema";
import { cn } from "@/lib/utils";

import { Result, Section } from "@/components/planning/fields";

const odaKeys = ["class1", "class2", "class3"] as const;
const idaKeys = ["class1", "class2", "class3", "class4"] as const;
const idaExamples = ["example1", "example2", "example3", "example4"] as const;

export function FilterTab({ filter, editable, onChange }: { filter: KwlFilterInput; editable: boolean; onChange: (filter: KwlFilterInput) => void }) {
  const t = useTranslations("kwl.filter");
  const oda = effectiveOda(filter);
  const supplyFilter = oda ? supplyFilterMatrix[oda][filter.ida] : null;

  const choice = (name: "traffic" | "settlement", options: { key: string; points: number; label: string; hint: string }[]) => (
    <fieldset className="space-y-1.5">
      <legend className="mb-1 text-sm font-medium">{t(`${name}.title`)}</legend>
      {options.map((o) => (
        <label key={o.key} className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name={name}
            className="mt-1"
            checked={filter[name] === o.key}
            disabled={!editable}
            onChange={() => onChange({ ...filter, [name]: o.key })}
          />
          <span>
            <span className="font-medium">{o.label}</span>
            <span className="text-muted-foreground"> – {o.hint}</span>
            <span className="ml-1 text-xs text-muted-foreground">({o.points})</span>
          </span>
        </label>
      ))}
    </fieldset>
  );

  return (
    <div className="space-y-4">
      <Section title={t("oda.title")} description={t("oda.description")}>
        <div className="grid gap-6 md:grid-cols-2">
          {choice(
            "traffic",
            trafficOptions.map((o) => ({ ...o, label: t(`traffic.${o.key}`), hint: t(`traffic.${o.key}Hint`) })),
          )}
          {choice(
            "settlement",
            settlementOptions.map((o) => ({ ...o, label: t(`settlement.${o.key}`), hint: t(`settlement.${o.key}Hint`) })),
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
          <div className="space-y-2">
            <Label htmlFor="kwl-oda-override">{t("oda.override")}</Label>
            <NativeSelect
              id="kwl-oda-override"
              value={filter.odaOverride ?? ""}
              disabled={!editable}
              onChange={(e) => onChange({ ...filter, odaOverride: (e.target.value || null) as KwlFilterInput["odaOverride"] })}
            >
              <option value="">{t("oda.fromCriteria")}</option>
              {odaClasses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="kwl-oda-reason">{t("oda.reason")}</Label>
            <Textarea
              id="kwl-oda-reason"
              rows={2}
              maxLength={500}
              defaultValue={filter.overrideReason}
              disabled={!editable}
              onBlur={(e) => e.target.value !== filter.overrideReason && onChange({ ...filter, overrideReason: e.target.value })}
            />
          </div>
        </div>
        <ul className="grid gap-1 text-sm text-muted-foreground">
          {odaClasses.map((c, i) => (
            <li key={c} className={cn(c === oda && "font-medium text-foreground")}>
              {c}: {t(`oda.${odaKeys[i]}`)}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("ida.title")} description={t("ida.description")}>
        <div className="grid gap-2">
          {idaClasses.map((c, i) => (
            <label key={c} className="flex items-start gap-2 text-sm">
              <input type="radio" name="ida" className="mt-1" checked={filter.ida === c} disabled={!editable} onChange={() => onChange({ ...filter, ida: c })} />
              <span>
                <span className="font-medium">{c}</span> – {t(`ida.${idaKeys[i]}`)}
                <span className="block text-xs text-muted-foreground">{t(`ida.${idaExamples[i]}`)}</span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Result label={t("result.oda")} value={oda ?? ""} hint={filter.odaOverride ? t("result.manual") : undefined} />
        <Result label={t("result.supply")} value={supplyFilter ?? ""} hint={t("result.supplyHint", { ida: filter.ida })} />
        <Result label={t("result.extract")} value={extractFilterRecommended} hint={t("result.extractHint", { minimum: extractFilterMinimum })} />
      </div>

      <Section title={t("matrix.title")} description={t("matrix.description")}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 text-left font-medium">{t("matrix.corner")}</th>
                {idaClasses.map((c) => (
                  <th key={c} className="px-2 text-left font-medium">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {odaClasses.map((o) => (
                <tr key={o} className="border-b last:border-0">
                  <th className="py-2 text-left font-medium">{o}</th>
                  {idaClasses.map((i) => (
                    <td key={i} className={cn("px-2 py-2", o === oda && i === filter.ida && "rounded bg-brand/10 font-medium")}>
                      {supplyFilterMatrix[o][i]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">{t("matrix.former")}</summary>
          <table className="mt-2 text-sm">
            <tbody>
              {formerFilterClasses.map(([old, iso]) => (
                <tr key={old}>
                  <td className="pr-4 font-medium">{old}</td>
                  <td>{iso}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Section>
    </div>
  );
}
