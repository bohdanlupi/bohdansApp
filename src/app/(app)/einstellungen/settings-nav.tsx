"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

const tabs = [
  { href: "/einstellungen", key: "firm" },
  { href: "/einstellungen/benutzer", key: "users" },
  { href: "/einstellungen/kostenplaene", key: "costPlans" },
  { href: "/einstellungen/profil", key: "profile" },
] as const;

export function SettingsNav() {
  const t = useTranslations("settings.tabs");
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b">
      {tabs.map(({ href, key }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
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
