"use client";

import { ZoomIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { mediumColors, type SanitarySchema } from "@/lib/sanitary/schema";

import { SvgPrims } from "../../lueftung/anlagen/[systemId]/schema-view";

const ZOOM_MIN = 100;
const ZOOM_MAX = 400;

/**
 * Prinzipschema (Strangschema) in the editor; clicking a line or symbol selects its element. The slider enlarges the
 * drawing (and its texts) beyond the width of the panel; the panel then scrolls.
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
  const [zoom, setZoom] = useState(ZOOM_MIN);
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <ZoomIn className="size-4" />
        <span>{t("zoom")}</span>
        <input
          type="range"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={10}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-48 accent-brand"
          aria-label={t("zoom")}
        />
        <span className="w-10 tabular-nums">{zoom} %</span>
      </label>
      <div className="max-h-[75vh] overflow-auto">
        <svg
          viewBox={`0 0 ${schema.width} ${schema.height}`}
          className="text-foreground"
          style={{ width: `${zoom}%`, minWidth: Math.min(schema.width, 1000) * (zoom / 100) }}
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
    </div>
  );
}
