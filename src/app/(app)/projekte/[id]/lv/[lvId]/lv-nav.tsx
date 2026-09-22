"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

const tabs = [
  { path: "", key: "positions" },
  { path: "/offerten", key: "offers" },
  { path: "/vergleich", key: "comparison" },
] as const;

export function LvNav({ projectId, lvId }: { projectId: string; lvId: string }) {
  const t = useTranslations("lvs.tabs");
  const pathname = usePathname();
  const base = `/projekte/${projectId}/lv/${lvId}`;

  return (
    <nav className="flex gap-1">
      {tabs.map(({ path, key }) => {
        const href = base + path;
        const active = pathname === href;
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium",
              active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
