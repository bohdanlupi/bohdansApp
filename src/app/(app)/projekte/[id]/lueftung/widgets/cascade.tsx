"use client";

import { useTranslations } from "next-intl";

import { Section } from "../fields";
import type { WidgetProps } from "./types";

/** Diagram of the cascade principle (Figure 2) and the pressure profile in the dwelling (Figure 1). */
export function CascadeWidget({ plan }: WidgetProps) {
  const t = useTranslations("kwlPlan.cascade");
  const extract = plan.params.system === "extract";
  const zones = [t("supplyZone"), t("passageZone"), t("extractZone")];
  const examples = [t("supplyRooms"), t("passageRooms"), t("extractRooms")];
  // Pressure (Pa) of the three zones relative to outside, maximum values of Figure 1.
  const levels = extract ? [-4, -5, -6] : [3, 0, -3];
  const y = (pa: number) => 250 - pa * 9;

  return (
    <Section title={t("title")} description={extract ? t("descriptionExtract") : t("description")}>
      <svg viewBox="0 0 640 330" className="w-full max-w-3xl text-foreground" role="img" aria-label={t("title")}>
        <defs>
          <marker id="kwl-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="fill-foreground" />
          </marker>
        </defs>
        <rect x="20" y="40" width="600" height="120" rx="4" className="fill-none stroke-muted-foreground" strokeWidth="6" />
        {[220, 420].map((x) => (
          <line key={x} x1={x} x2={x} y1="43" y2="157" className="stroke-muted-foreground" strokeWidth="5" />
        ))}
        {zones.map((zone, i) => (
          <g key={zone}>
            <text x={120 + i * 200} y="85" textAnchor="middle" className="fill-foreground text-[13px] font-medium">
              {zone}
            </text>
            <text x={120 + i * 200} y="105" textAnchor="middle" className="fill-muted-foreground text-[11px]">
              {examples[i]}
            </text>
          </g>
        ))}
        {[220, 420].map((x) => (
          <g key={`t${x}`}>
            <line x1={x - 25} x2={x + 25} y1="135" y2="135" className="stroke-foreground" strokeWidth="2" markerEnd="url(#kwl-arrow)" />
            <text x={x} y="152" textAnchor="middle" className="fill-muted-foreground text-[10px]">
              ÜSLD
            </text>
          </g>
        ))}
        {extract ? (
          <g>
            <line x1="0" x2="30" y1="120" y2="120" className="stroke-foreground" strokeWidth="2" markerEnd="url(#kwl-arrow)" />
            <text x="2" y="112" className="fill-muted-foreground text-[10px]">
              ALD
            </text>
          </g>
        ) : (
          <g>
            <line x1="70" x2="70" y1="5" y2="60" className="stroke-foreground" strokeWidth="2" markerEnd="url(#kwl-arrow)" />
            <text x="78" y="20" className="fill-muted-foreground text-[11px]">
              ZUL
            </text>
          </g>
        )}
        <line x1="570" x2="570" y1="60" y2="5" className="stroke-foreground" strokeWidth="2" markerEnd="url(#kwl-arrow)" />
        <text x="540" y="20" className="fill-muted-foreground text-[11px]">
          ABL
        </text>

        <line x1="20" x2="620" y1={y(0)} y2={y(0)} className="stroke-muted-foreground" strokeWidth="1" />
        <text x="596" y={y(0) - 4} className="fill-muted-foreground text-[10px]">
          0 Pa
        </text>
        <polyline
          points={levels.flatMap((pa, i) => [`${30 + i * 200},${y(pa)}`, `${190 + i * 200},${y(pa)}`]).join(" ")}
          className="fill-none stroke-brand"
          strokeWidth="2.5"
          strokeDasharray="6 4"
        />
        {levels.map((pa, i) =>
          pa !== 0 ? (
            <text key={i} x={110 + i * 200} y={y(pa) + (pa > 0 ? -6 : 16)} textAnchor="middle" className="fill-foreground text-[11px]">
              {t("max", { pa: pa > 0 ? `+${pa}` : String(pa) })}
            </text>
          ) : null,
        )}
        <text x="20" y="190" className="fill-muted-foreground text-[10px]">
          {t("overpressure")}
        </text>
        <text x="20" y="322" className="fill-muted-foreground text-[10px]">
          {t("underpressure")}
        </text>
      </svg>
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
    </Section>
  );
}
