"use client";

import { ChevronDown } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

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
  negative = false,
}: {
  id?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  decimals?: number;
  label: string;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  /** Allow values below zero (e.g. temperatures). */
  negative?: boolean;
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
        const clean = parsed === null ? null : negative ? parsed : Math.max(0, parsed);
        setText(formatNumber(clean, decimals, false));
        if (clean !== value) onChange(clean);
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className={cn(
        "h-7 w-full rounded border border-input bg-field px-1.5 text-right tabular-nums outline-none focus:border-ring disabled:opacity-60",
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

// Collapsed sections, remembered in localStorage (falls back to memory when storage is blocked).
const collapsedMemory = new Map<string, boolean>();
const collapseListeners = new Set<() => void>();
function subscribeCollapsed(listener: () => void) {
  collapseListeners.add(listener);
  return () => collapseListeners.delete(listener);
}
function readCollapsed(key: string | null): boolean {
  if (!key) return false;
  if (collapsedMemory.has(key)) return collapsedMemory.get(key)!;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeCollapsed(key: string, value: boolean) {
  collapsedMemory.set(key, value);
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // storage blocked: kept in memory for this visit
  }
  collapseListeners.forEach((l) => l());
}

/**
 * Bordered section with title, description and actions. With `collapseKey` it can be minimised to its title; the
 * state is remembered per key in the browser (localStorage).
 */
export function Section({ title, description, children, actions, collapseKey }: {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  collapseKey?: string;
}) {
  const storageKey = collapseKey ? `section-collapsed:${collapseKey}` : null;
  const collapsed = useSyncExternalStore(subscribeCollapsed, () => readCollapsed(storageKey), () => false);
  const toggle = () => storageKey && writeCollapsed(storageKey, !collapsed);
  const heading = storageKey ? (
    <button type="button" onClick={toggle} aria-expanded={!collapsed} className="flex items-center gap-1.5 text-left font-semibold hover:text-brand">
      <ChevronDown className={cn("size-4 shrink-0 transition-transform", collapsed && "-rotate-90")} />
      {title}
    </button>
  ) : (
    <h2 className="font-semibold">{title}</h2>
  );
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {storageKey ? <h2>{heading}</h2> : heading}
          {description && !collapsed && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {!collapsed && actions}
      </div>
      {!collapsed && children}
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
