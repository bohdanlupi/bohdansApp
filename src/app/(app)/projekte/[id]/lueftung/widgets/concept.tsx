"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Section } from "../fields";
import type { WidgetProps } from "./types";

/** Chosen ventilation concept with the norm's notes on it (4.1, 4.2, 5.4). */
export function ConceptWidget({ plan, projectId }: WidgetProps) {
  const t = useTranslations("kwlPlan");
  const p = plan.params;
  const lines = (key: string) => (t.raw(key as never) as string[] | undefined) ?? [];

  return (
    <Section
      title={t("concept.title")}
      description={t("concept.description")}
      actions={
        <Link href={`/projekte/${projectId}/lueftung`} className="text-sm underline">
          {t("concept.change")}
        </Link>
      }
    >
      <p className="text-sm">
        <span className="font-medium">{t(`options.system.${p.system}`)}</span> · {t(`options.unit.${p.unit}`)} ·{" "}
        {t(`options.operation.${p.operation}`)} · {t(`options.kitchen.${p.kitchen}`)}
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {lines(`concept.system.${p.system}`).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="grid gap-4 md:grid-cols-2">
        {(["multi", "single"] as const).map((unit) => (
          <div key={unit} className={unit === p.unit ? "rounded-lg bg-brand/5 p-3" : "rounded-lg p-3"}>
            <p className="text-sm font-medium">{t(`concept.advantages.${unit}`)}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
              {lines(`concept.pros.${unit}`).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}
