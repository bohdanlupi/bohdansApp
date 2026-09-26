"use client";

import { useTranslations } from "next-intl";

import { Textarea } from "@/components/ui/textarea";
import { deviceMaxVelocity, heatRecoveryMinimum, overflowPressureLimits, recommendedVelocities, velocityLimits } from "@/lib/kwl/calc";

import { fmt, Section } from "@/components/planning/fields";

const planningHints = ["stages", "intensive", "minimum", "maximum", "simultaneity", "heatRecovery", "efficiency", "enerweb"] as const;
const literature = ["SIA 382/1", "SIA 382/5", "SIA 180", "SWKI VA 104-01", "Minergie", "EnDK Vollzugshilfe EN-105", "EnDK Vollzugshilfe EN-110"];

export function NotesTab({ notes, editable, onChange }: { notes: string; editable: boolean; onChange: (notes: string) => void }) {
  const t = useTranslations("kwl.notes");

  return (
    <div className="space-y-4">
      <Section title={t("own")}>
        <Textarea
          rows={5}
          maxLength={4000}
          defaultValue={notes}
          disabled={!editable}
          aria-label={t("own")}
          onBlur={(e) => e.target.value !== notes && onChange(e.target.value)}
        />
      </Section>

      <Section title={t("planning")}>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {planningHints.map((key) => (
            <li key={key}>
              {t(`hints.${key}`, {
                standard: fmt(heatRecoveryMinimum.standard * 100),
                minergie: fmt(heatRecoveryMinimum.minergie * 100),
              })}
              {key === "enerweb" && (
                <>
                  {" "}
                  <a href="https://www.enerweb.ch/kwl.html" target="_blank" rel="noopener noreferrer" className="underline">
                    enerweb.ch/kwl
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t("velocities")} description={t("velocitiesHint", { device: fmt(deviceMaxVelocity, 1) })}>
          <table className="text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-1 pr-6 text-left font-medium">{t("airFlow")}</th>
                <th className="text-right font-medium">{t("maximum")}</th>
              </tr>
            </thead>
            <tbody>
              {velocityLimits.map(([upTo, v], i) => {
                const from = velocityLimits[i - 1]?.[0];
                return (
                  <tr key={upTo} className="border-b last:border-0">
                    <td className="py-1 pr-6">{Number.isFinite(upTo) ? t("upTo", { flow: fmt(upTo) }) : t("above", { flow: fmt(from) })}</td>
                    <td className="text-right tabular-nums">{fmt(v, 1)} m/s</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground">
            {t("velocitiesLupi", {
              standard: fmt(recommendedVelocities.standard[0][1], 1),
              standardFlow: fmt(recommendedVelocities.standard[0][0]),
              minergie: fmt(recommendedVelocities.minergie[0][1], 1),
              minergieFlow: fmt(recommendedVelocities.minergie[0][0]),
            })}
          </p>
        </Section>

        <Section title={t("overflow")}>
          <table className="text-sm">
            <tbody>
              {overflowPressureLimits.map((row) => (
                <tr key={row.key} className="border-b last:border-0">
                  <td className="py-1 pr-6">{t(`overflowLimits.${row.key}`)}</td>
                  <td className="text-right whitespace-nowrap tabular-nums">{row.pa} Pa</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>

      <Section title={t("fire")}>
        <p className="text-sm">{t("fireText")}</p>
      </Section>

      <Section title={t("literature")}>
        <p className="text-sm">{literature.join(" · ")}</p>
      </Section>
    </div>
  );
}
