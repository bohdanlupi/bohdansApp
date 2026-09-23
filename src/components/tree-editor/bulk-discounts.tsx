"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { FormMessageKey } from "@/components/form";
import { Button } from "@/components/ui/button";
import { setPositionDiscounts } from "@/lib/tree-actions";

import { DiscountRows, parseDiscounts, toDiscountDrafts } from "./discount-rows";
import type { EditorNode } from "./tree-editor";

/**
 * Gives all selected LV positions the same discounts. Render it with a key per selection so it starts from
 * the positions' common discounts (or empty when they differ).
 */
export function BulkDiscounts({ lvId, positions, skippedGroups }: { lvId: string; positions: EditorNode[]; skippedGroups: number }) {
  const t = useTranslations("tree.discounts");
  const tForms = useTranslations("forms");
  const key = (n: EditorNode) => JSON.stringify(n.discounts ?? []);
  const same = positions.every((n) => key(n) === key(positions[0]));
  const [rows, setRows] = useState(() => (same ? toDiscountDrafts(positions[0]?.discounts) : []));
  const [pending, startTransition] = useTransition();

  const apply = () =>
    startTransition(async () => {
      const result = await setPositionDiscounts(
        lvId,
        positions.map((n) => n.id),
        parseDiscounts(rows),
      );
      if (result.error) toast.error(tForms(result.error as FormMessageKey));
      else toast.success(t("applied", { count: positions.length }));
    });

  if (!positions.length) return <p className="text-muted-foreground">{t("noPositions")}</p>;

  return (
    <div className="space-y-3 border-t pt-3">
      <DiscountRows rows={rows} editable onChange={setRows}>
        {t("bulkHint")}
        {!same && <> {t("bulkMixed")}</>}
        {skippedGroups > 0 && <> {t("bulkGroupsSkipped", { count: skippedGroups })}</>}
      </DiscountRows>
      <Button onClick={apply} disabled={pending} size="sm">
        {t("apply", { count: positions.length })}
      </Button>
    </div>
  );
}
