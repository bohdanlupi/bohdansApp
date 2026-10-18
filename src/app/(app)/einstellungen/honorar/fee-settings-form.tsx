"use client";

import { Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { fmt, Notice, NumberField, Section } from "@/components/planning/fields";
import { NumberParam, OptionField, SaveIndicator } from "@/components/planning/plan-ui";
import { usePlan } from "@/components/planning/use-plan";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { localeToLanguage, type Locale } from "@/i18n/config";
import { phaseLabel } from "@/lib/fees/options";
import { type FeeSettings, MAX_RATES } from "@/lib/fees/settings-schema";
import { feePhases, siaColumns } from "@/lib/fees/sia108";
import { cn } from "@/lib/utils";

import { saveFeeSettings } from "../../honorarofferten/actions";
import { CommitInput } from "@/components/planning/commit-input";

/** Firm-wide SIA 108 defaults; new fee offers copy them. */
export function FeeSettingsForm({ initial, editable }: { initial: FeeSettings; editable: boolean }) {
  const t = useTranslations("feeSettings");
  const tc = useTranslations("feeOffers.fee.columns");
  const language = localeToLanguage(useLocale() as Locale);
  const { plan, update, status } = usePlan("fee-settings", initial, editable, saveFeeSettings);

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        <SaveIndicator status={status} />
      </div>
      {!editable && <Notice tone="info">{t("readOnly")}</Notice>}

      <Section title={t("z.title")} description={t("z.description")}>
        <table className="text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="pr-4 text-left font-medium">{t("z.column")}</th>
              <th className="w-32 px-2 text-right font-medium">Z1</th>
              <th className="w-32 px-2 text-right font-medium">Z2</th>
            </tr>
          </thead>
          <tbody>
            {siaColumns.map((c) => (
              <tr key={c}>
                <td className="py-1 pr-4">{tc(c)}</td>
                {(["z1", "z2"] as const).map((k) => (
                  <td key={k} className="px-2 py-1">
                    <NumberField
                      label={`${k.toUpperCase()} ${tc(c)}`}
                      value={plan.z[c][k]}
                      decimals={4}
                      disabled={!editable}
                      onChange={(v) => update((s) => ({ ...s, z: { ...s.z, [c]: { ...s.z[c], [k]: v } } }))}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={t("shares.title")} description={t("shares.description")}>
        <table className="text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="pr-4 text-left font-medium">{t("shares.phase")}</th>
              {siaColumns.map((c) => (
                <th key={c} className="w-28 px-2 text-right font-medium">
                  {tc(c)} [%]
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {feePhases.map((p) => (
              <tr key={p}>
                <td className="py-1 pr-4">{phaseLabel(p, language)}</td>
                {siaColumns.map((c) => (
                  <td key={c} className="px-2 py-1">
                    <NumberField
                      label={`${p} ${tc(c)}`}
                      value={plan.shares[c][p]}
                      disabled={!editable}
                      onChange={(v) => update((s) => ({ ...s, shares: { ...s.shares, [c]: { ...s.shares[c], [p]: Math.min(100, v ?? 0) } } }))}
                    />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t font-medium">
              <td className="py-1 pr-4">{t("shares.sum")}</td>
              {siaColumns.map((c) => {
                const sum = feePhases.reduce((a, p) => a + plan.shares[c][p], 0);
                return (
                  <td key={c} className={cn("px-2 py-1 text-right tabular-nums", Math.abs(sum - 100) > 0.01 && "text-destructive")}>
                    {fmt(sum, 1)} %
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </Section>

      <Section title={t("rates.title")} description={t("rates.description")}>
        <div className="space-y-2">
          {plan.rates.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <CommitInput
                aria-label={t("rates.label")}
                value={r.label}
                required
                disabled={!editable}
                className="h-7 max-w-xs"
                onCommit={(label) => update((s) => ({ ...s, rates: s.rates.map((x) => (x.id === r.id ? { ...x, label } : x)) }))}
              />
              <NumberField
                label={t("rates.rate")}
                value={r.rate}
                decimals={2}
                disabled={!editable}
                className="w-28"
                onChange={(rate) => update((s) => ({ ...s, rates: s.rates.map((x) => (x.id === r.id ? { ...x, rate: rate ?? 0 } : x)) }))}
              />
              <span className="text-sm text-muted-foreground">CHF/h</span>
              {editable && plan.rates.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("rates.remove")}
                  onClick={() =>
                    update((s) => {
                      const rates = s.rates.filter((x) => x.id !== r.id);
                      return { ...s, rates, siaRateId: s.siaRateId === r.id ? rates[0].id : s.siaRateId };
                    })
                  }
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          ))}
          {editable && plan.rates.length < MAX_RATES && (
            <Button variant="ghost" size="sm" onClick={() => update((s) => ({ ...s, rates: [...s.rates, { id: crypto.randomUUID().slice(0, 8), label: t("rates.newLabel"), rate: 0 }] }))}>
              <Plus />
              {t("rates.add")}
            </Button>
          )}
        </div>
        <div className="max-w-sm">
          <OptionField
            label={t("rates.sia")}
            value={plan.siaRateId}
            options={plan.rates.map((r) => r.id)}
            optionLabel={(id) => plan.rates.find((r) => r.id === id)?.label ?? id}
            editable={editable}
            hint={t("rates.siaHint")}
            onChange={(siaRateId) => update((s) => ({ ...s, siaRateId }))}
          />
        </div>
      </Section>

      <Section title={t("expenses.title")}>
        <div className="max-w-xs">
          <NumberParam label={t("expenses.pct")} value={plan.expensesPct} decimals={1} editable={editable} onChange={(v) => update((s) => ({ ...s, expensesPct: Math.min(100, v ?? 0) }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fee-expenses-text">{t("expenses.text")}</Label>
          <CommitInput id="fee-expenses-text" multiline rows={3} value={plan.expensesText} disabled={!editable} onCommit={(expensesText) => update((s) => ({ ...s, expensesText }))} />
        </div>
      </Section>
    </div>
  );
}
