"use client";

import type { NetNode } from "@/lib/kwl/network";
import type { DuctMaterial } from "@/lib/kwl/pressure";
import { measuredCoverPrefix } from "@/lib/kwl/products";
import { airColors, edgePath, type SchemaLayout } from "@/lib/kwl/schema-layout";
import { type DeviceExtras, deviceSymbols, elementLabel, insulationBands, nodeSymbol, type Paint, type Prim, terminalParts } from "@/lib/kwl/schema-symbols";
import { formatNumber } from "@/lib/number-input";

const paint = (p: Paint | undefined) =>
  p === undefined ? undefined : p === "ink" ? "currentColor" : p === "bg" ? "var(--background)" : p === "muted" ? "var(--muted-foreground)" : p;

/** Drawing primitives (schema-symbols.ts) as SVG. */
export function SvgPrims({ prims }: { prims: Prim[] }) {
  return (
    <>
      {prims.map((p, i) => {
        switch (p.t) {
          case "rect":
            return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={p.rx} fill={paint(p.fill)} stroke={paint(p.stroke)} strokeWidth={p.sw} />;
          case "line":
            return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={paint(p.stroke)} strokeWidth={p.sw} strokeDasharray={p.dash} />;
          case "circle":
            return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={paint(p.fill)} stroke={paint(p.stroke)} strokeWidth={p.sw} />;
          case "path":
            return <path key={i} d={p.d} fill={paint(p.fill)} stroke={paint(p.stroke)} strokeWidth={p.sw} strokeDasharray={p.dash} />;
          case "polygon":
            return <polygon key={i} points={p.points} fill={paint(p.fill)} stroke={paint(p.stroke)} strokeWidth={p.sw} />;
          case "text":
            return (
              <text key={i} x={p.x} y={p.y} textAnchor={p.anchor ?? "start"} fill={paint(p.fill)} fontSize={p.size} fontWeight={p.bold ? 600 : 400}>
                {p.text}
              </text>
            );
        }
      })}
    </>
  );
}

/**
 * Prinzipschema with symbols after SIA 410 (schema-symbols.ts) and the colour code of the LUPI scheme: outdoor air
 * green, supply air red, extract air amber, exhaust air blue. Labels sit above the symbols, never on them.
 */
export function SchemaView({
  layout,
  selected,
  highlight,
  nodeInfo,
  labels,
  onSelect,
}: {
  layout: SchemaLayout;
  selected: string | null;
  /** Node ids on the critical paths. */
  highlight: Set<string>;
  /** Short text shown next to a node, e.g. "34 m³/h · 12 Pa". */
  nodeInfo: (node: NetNode) => string;
  labels: {
    device: string;
    deviceLines?: string[];
    attachments?: DeviceExtras;
    /** Short air types inside the unit (AUL, ZUL, ABL, FOL). */
    outdoor: string;
    supply: string;
    extract: string;
    exhaust: string;
    /** Material name of ducts without product. */
    material: (m: DuctMaterial) => string;
  };
  onSelect: (id: string) => void;
}) {
  const { width, height, device, airY } = layout;
  const bands = insulationBands(layout);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full text-foreground" style={{ minWidth: Math.min(width, 900) }} role="img" aria-label={labels.device}>
      {/* Storey bands of the terminals */}
      {layout.floors.map((f, i) => (
        <g key={`${f.air}-${f.floor}-${i}`}>
          <rect x={width - 60} y={f.y0} width={56} height={Math.max(f.y1 - f.y0, 10)} rx={3} className="fill-muted/50" />
          <text x={width - 32} y={(f.y0 + f.y1) / 2 + 4} textAnchor="middle" className="fill-muted-foreground text-[11px] font-medium">
            {f.floor || "–"}
          </text>
        </g>
      ))}

      {/* Insulation: highlighter band with dotted edges behind the ducts */}
      {bands.edges.map((b, i) => (
        <path key={`ie${i}`} d={b.d} fill="none" stroke={b.stroke} strokeWidth={b.width} strokeDasharray={b.dash} />
      ))}
      {bands.fills.map((b, i) => (
        <path key={`if${i}`} d={b.d} fill="none" stroke={b.stroke} strokeWidth={b.width} />
      ))}

      {/* Ducts */}
      {layout.edges.map((e, i) => (
        <path
          key={i}
          d={edgePath(e)}
          fill="none"
          stroke={airColors[e.air]}
          strokeWidth={highlight.has(e.nodeId) ? 3.2 : 1.8}
          className="cursor-pointer"
          onClick={() => onSelect(e.nodeId)}
        />
      ))}

      {/* Unit (heat recovery, fans, attachments) and the air types below the lines, inside the unit */}
      <SvgPrims prims={deviceSymbols(layout, labels.device, labels.deviceLines ?? [], labels.attachments ?? { fond: false, clime: false })} />
      {(
        [
          [device.x + 6, airY.supply, "start", labels.outdoor, airColors.outdoor],
          [device.x + 6, airY.extract, "start", labels.exhaust, airColors.exhaust],
          [device.x + device.w - 6, airY.supply, "end", labels.supply, airColors.supply],
          [device.x + device.w - 6, airY.extract, "end", labels.extract, airColors.extract],
        ] as const
      ).map(([x, y, anchor, text, color]) => (
        <text key={text} x={x} y={y + 28} textAnchor={anchor} className="text-[10px] font-semibold" fill={color}>
          {text}
        </text>
      ))}

      {/* Elements with their flow / pressure drop above the symbol */}
      {layout.nodes.map(({ node, air, x, y }) => {
        const { prims, top } = nodeSymbol(node, air, x, y);
        const label = elementLabel(node, labels.material);
        return (
          <g key={node.id} className="cursor-pointer" onClick={() => onSelect(node.id)}>
            <circle cx={x} cy={y} r={Math.max(top, 9) + 3} fill="transparent" />
            <SvgPrims prims={prims} />
            {selected === node.id && <circle cx={x} cy={y} r={Math.max(top, 9) + 4} fill="none" strokeDasharray="3 2" className="stroke-brand" strokeWidth={1.5} />}
            {label && (
              <text x={x} y={y - top - 15} textAnchor="middle" className="fill-foreground text-[9px] font-medium">
                {label}
              </text>
            )}
            {node.type !== "terminal" && (
              <text x={x} y={y - top - 5} textAnchor="middle" className="fill-muted-foreground text-[9px]">
                {nodeInfo(node)}
              </text>
            )}
          </g>
        );
      })}

      {/* Rooms: name, «Auslass + cover» and flow / pressure drop */}
      {layout.labels.map((l) => {
        const node = layout.nodes.find((n) => n.node.id === l.nodeId)?.node;
        const detail = node ? [terminalParts(node, measuredCoverPrefix), nodeInfo(node)].filter(Boolean).join(" · ") : "";
        return (
          <g key={l.nodeId} className="cursor-pointer" onClick={() => onSelect(l.nodeId)}>
            <text x={l.x} y={l.y + 1} className="fill-foreground text-[11px]">
              {l.text}
            </text>
            {detail && (
              <text x={l.x} y={l.y + 13} className="fill-muted-foreground text-[8.5px]">
                {detail}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export const shortInfo = (flow: number | undefined, dp: number | undefined) =>
  flow === undefined ? "" : `${formatNumber(flow, 0)} m³/h · ${formatNumber(dp ?? 0, 1, false)} Pa`;
