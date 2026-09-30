"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { mediumColors, type SanitarySchema } from "@/lib/sanitary/schema";

import { SvgPrims } from "../../lueftung/anlagen/[systemId]/schema-view";

/**
 * Pixels per schema unit: the element names (8 units) come out at 14 px like the text of the page, the smaller
 * sizes and lengths (7 units) at about 12 px.
 */
const SCALE = 1.75;
/** Height of the visible window [px]. */
const VIEW_HEIGHT = 560;

/**
 * Prinzipschema (Strangschema) in the editor, drawn at a fixed readable size in a window; the slider below moves the
 * view sideways, the one on the right up and down. Clicking a line or symbol selects its element.
 */
export function SanitarySchemaView({
  schema,
  selected,
  label,
  onSelect,
}: {
  schema: SanitarySchema;
  selected: string | null;
  label: string;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("sanitary");
  const frame = useRef<HTMLDivElement>(null);
  const [viewWidth, setViewWidth] = useState(0);
  const width = schema.width * SCALE;
  const height = schema.height * SCALE;
  const viewHeight = Math.min(VIEW_HEIGHT, height);
  const maxX = Math.max(0, width - viewWidth);
  const maxY = Math.max(0, height - viewHeight);
  const [x, setX] = useState(0);
  // Start at the bottom: the Zentrale and the Verteilleitung.
  const [y, setY] = useState(Number.POSITIVE_INFINITY);
  const posX = Math.min(x, maxX);
  const posY = Math.min(y, maxY);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setViewWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
      <div ref={frame} className="relative overflow-hidden rounded-lg border bg-background" style={{ height: viewHeight }}>
        <svg
          viewBox={`0 0 ${schema.width} ${schema.height}`}
          width={width}
          height={height}
          className="absolute top-0 left-0 max-w-none text-foreground"
          style={{ transform: `translate(${-posX}px, ${-posY}px)` }}
          role="img"
          aria-label={label}
        >
          {schema.bands.map((b, i) => (
            <path key={`be${i}`} d={b.d} fill="none" stroke={b.edge} strokeWidth={b.width} strokeDasharray="1.2 2.2" />
          ))}
          {schema.bands.map((b, i) => (
            <path key={`bf${i}`} d={b.d} fill="none" stroke={b.fill} strokeWidth={b.width - 2.4} />
          ))}
          {schema.lines.map((l, i) => (
            <path
              key={i}
              d={l.d}
              fill="none"
              stroke={mediumColors[l.medium]}
              strokeWidth={l.nodeId && l.nodeId === selected ? 3.4 : 1.6}
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
      {/* Vertical slider: top of the range = top of the schema. */}
      <input
        type="range"
        min={0}
        max={Math.round(maxY)}
        value={Math.round(posY)}
        disabled={maxY <= 0}
        onChange={(e) => setY(Number(e.target.value))}
        aria-label={t("moveVertical")}
        className="w-4 accent-brand disabled:opacity-40"
        style={{ writingMode: "vertical-lr", height: viewHeight }}
      />
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
