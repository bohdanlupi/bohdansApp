"use client";

import { BookOpen, Building2, FileSignature, FolderKanban, ReceiptText, Settings } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

const items = [
  { href: "/projekte", key: "projects", icon: FolderKanban },
  { href: "/debitoren", key: "debtors", icon: FileSignature },
  { href: "/kreditoren", key: "creditors", icon: ReceiptText },
  { href: "/adressen", key: "addresses", icon: Building2 },
  { href: "/kataloge", key: "catalogs", icon: BookOpen },
  { href: "/einstellungen", key: "settings", icon: Settings },
] as const;

/** Logo and main tabs in the top bar, so the full width below stays free for the content. */
export function AppNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <div className="flex min-w-0 flex-1 items-center gap-6">
      <Link href="/" className="shrink-0">
        <Image src="/brand/logo.png" alt="LUPI" width={96} height={37} priority />
      </Link>
      <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
        {items.map(({ href, key, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-foreground/80",
                "hover:bg-accent hover:text-foreground",
                active && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
              )}
            >
              <Icon className="size-4" />
              {t(key)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
