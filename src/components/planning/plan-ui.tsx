"use client";

import { Check, CircleSlash, Loader2, MessageSquare, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { NativeSelect } from "@/components/form";
import { Label } from "@/components/ui/label";
import { type CheckState, isHandled, type L10n } from "@/lib/planning";
import type { AppLanguage } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

import { NumberField } from "./fields";
import type { SaveStatus } from "./use-plan";

type Item = { id: string; ref: string; text: L10n };

/** Lüftung references without a norm name are clauses of SIA 382/5. */
const defaultRef = (ref: string) => (ref.startsWith("SIA") ? ref : `SIA 382/5 ${ref}`);

export function SaveIndicator({ status }: { status: SaveStatus }) {
  const t = useTranslations("kwlPlan.save");
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", status === "error" ? "text-destructive" : "text-muted-foreground")}>
      {status === "saving" || status === "pending" ? <Loader2 className="size-3.5 animate-spin" /> : status === "error" ? <TriangleAlert className="size-3.5" /> : <Check className="size-3.5" />}
      {t(status)}
    </span>
  );
}

/** Checklist with done / not applicable states and a note per item. */
export function Checklist({
  title,
  items,
  checks,
  language,
  editable,
  onChange,
  formatRef = defaultRef,
}: {
  title: string;
  items: Item[];
  checks: Record<string, CheckState>;
  language: AppLanguage;
  editable: boolean;
  onChange: (id: string, value: CheckState | null) => void;
  formatRef?: (ref: string) => string;
}) {
  const t = useTranslations("kwlPlan.checklist");
  const done = items.filter((item) => isHandled(checks[item.id])).length;
  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="font-semibold">{title}</h2>
        <span className={cn("text-xs tabular-nums", done === items.length ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
          {done}/{items.length}
        </span>
      </header>
      <ul className="divide-y">
        {items.map((item) => (
          <ChecklistRow
            key={item.id}
            item={item}
            state={checks[item.id] ?? null}
            language={language}
            editable={editable}
            labels={{ done: t("done"), na: t("na"), note: t("note"), ref: t("ref") }}
            formatRef={formatRef}
            onChange={(value) => onChange(item.id, value)}
          />
        ))}
      </ul>
    </section>
  );
}

function ChecklistRow({
  item,
  state,
  language,
  editable,
  labels,
  formatRef,
  onChange,
}: {
  item: Item;
  state: CheckState | null;
  language: AppLanguage;
  editable: boolean;
  labels: { done: string; na: string; note: string; ref: string };
  formatRef: (ref: string) => string;
  onChange: (value: CheckState | null) => void;
}) {
  const [noteOpen, setNoteOpen] = useState(Boolean(state?.n));
  const id = useId();
  // Unchecking keeps a note as an open item.
  const toggle = (s: "done" | "na") =>
    onChange(state?.s === s ? (state.n ? { s: "open", n: state.n } : null) : { s, n: state?.n });

  return (
    <li className={cn("px-4 py-2", state?.s === "na" && "opacity-60")}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          disabled={!editable}
          aria-pressed={state?.s === "done"}
          aria-label={labels.done}
          onClick={() => toggle("done")}
          className={cn(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border",
            state?.s === "done" ? "border-emerald-600 bg-emerald-600 text-white" : "border-input hover:border-foreground/50",
          )}
        >
          {state?.s === "done" && <Check className="size-3.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm", state?.s === "na" && "line-through")}>{item.text[language]}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {labels.ref} {formatRef(item.ref)}
          </p>
          {noteOpen && (
            <textarea
              id={id}
              aria-label={labels.note}
              defaultValue={state?.n ?? ""}
              maxLength={1000}
              rows={2}
              disabled={!editable}
              onBlur={(e) => {
                const n = e.target.value.trim();
                if (n === (state?.n ?? "")) return;
                if (state) onChange(n || state.s !== "open" ? { ...state, n: n || undefined } : null);
                else if (n) onChange({ s: "open", n });
              }}
              className="mt-1.5 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm outline-none focus:border-ring"
            />
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            title={labels.note}
            aria-label={labels.note}
            onClick={() => setNoteOpen((o) => !o)}
            className={cn("rounded p-1 text-muted-foreground hover:bg-muted", state?.n && "text-brand")}
          >
            <MessageSquare className="size-4" />
          </button>
          <button
            type="button"
            disabled={!editable}
            title={labels.na}
            aria-label={labels.na}
            aria-pressed={state?.s === "na"}
            onClick={() => toggle("na")}
            className={cn("rounded p-1 text-muted-foreground hover:bg-muted", state?.s === "na" && "bg-muted text-foreground")}
          >
            <CircleSlash className="size-4" />
          </button>
        </div>
      </div>
    </li>
  );
}

export function OptionField<T extends string>({
  label,
  value,
  options,
  optionLabel,
  editable,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: readonly T[];
  optionLabel: (value: T) => string;
  editable: boolean;
  onChange: (value: T) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} value={value} disabled={!editable} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {optionLabel(o)}
          </option>
        ))}
      </NativeSelect>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function NumberParam({
  label,
  value,
  editable,
  onChange,
  decimals = 0,
  hint,
  placeholder,
}: {
  label: string;
  value: number | null;
  editable: boolean;
  onChange: (value: number | null) => void;
  decimals?: number;
  hint?: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <NumberField id={id} value={value} decimals={decimals} label={label} disabled={!editable} placeholder={placeholder} onChange={onChange} className="h-8 rounded-lg" />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Toggle({ label, checked, editable, onChange }: { label: string; checked: boolean; editable: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5" checked={checked} disabled={!editable} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Row of label / value / verdict for derived requirements. */
export function Fact({ label, value, ok }: { label: string; value: string; ok?: boolean | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right font-medium tabular-nums", ok === true && "text-emerald-700 dark:text-emerald-400", ok === false && "text-destructive")}>
        {value}
      </span>
    </div>
  );
}
