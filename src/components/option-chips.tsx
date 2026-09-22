import { cn } from "@/lib/utils";

/** Multi-select as toggleable chips (native checkboxes, so it works in plain forms). */
export function OptionChips({
  name,
  options,
  defaultValue = [],
  disabled,
}: {
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: readonly string[];
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            "inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-xs font-medium select-none",
            "text-muted-foreground hover:bg-muted has-checked:border-brand has-checked:bg-brand/10 has-checked:text-foreground",
            "has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:cursor-default has-disabled:opacity-70",
          )}
        >
          <input
            type="checkbox"
            name={name}
            value={option.value}
            defaultChecked={defaultValue.includes(option.value)}
            disabled={disabled}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
