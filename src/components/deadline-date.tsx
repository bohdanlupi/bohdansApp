import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

const DAY = 86_400_000;
/** Days a deadline counts as "soon". */
const SOON_DAYS = 7;

const todayZurich = () => new Date(new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" })).getTime();

/**
 * Date of a deadline (offer valid until, invoice due) with a marker while it matters (`active`): red when passed,
 * amber within the next week.
 */
export function DeadlineDate({ date, active, kind }: { date: string | null; active: boolean; kind: "validUntil" | "due" }) {
  const t = useTranslations("deadline");
  if (!date) return null;
  const days = Math.round((new Date(date).getTime() - todayZurich()) / DAY);
  const label = new Date(date).toLocaleDateString("de-CH");
  if (!active) return <span className="tabular-nums text-muted-foreground">{label}</span>;

  const passed = days < 0;
  const soon = !passed && days <= SOON_DAYS;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 tabular-nums", passed && "font-medium text-destructive", soon && "font-medium text-amber-700 dark:text-amber-400")}>
      {label}
      {(passed || soon) && (
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-xs whitespace-nowrap",
            passed ? "bg-destructive/10" : "bg-amber-100 dark:bg-amber-500/20",
          )}
        >
          {passed ? t(`${kind}.passed`, { days: -days }) : days === 0 ? t(`${kind}.today`) : t(`${kind}.soon`, { days })}
        </span>
      )}
    </span>
  );
}
