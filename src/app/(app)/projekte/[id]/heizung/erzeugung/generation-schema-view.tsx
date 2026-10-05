"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { type GenerationSchema, legendSymbol, pipeColors, pipeDashed, symbolRefs } from "@/lib/heating/generation-schema";

import { SvgPrims } from "../../lueftung/anlagen/[systemId]/schema-view";

/** Pixels per schema unit (texts of 7 units at about 9 px), as the Sanitär schema. */
const SCALE = 1.3;

/**
 * Prinzipschema Wärmeerzeugung at a fixed readable size and its full height; the slider below moves the view sideways.
 * The legend lists the pipes and the SIA 410 symbols used.
 */
export function GenerationSchemaView({ schema, label }: { schema: GenerationSchema; label: string }) {
  const t = useTranslations("heatingPlan.generation");
  const frame = useRef<HTMLDivElement>(null);
  const [viewWidth, setViewWidth] = useState(0);
  const width = schema.width * SCALE;
  const height = schema.height * SCALE;
  const maxX = Math.max(0, width - viewWidth);
  const [x, setX] = useState(0);
  const posX = Math.min(x, maxX);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setViewWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="space-y-3">
      <div ref={frame} className="relative overflow-hidden rounded-lg border bg-background" style={{ height }}>
        <svg
          viewBox={`0 0 ${schema.width} ${schema.height}`}
          width={width}
          height={height}
          className="absolute top-0 left-0 max-w-none text-foreground"
          style={{ transform: `translate(${-posX}px, 0)` }}
          role="img"
          aria-label={label}
        >
          {schema.lines.map((l, i) => (
            <path key={i} d={l.d} fill="none" stroke={pipeColors[l.kind]} strokeWidth={l.width} strokeDasharray={pipeDashed(l.kind) ? "6 3" : undefined} />
          ))}
          {schema.groups.map((g, i) => (
            <g key={i}>
              <SvgPrims prims={g.prims} />
            </g>
          ))}
        </svg>
      </div>
      <input
        type="range"
        min={0}
        max={Math.round(maxX)}
        value={Math.round(posX)}
        disabled={maxX <= 0}
        onChange={(e) => setX(Number(e.target.value))}
        aria-label={t("moveHorizontal")}
        className="w-full accent-brand disabled:opacity-40"
      />
      <div>
        <p className="mb-2 text-sm font-medium">{t("legendTitle")}</p>
        <ul className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {schema.pipes.map((k) => (
            <li key={k} className="flex items-center gap-2">
              <svg viewBox="0 0 40 30" className="h-6 w-8 shrink-0 text-foreground" aria-hidden>
                <line x1={2} y1={15} x2={38} y2={15} stroke={pipeColors[k]} strokeWidth={2} strokeDasharray={pipeDashed(k) ? "6 3" : undefined} />
              </svg>
              <span>{t(`pipes.${k}`)}</span>
            </li>
          ))}
          {schema.used.map((k) => (
            <li key={k} className="flex items-center gap-2">
              <svg viewBox="0 0 40 30" className="h-6 w-8 shrink-0 text-foreground" aria-hidden>
                <SvgPrims prims={legendSymbol(k)} />
              </svg>
              <span>
                {t(`legend.${k}`)} <span className="text-muted-foreground">SIA 410 {symbolRefs[k]}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">{t("legendHint")}</p>
      </div>
    </div>
  );
}
