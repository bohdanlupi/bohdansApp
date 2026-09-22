"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type CompanyOption = { id: string; name: string; city: string | null };

const MAX_SHOWN = 50;

/**
 * Searchable company select. Submits the selected id as a hidden input named `name`.
 * All options are passed in (a few thousand addresses are fine to filter on the client).
 */
export function CompanyPicker({
  options,
  name,
  id,
  defaultValue,
  required,
  onChange,
}: {
  options: CompanyOption[];
  name: string;
  id?: string;
  defaultValue?: string | null;
  required?: boolean;
  onChange?: (companyId: string | null) => void;
}) {
  const t = useTranslations("companyPicker");
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<CompanyOption | null>(
    () => options.find((o) => o.id === defaultValue) ?? null,
  );
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return options
      .filter((o) => {
        const text = `${o.name} ${o.city ?? ""}`.toLowerCase();
        return words.every((w) => text.includes(w));
      })
      .slice(0, MAX_SHOWN);
  }, [options, query]);

  const choose = (option: CompanyOption) => {
    setSelected(option);
    setQuery("");
    setOpen(false);
    onChange?.(option.id);
  };

  const label = (o: CompanyOption) => (o.city ? `${o.name}, ${o.city}` : o.name);

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          required={required && !selected}
          placeholder={selected ? label(selected) : t("placeholder")}
          value={open ? query : selected ? label(selected) : ""}
          onFocus={() => {
            setOpen(true);
            setHighlight(0);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setHighlight((h) => Math.min(h + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter" && open) {
              e.preventDefault();
              if (matches[highlight]) choose(matches[highlight]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className={cn(
            "h-8 w-full rounded-lg border border-input bg-transparent pr-8 pl-2.5 text-sm outline-none",
            "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            selected && !open && "placeholder:text-foreground",
          )}
        />
        <ChevronsUpDown className="pointer-events-none absolute top-2 right-2.5 size-4 text-muted-foreground" />
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-popover p-1 text-sm shadow-md"
        >
          {matches.length === 0 && <li className="px-2 py-1.5 text-muted-foreground">{t("noMatches")}</li>}
          {matches.map((o, i) => (
            <li
              key={o.id}
              role="option"
              aria-selected={o.id === selected?.id}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5",
                i === highlight && "bg-muted",
              )}
            >
              <Check className={cn("size-3.5 shrink-0", o.id === selected?.id ? "opacity-100" : "opacity-0")} />
              <span className="truncate">{o.name}</span>
              {o.city && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{o.city}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
