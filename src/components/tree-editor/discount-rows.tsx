"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNumber, parseNumber } from "@/lib/number-input";
import type { Discount } from "@/lib/tree";

/** A discount as edited (percent as typed). */
export type DiscountDraft = { name: string; pct: string };

export const MAX_DISCOUNTS = 4;

export const toDiscountDrafts = (discounts: readonly Discount[] | null | undefined): DiscountDraft[] =>
  (discounts ?? []).map((d) => ({ name: d.name, pct: formatNumber(d.pct, 2, false) }));

/** Discount rows with a percentage; rows without one are not saved. */
export const parseDiscounts = (rows: DiscountDraft[]): Discount[] =>
  rows.flatMap(({ name, pct }) => {
    const value = parseNumber(pct);
    return value === null ? [] : [{ name: name.trim(), pct: value }];
  });

/**
 * Up to 4 named discounts (positive %) or surcharges (negative %). `onChange(rows, true)` asks to save
 * right away (row removed); typing saves on blur via `onBlur`.
 */
export function DiscountRows({
  rows,
  editable,
  onChange,
  onBlur,
  children,
}: {
  rows: DiscountDraft[];
  editable: boolean;
  onChange: (rows: DiscountDraft[], saveNow?: boolean) => void;
  onBlur?: () => void;
  /** Hint below the rows. */
  children?: React.ReactNode;
}) {
  const t = useTranslations("tree.discounts");
  const setRow = (index: number, patch: Partial<DiscountDraft>) => onChange(rows.map((d, i) => (i === index ? { ...d, ...patch } : d)));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{t("title")}</Label>
        {editable && rows.length < MAX_DISCOUNTS && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...rows, { name: "", pct: "" }])}>
            <Plus />
            {t("add")}
          </Button>
        )}
      </div>
      {rows.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            aria-label={t("name")}
            placeholder={t("namePlaceholder", { n: i + 1 })}
            maxLength={60}
            value={d.name}
            onChange={(e) => setRow(i, { name: e.target.value })}
            onBlur={onBlur}
          />
          <Input
            aria-label={t("pct")}
            inputMode="decimal"
            placeholder="0"
            className="w-24 shrink-0 text-right tabular-nums"
            value={d.pct}
            onChange={(e) => setRow(i, { pct: e.target.value })}
            onBlur={onBlur}
          />
          <span className="text-sm text-muted-foreground">%</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("remove")}
            title={t("remove")}
            onClick={() => onChange(rows.filter((_, j) => j !== i), true)}
          >
            <X />
          </Button>
        </div>
      ))}
      {children && <p className="text-xs text-muted-foreground">{children}</p>}
    </div>
  );
}
