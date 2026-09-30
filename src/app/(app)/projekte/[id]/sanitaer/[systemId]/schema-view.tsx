"use client";

import { mediumColors, type SanitarySchema } from "@/lib/sanitary/schema";

import { SvgPrims } from "../../lueftung/anlagen/[systemId]/schema-view";

/** Prinzipschema (Strangschema) in the editor; clicking a line or symbol selects its element. */
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
  return (
    <svg viewBox={`0 0 ${schema.width} ${schema.height}`} className="w-full text-foreground" style={{ minWidth: Math.min(schema.width, 1000) }} role="img" aria-label={label}>
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
  );
}
