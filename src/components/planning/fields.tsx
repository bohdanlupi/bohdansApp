"use client";

import { useState } from "react";

import { formatNumber, parseNumber } from "@/lib/number-input";
import { cn } from "@/lib/utils";

/** Number input that accepts Swiss formats and reports the parsed value on blur / Enter. */
export function NumberField({
  id,
  value,
  onChange,
  decimals = 1,
  label,
  className,
  disabled,
  placeholder,
}: {
  id?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  decimals?: number;
  label: string;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(formatNumber(value, decimals, false));
  const [shown, setShown] = useState(value);
  // Follow outside changes (e.g. room type defaults) without a remount.
  if (shown !== value) {
    setShown(value);
    setText(formatNumber(value, decimals, false));
  }

  return (
    <input
      id={id}
      aria-label={label}
      title={label}
      inputMode="decimal"
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const parsed = parseNumber(text);
        const clean = parsed === null ? null : Math.max(0, parsed);
        setText(formatNumber(clean, decimals, false));
        if (clean !== value) onChange(clean);
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className={cn(
        "h-7 w-full rounded border border-input bg-transparent px-1.5 text-right tabular-nums outline-none focus:border-ring disabled:opacity-60",
        className,
      )}
    />
  );
}

/** Read-only computed value. */
export const fmt = (value: number | null | undefined, decimals = 0) =>
  value === null || value === undefined || !Number.isFinite(value) ? "" : formatNumber(value, decimals);

export function Result({
  label,
  value,
  unit,
  tone,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "ok" | "bad" | "warn";
  hint?: string;
}) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          tone === "ok" && "text-emerald-700 dark:text-emerald-400",
          tone === "bad" && "text-destructive",
          tone === "warn" && "text-amber-700 dark:text-amber-400",
        )}
      >
        {value || "–"}
        {value && unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Section({ title, description, children, actions }: {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Notice({ tone = "warn", children }: { tone?: "warn" | "info"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        tone === "warn"
          ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
          : "bg-muted/40 text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}
