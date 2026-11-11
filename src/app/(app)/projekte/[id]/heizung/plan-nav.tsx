"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/** 242 Wärmeerzeugung (one page) and the subchapters of 243 Wärmeverteilung: path below /heizung and message key. */
export const generationChapter = ["erzeugung", "generationTitle"] as const;
export const distributionChapters = [
  ["verteilung/waermebedarf", "heatDemand"],
  ["verteilung/fussbodenheizung", "floorHeating"],
  ["verteilung/heizkoerper", "radiators"],
  ["verteilung/schema", "schemaDistribution"],
] as const;
/** Gebäude: the building model (plans, rooms, envelope) and the SIA 380/1 heat demand built on it. */
export const buildingChapters = [
  ["gebaeude", "buildingModel"],
  ["gebaeude/sia3801", "sia3801"],
] as const;

/**
 * Side navigation of the Heizung: overview with the Auslegungskriterien, SIA 108 checklists with their progress,
 * then the chapters Gebäude, 242 Wärmeerzeugung and 243 Wärmeverteilung. The chosen Anlage (?anlage=) is kept
 * when switching subchapters.
 */
export function HeatingNav({
  projectId,
  phases,
}: {
  projectId: string;
  phases: { code: string; title: string; done: number; total: number }[];
}) {
  const t = useTranslations("heatingPlan");
  const pathname = usePathname();
  const plant = useSearchParams().get("anlage");
  const base = `/projekte/${projectId}/heizung`;
  const link = (href: string, label: React.ReactNode, active: boolean, extra?: React.ReactNode) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm",
        active ? "bg-brand/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      {extra}
    </Link>
  );
  const heading = (label: string) => <p className="mt-3 mb-1 px-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>;
  const chapter = ([path, key]: readonly [string, string]) => {
    const href = `${base}/${path}`;
    return link(plant ? `${href}?anlage=${plant}` : href, t(`chapters.${key}` as never), pathname === href || pathname.startsWith(`${href}/`));
  };
  // The building model is active for its plan editor too, but not for the SIA 380/1 page below it.
  const building = ([path, key]: readonly [string, string]) => {
    const href = `${base}/${path}`;
    const active = path === "gebaeude" ? pathname.startsWith(href) && !pathname.startsWith(`${href}/sia3801`) : pathname.startsWith(href);
    return link(href, t(`chapters.${key}` as never), active);
  };

  return (
    <nav aria-label={t("navLabel")} className="flex flex-col gap-0.5 lg:sticky lg:top-4 lg:self-start">
      {link(base, t("overview"), pathname === base)}
      {heading(t("phases"))}
      {phases.map((p) =>
        link(
          `${base}/${p.code}`,
          <>
            <span className="mr-1.5 font-mono text-xs tabular-nums">{p.code}</span>
            {p.title}
          </>,
          pathname === `${base}/${p.code}`,
          p.total > 0 && (
            <span
              className={cn(
                "shrink-0 rounded px-1.5 text-xs tabular-nums",
                p.done === p.total ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-muted",
              )}
            >
              {p.done}/{p.total}
            </span>
          ),
        ),
      )}
      {heading(t("chapters.building"))}
      {buildingChapters.map(building)}
      {heading(t("chapters.generation"))}
      {chapter(generationChapter)}
      {heading(t("chapters.distribution"))}
      {distributionChapters.map(chapter)}
    </nav>
  );
}
