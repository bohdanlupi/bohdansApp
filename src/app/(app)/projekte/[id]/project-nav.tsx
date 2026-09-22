"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

const tabs = [
  { path: "", key: "overview" },
  { path: "/lv", key: "lvs" },
  { path: "/kostenplan", key: "costPlan" },
] as const;

export function ProjectNav({ projectId }: { projectId: string }) {
  const t = useTranslations("projects.tabs");
  const pathname = usePathname();
  const base = `/projekte/${projectId}`;

  return (
    <nav className="flex gap-1 border-b">
      {tabs.map(({ path, key }) => {
        const href = base + path;
        const active = path ? pathname === href || pathname.startsWith(`${href}/`) : pathname === href;
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              active ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
