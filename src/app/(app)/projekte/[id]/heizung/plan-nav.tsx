"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/** Side navigation of the Heizungsplanung: overview and SIA 108 phases with checklist progress. */
export function HeatingNav({
  projectId,
  phases,
}: {
  projectId: string;
  phases: { code: string; title: string; done: number; total: number }[];
}) {
  const t = useTranslations("heatingPlan");
  const pathname = usePathname();
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

  return (
    <nav aria-label={t("navLabel")} className="flex flex-col gap-0.5 lg:sticky lg:top-4 lg:self-start">
      {link(base, t("overview"), pathname === base)}
      <p className="mt-3 mb-1 px-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("phases")}</p>
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
    </nav>
  );
}
