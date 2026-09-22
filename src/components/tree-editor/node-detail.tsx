"use client";

import { Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { contentLanguages, type I18nText } from "@/lib/i18n-text";
import { formatMoney, formatNumber, parseNumber } from "@/lib/number-input";
import type { AppLanguage } from "@/lib/supabase/types";
import { isPosition, positionTotal } from "@/lib/tree";
import { updateTreeNode, type TreeScope } from "@/lib/tree-actions";
import { cn } from "@/lib/utils";

import { MeasurementTable } from "./measurements";
import type { EditorNode, Measurement } from "./tree-editor";

/** Common units (free text is allowed too). */
const units = ["St", "m", "m²", "m³", "kg", "t", "l", "h", "Std", "LE", "Stk", "Satz", "Tag", "Mt"];

type Draft = {
  short_text: I18nText;
  long_text: I18nText;
  unit: string;
  quantity: string;
  unit_price: string;
  is_optional: boolean;
  is_lump_sum: boolean;
  price_date: string;
};

const toDraft = (node: EditorNode): Draft => ({
  short_text: { ...node.short_text },
  long_text: { ...node.long_text },
  unit: node.unit ?? "",
  quantity: formatNumber(node.quantity, 3, false),
  unit_price: formatNumber(node.unit_price, 2),
  is_optional: node.is_optional ?? false,
  is_lump_sum: node.is_lump_sum ?? false,
  price_date: node.price_date ?? "",
});

/** Detail panel of the selected node; every change is saved when a field loses focus. */
export function NodeDetail({
  scope,
  node,
  language,
  editable,
  measurements,
}: {
  scope: TreeScope;
  node: EditorNode;
  language: AppLanguage;
  editable: boolean;
  measurements: Measurement[];
}) {
  const t = useTranslations("tree");
  const isLv = scope.type === "lv";
  const priced = isPosition(node.kind);
  const [draft, setDraft] = useState<Draft>(() => toDraft(node));
  const [textLanguage, setTextLanguage] = useState<AppLanguage>(language);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saved = useRef(JSON.stringify(toDraft(node)));

  const save = async (next: Draft = draft) => {
    const serialized = JSON.stringify(next);
    if (!editable || serialized === saved.current) return;
    setStatus("saving");
    const result = await updateTreeNode(scope, node.id, {
      short_text: next.short_text,
      long_text: next.long_text,
      unit: next.unit || null,
      // A measured quantity is computed in the database and must not be overwritten.
      quantity: measurements.length > 0 ? undefined : parseNumber(next.quantity),
      unit_price: parseNumber(next.unit_price),
      is_optional: next.is_optional,
      is_lump_sum: next.is_lump_sum,
      price_date: next.price_date || null,
    });
    if (result.error) {
      setStatus("error");
    } else {
      saved.current = serialized;
      setStatus("saved");
    }
  };

  const update = (patch: Partial<Draft>, saveNow = false) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (saveNow) void save(next);
  };

  const setText = (field: "short_text" | "long_text", value: string) =>
    update({ [field]: { ...draft[field], [textLanguage]: value } });

  const hasMeasurements = measurements.length > 0;
  const quantityText = hasMeasurements ? formatNumber(node.quantity, 3, false) : draft.quantity;
  const quantity = draft.is_lump_sum ? 1 : (parseNumber(quantityText) ?? 0);
  const total = positionTotal({ ...node, quantity, unit_price: parseNumber(draft.unit_price) });

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">
          <span className="font-mono tabular-nums">
            {node.kind === "r_position" && "R "}
            {node.number}
          </span>{" "}
          <span className="font-normal text-muted-foreground">{t(`kinds.${node.kind}`)}</span>
        </div>
        <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
          {status === "saving" && (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              {t("saving")}
            </>
          )}
          {status === "saved" && (
            <>
              <Check className="size-3.5 text-emerald-600" />
              {t("saved")}
            </>
          )}
          {status === "error" && <span className="text-destructive">{t("saveError")}</span>}
        </span>
      </div>

      <fieldset disabled={!editable} className="space-y-4">
        <div className="flex gap-1 border-b" role="tablist" aria-label={t("textLanguage")}>
          {contentLanguages.map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={textLanguage === l}
              onClick={() => setTextLanguage(l)}
              className={cn(
                "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs font-semibold uppercase",
                textLanguage === l ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {l}
              {!draft.short_text[l]?.trim() && (draft.short_text.de || draft.short_text.fr || draft.short_text.it) && (
                <span className="size-1.5 rounded-full bg-amber-500" title={t("missingTranslation")} />
              )}
              {l === language && <span className="font-normal normal-case">({t("documentLanguage")})</span>}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <Label htmlFor="short_text">{node.kind === "group" ? t("fields.title") : t("fields.shortText")}</Label>
          <Input
            id="short_text"
            value={draft.short_text[textLanguage] ?? ""}
            onChange={(e) => setText("short_text", e.target.value)}
            onBlur={() => save()}
            autoFocus={editable && !draft.short_text[textLanguage]}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="long_text">{t("fields.longText")}</Label>
          <Textarea
            id="long_text"
            value={draft.long_text[textLanguage] ?? ""}
            onChange={(e) => setText("long_text", e.target.value)}
            onBlur={() => save()}
            rows={node.kind === "text" ? 8 : 5}
            className="max-h-80"
          />
        </div>

        {priced && (
          <div className="grid grid-cols-2 gap-3">
            {isLv && (
              <div className="space-y-2">
                <Label htmlFor="quantity">{t("fields.quantity")}</Label>
                <Input
                  id="quantity"
                  inputMode="decimal"
                  className="text-right tabular-nums"
                  value={draft.is_lump_sum ? "1" : quantityText}
                  disabled={draft.is_lump_sum || hasMeasurements}
                  onChange={(e) => update({ quantity: e.target.value })}
                  onBlur={() => save()}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="unit">{t("fields.unit")}</Label>
              <Input
                id="unit"
                list="tree-units"
                value={draft.is_lump_sum ? t("lumpSumUnit") : draft.unit}
                disabled={draft.is_lump_sum}
                onChange={(e) => update({ unit: e.target.value })}
                onBlur={() => save()}
              />
              <datalist id="tree-units">
                {units.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit_price">{isLv ? t("fields.estimatePrice") : t("fields.unitPrice")}</Label>
              <Input
                id="unit_price"
                inputMode="decimal"
                className="text-right tabular-nums"
                value={draft.unit_price}
                onChange={(e) => update({ unit_price: e.target.value })}
                onBlur={() => {
                  const value = parseNumber(draft.unit_price);
                  update({ unit_price: formatNumber(value, 2) }, true);
                }}
              />
            </div>
            {isLv ? (
              <div className="space-y-2">
                <Label>{t("fields.total")}</Label>
                <div className="flex h-8 items-center justify-end rounded-lg bg-muted/50 px-2.5 text-sm font-semibold tabular-nums">
                  {formatMoney(total)}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="price_date">{t("fields.priceDate")}</Label>
                <Input
                  id="price_date"
                  type="date"
                  value={draft.price_date}
                  onChange={(e) => update({ price_date: e.target.value })}
                  onBlur={() => save()}
                />
              </div>
            )}
            {isLv && (
              <div className="col-span-2 flex flex-wrap gap-x-5 gap-y-2 pt-1 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.is_lump_sum}
                    onChange={(e) => update({ is_lump_sum: e.target.checked }, true)}
                  />
                  {t("fields.lumpSum")}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.is_optional}
                    onChange={(e) => update({ is_optional: e.target.checked }, true)}
                  />
                  {t("fields.optional")}
                </label>
              </div>
            )}
          </div>
        )}
      </fieldset>

      {priced && isLv && !draft.is_lump_sum && (
        <MeasurementTable nodeId={node.id} measurements={measurements} editable={editable} />
      )}
    </div>
  );
}
