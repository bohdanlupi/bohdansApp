"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import type { FormMessageKey } from "@/components/form";
import type { CostRow } from "@/lib/cost-plan";
import { formatMoney, formatNumber, parseNumber } from "@/lib/number-input";
import { round2 } from "@/lib/tree";
import { cn } from "@/lib/utils";

import { saveProjectCost } from "./actions";

const deviation = (budget: number, kv: number) => (budget ? `${formatNumber(((kv - budget) / budget) * 100, 1)} %` : "");

export function CostPlanTable({
  projectId,
  rows,
  showAll,
  vatRate,
  editable,
}: {
  projectId: string;
  rows: CostRow[];
  showAll: boolean;
  vatRate: number;
  editable: boolean;
}) {
  const t = useTranslations("costPlan");
  const grand = rows.find((r) => r.depth === -1)!.total;
  const visible = rows.filter((r) => r.depth >= 0 && (showAll || r.used));
  const vat = (value: number) => round2((value * vatRate) / 100);

  const money = (value: number, bold = false) => (
    <td className={cn("px-2 py-1.5 text-right tabular-nums", bold && "font-semibold")}>{value ? formatMoney(value) : ""}</td>
  );

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="w-20 py-2 pl-4 text-left font-medium">{t("columns.code")}</th>
            <th className="px-2 text-left font-medium">{t("columns.name")}</th>
            <th className="w-36 px-2 text-right font-medium">{t("columns.budget")}</th>
            <th className="w-32 px-2 text-right font-medium">{t("columns.lv")}</th>
            <th className="w-36 px-2 text-right font-medium">{t("columns.manual")}</th>
            <th className="w-32 px-2 text-right font-medium">{t("columns.kv")}</th>
            <th className="w-32 px-2 text-right font-medium">{t("columns.difference")}</th>
            <th className="w-20 pr-4 pl-2 text-right font-medium">{t("columns.percent")}</th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && (
            <tr>
              <td colSpan={8} className="px-6 py-10 text-center text-muted-foreground">
                {t("empty")}
              </td>
            </tr>
          )}
          {visible.map((row) => {
            const parent = row.hasChildren;
            const diff = round2(row.total.kv - row.total.budget);
            return (
              <tr key={row.item.id} className={cn("border-b last:border-0", parent && row.depth === 0 && "bg-muted/30", parent && "font-semibold")}>
                <td className="py-1.5 pl-4 font-mono text-xs tabular-nums" style={{ paddingLeft: `${1 + row.depth * 0.75}rem` }}>
                  {row.item.code}
                </td>
                <td className="px-2 py-1.5">{row.name}</td>
                {parent ? (
                  money(row.total.budget, true)
                ) : (
                  <AmountCell
                    key={`b-${row.item.id}-${row.own.budget}`}
                    value={row.own.budget}
                    editable={editable}
                    label={`${row.item.code} ${t("columns.budget")}`}
                    onSave={(budget) => saveProjectCost(projectId, row.item.id, { budget, manual_amount: row.own.manual })}
                  />
                )}
                {money(row.total.lv, parent)}
                {parent ? (
                  money(row.total.manual, true)
                ) : (
                  <AmountCell
                    key={`m-${row.item.id}-${row.own.manual}`}
                    value={row.own.manual}
                    editable={editable}
                    label={`${row.item.code} ${t("columns.manual")}`}
                    onSave={(manual_amount) => saveProjectCost(projectId, row.item.id, { budget: row.own.budget, manual_amount })}
                  />
                )}
                {money(row.total.kv, true)}
                <td className={cn("px-2 py-1.5 text-right tabular-nums", diff > 0 && "text-destructive", diff < 0 && "text-emerald-700 dark:text-emerald-400")}>
                  {row.total.budget || row.total.kv ? formatMoney(diff) : ""}
                </td>
                <td className="pr-4 pl-2 text-right text-xs text-muted-foreground tabular-nums">{deviation(row.total.budget, row.total.kv)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 text-sm">
          {[
            { label: t("totalExclVat"), budget: grand.budget, kv: grand.kv, lv: grand.lv, manual: grand.manual },
            { label: t("vat", { rate: formatNumber(vatRate, 2, false) }), budget: vat(grand.budget), kv: vat(grand.kv), lv: null, manual: null },
            {
              label: t("totalInclVat"),
              budget: round2(grand.budget + vat(grand.budget)),
              kv: round2(grand.kv + vat(grand.kv)),
              lv: null,
              manual: null,
            },
          ].map((line, i) => (
            <tr key={line.label} className={cn(i === 2 && "bg-brand text-white", i !== 1 && "font-semibold")}>
              <td colSpan={2} className="py-2 pl-4">
                {line.label}
              </td>
              <td className="px-2 text-right tabular-nums">{formatMoney(line.budget)}</td>
              <td className="px-2 text-right tabular-nums">{line.lv !== null && formatMoney(line.lv)}</td>
              <td className="px-2 text-right tabular-nums">{line.manual !== null && formatMoney(line.manual)}</td>
              <td className="px-2 text-right tabular-nums">{formatMoney(line.kv)}</td>
              <td className="px-2 text-right tabular-nums">{formatMoney(round2(line.kv - line.budget))}</td>
              <td className="pr-4 pl-2 text-right text-xs tabular-nums">{deviation(line.budget, line.kv)}</td>
            </tr>
          ))}
        </tfoot>
      </table>
    </div>
  );
}

function AmountCell({
  value,
  editable,
  label,
  onSave,
}: {
  value: number | null;
  editable: boolean;
  label: string;
  onSave: (value: number | null) => Promise<{ error?: string }>;
}) {
  const tForms = useTranslations("forms");
  const [text, setText] = useState(formatNumber(value, 2));

  if (!editable) return <td className="px-2 py-1.5 text-right tabular-nums">{value ? formatMoney(value) : ""}</td>;

  return (
    <td className="px-1 py-0.5">
      <input
        aria-label={label}
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={async () => {
          const parsed = parseNumber(text);
          setText(formatNumber(parsed, 2));
          if (parsed === value) return;
          const result = await onSave(parsed);
          if (result.error) toast.error(tForms(result.error as FormMessageKey));
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="h-7 w-full rounded border border-transparent bg-transparent px-1.5 text-right tabular-nums outline-none hover:border-input focus:border-ring"
      />
    </td>
  );
}
