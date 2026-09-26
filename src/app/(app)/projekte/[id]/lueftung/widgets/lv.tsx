"use client";

import { ListChecks } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import { formatMoney } from "@/lib/number-input";

import { Notice, Section } from "@/components/planning/fields";
import type { WidgetProps } from "./types";

/** Ausschreibung: the project's Leistungsverzeichnisse (the LV module does the tender itself). */
export function LvWidget({ lvs, projectId }: WidgetProps) {
  const t = useTranslations("kwlPlan.lv");

  return (
    <Section
      title={t("title")}
      description={t("description")}
      actions={
        <Link href={`/projekte/${projectId}/lv`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <ListChecks />
          {t("open")}
        </Link>
      }
    >
      {lvs.length === 0 ? (
        <Notice tone="info">{t("empty")}</Notice>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {lvs.map((lv) => (
            <li key={lv.id}>
              <Link href={`/projekte/${projectId}/lv/${lv.id}`} className="flex justify-between gap-3 px-3 py-2 hover:bg-muted/50">
                <span>
                  <span className="mr-2 font-mono tabular-nums">{lv.number}</span>
                  {lv.title}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {t("positions", { count: lv.position_count ?? 0 })} · CHF {formatMoney(lv.estimate_total)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
