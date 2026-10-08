"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { type DistributionSchema, lineColors } from "@/lib/heating/distribution-layout";
import { insulationStyle } from "@/lib/sanitary/pipes";

import { SvgPrims } from "../../../lueftung/anlagen/[systemId]/schema-view";

/** Pixels per schema unit, as the Sanitär Strangschema. */
const SCALE = 1.3;

/**
 * Strangschema in the editor at a fixed readable size and its full height; the slider moves the view sideways.
 * Clicking a line or symbol selects its element.
 */
export function DistributionSchemaView({ schema, selected, label, onSelect }: { schema: DistributionSchema; selected: string | null; label: string; onSelect: (id: string) => void }) {
  const t = useTranslations("heatingDistribution");
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
    <div className="space-y-2">
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
          {schema.bands.map((b, i) => (
            <path key={`be${i}`} d={b.d} fill="none" stroke={insulationStyle.edge} strokeWidth={b.width} strokeDasharray="1.2 2.2" />
          ))}
          {schema.bands.map((b, i) => (
            <path key={`bf${i}`} d={b.d} fill="none" stroke={insulationStyle.fill} strokeWidth={b.width - 2.4} />
          ))}
          {schema.lines.map((l, i) => (
            <path
              key={i}
              d={l.d}
              fill="none"
              stroke={lineColors[l.kind]}
              strokeWidth={l.nodeId && l.nodeId === selected ? 3.4 : 1.6}
              strokeDasharray={l.kind === "rl" ? "6 3" : undefined}
              className={l.nodeId ? "cursor-pointer" : undefined}
              onClick={l.nodeId ? () => onSelect(l.nodeId!) : undefined}
            />
          ))}
          {schema.groups.map((g, i) => (
            <g key={i} className={g.nodeId ? "cursor-pointer" : undefined} onClick={g.nodeId ? () => onSelect(g.nodeId!) : undefined}>
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
    </div>
  );
}
