"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { FormMessageKey } from "@/components/form";
import { Button } from "@/components/ui/button";
import { formatNumber, formatQty, parseNumber } from "@/lib/number-input";
import { deleteMeasurement, saveMeasurement } from "@/lib/tree-actions";

import type { Measurement } from "./tree-editor";

type Row = { description: string; count: string; factor_a: string; factor_b: string; factor_c: string };

const toRow = (m?: Measurement): Row => ({
  description: m?.description ?? "",
  count: formatNumber(m?.count ?? 1, 3, false),
  factor_a: formatNumber(m?.factor_a, 3, false),
  factor_b: formatNumber(m?.factor_b, 3, false),
  factor_c: formatNumber(m?.factor_c, 3, false),
});

const resultOf = (row: Row) =>
  (parseNumber(row.count) ?? 1) *
  (parseNumber(row.factor_a) ?? 1) *
  (parseNumber(row.factor_b) ?? 1) *
  (parseNumber(row.factor_c) ?? 1);

/** Vorausmass: quantity = Σ count × a × b × c (computed in the database). */
export function MeasurementTable({
  nodeId,
  measurements,
  editable,
}: {
  nodeId: string;
  measurements: Measurement[];
  editable: boolean;
}) {
  const t = useTranslations("tree.measurements");
  const tForms = useTranslations("forms");
  const [pending, startTransition] = useTransition();
  const sorted = [...measurements].sort((a, b) => a.sort - b.sort);
  const total = sorted.reduce((sum, m) => sum + (m.result ?? 0), 0);

  const add = () =>
    startTransition(async () => {
      const result = await saveMeasurement(nodeId, null, { description: null, count: 1, factor_a: null, factor_b: null, factor_c: null });
      if (result.error) toast.error(tForms(result.error as FormMessageKey));
    });

  return (
    <div className="space-y-2 border-t pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("title")}</h3>
        {editable && (
          <Button variant="outline" size="xs" onClick={add} disabled={pending}>
            <Plus />
            {t("add")}
          </Button>
        )}
      </div>
      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="pb-1 text-left font-medium">{t("description")}</th>
              <th className="w-14 pb-1 text-right font-medium">{t("count")}</th>
              <th className="w-14 pb-1 text-right font-medium">a</th>
              <th className="w-14 pb-1 text-right font-medium">b</th>
              <th className="w-14 pb-1 text-right font-medium">c</th>
              <th className="w-16 pb-1 text-right font-medium">{t("result")}</th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => (
              <MeasurementRow key={m.id} nodeId={nodeId} measurement={m} editable={editable} />
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td colSpan={5} className="pt-1.5 text-right">
                {t("total")}
              </td>
              <td className="pt-1.5 text-right tabular-nums">{formatQty(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

function MeasurementRow({ nodeId, measurement, editable }: { nodeId: string; measurement: Measurement; editable: boolean }) {
  const t = useTranslations("tree.measurements");
  const tForms = useTranslations("forms");
  const [row, setRow] = useState<Row>(() => toRow(measurement));
  const [savedRow, setSavedRow] = useState(() => JSON.stringify(toRow(measurement)));

  const save = async () => {
    if (!editable || JSON.stringify(row) === savedRow) return;
    const result = await saveMeasurement(nodeId, measurement.id, {
      description: row.description.trim() || null,
      count: parseNumber(row.count) ?? 1,
      factor_a: parseNumber(row.factor_a),
      factor_b: parseNumber(row.factor_b),
      factor_c: parseNumber(row.factor_c),
    });
    if (result.error) toast.error(tForms(result.error as FormMessageKey));
    else setSavedRow(JSON.stringify(row));
  };

  const cell = (field: keyof Row, className: string) => (
    <input
      aria-label={field === "description" ? t("description") : field === "count" ? t("count") : field.slice(-1)}
      value={row[field]}
      disabled={!editable}
      inputMode={field === "description" ? "text" : "decimal"}
      onChange={(e) => setRow({ ...row, [field]: e.target.value })}
      onBlur={save}
      className={`h-7 w-full rounded border border-transparent bg-transparent px-1 outline-none hover:border-input focus:border-ring ${className}`}
    />
  );

  return (
    <tr className="border-t">
      <td className="py-0.5">{cell("description", "")}</td>
      <td>{cell("count", "text-right tabular-nums")}</td>
      <td>{cell("factor_a", "text-right tabular-nums")}</td>
      <td>{cell("factor_b", "text-right tabular-nums")}</td>
      <td>{cell("factor_c", "text-right tabular-nums")}</td>
      <td className="text-right tabular-nums">{formatQty(resultOf(row))}</td>
      <td className="text-right">
        {editable && (
          <button
            type="button"
            aria-label={t("delete")}
            className="text-muted-foreground hover:text-destructive"
            onClick={async () => {
              const result = await deleteMeasurement(measurement.id);
              if (result.error) toast.error(tForms(result.error as FormMessageKey));
            }}
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </td>
    </tr>
  );
}
