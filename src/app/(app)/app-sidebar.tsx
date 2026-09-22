"use client";

import { BookOpen, Building2, FolderKanban, Settings } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

const items = [
  { href: "/projekte", key: "projects", icon: FolderKanban },
  { href: "/adressen", key: "addresses", icon: Building2 },
  { href: "/kataloge", key: "catalogs", icon: BookOpen },
  { href: "/einstellungen", key: "settings", icon: Settings },
] as const;

export function AppSidebar() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
      <Link href="/" className="flex h-14 items-center border-b px-5">
        <Image src="/brand/logo.png" alt="LUPI" width={96} height={37} priority />
      </Link>
      <nav className="flex flex-col gap-0.5 p-3">
        {items.map(({ href, key, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80",
                "hover:bg-sidebar-accent hover:text-sidebar-foreground",
                active && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
              )}
            >
              <Icon className="size-4" />
              {t(key)}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
