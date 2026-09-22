"use client";

import { Check, ChevronDown, Languages, LogOut, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { localeLabels, locales, type Locale } from "@/i18n/config";
import type { AppRole } from "@/lib/supabase/types";

import { signOut } from "../(auth)/actions";
import { setLocale } from "./actions";

export function UserMenu({ name, role }: { name: string; role: AppRole }) {
  const t = useTranslations();
  const current = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const changeLocale = (locale: Locale) =>
    startTransition(async () => {
      await setLocale(locale);
      router.refresh();
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="gap-2" disabled={pending} />}>
        <UserRound className="size-4" />
        <span className="max-w-48 truncate">{name}</span>
        <ChevronDown className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="truncate font-medium text-foreground">{name}</div>
            <div className="text-xs font-normal">{t(`roles.${role}`)}</div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2">
            <Languages className="size-3.5" />
            {t("common.language")}
          </DropdownMenuLabel>
          {locales.map((locale) => (
            <DropdownMenuItem key={locale} onClick={() => changeLocale(locale)}>
              <Check className={locale === current ? "size-4" : "size-4 opacity-0"} />
              {localeLabels[locale]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/einstellungen/profil")}>
          <UserRound className="size-4" />
          {t("nav.profile")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => startTransition(() => signOut())}>
          <LogOut className="size-4" />
          {t("auth.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
