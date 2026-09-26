"use client";

import { findProduct, measuredCoverPrefix } from "@/lib/kwl/products";
import type { NetNode } from "@/lib/kwl/network";
import { type AirKind, airColors, type SchemaLayout } from "@/lib/kwl/schema-layout";
import { formatNumber } from "@/lib/number-input";

/**
 * Prinzipschema with symbols after SIA 410 (3.2 terminals, 3.3 air treatment, 3.4 fans) and the colour code
 * of the LUPI scheme: outdoor air green, supply air red, extract air amber, exhaust air blue.
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
  labels: { device: string; deviceLines?: string[]; outdoor: string; supply: string; extract: string; exhaust: string };
  onSelect: (id: string) => void;
}) {
  const { width, height, device } = layout;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full text-foreground" style={{ minWidth: Math.min(width, 900) }} role="img" aria-label={labels.device}>
      <defs>
        {(Object.keys(airColors) as AirKind[]).map((air) => (
          <marker key={air} id={`arrow-${air}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={airColors[air]} />
          </marker>
        ))}
        <pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" className="stroke-foreground" strokeWidth="1" />
        </pattern>
      </defs>

      {/* Storey bands of the terminals */}
      {layout.floors.map((f, i) => (
        <g key={`${f.air}-${f.floor}-${i}`}>
          <rect x={width - 60} y={f.y0} width={56} height={Math.max(f.y1 - f.y0, 10)} rx={3} className="fill-muted/50" />
          <text x={width - 32} y={(f.y0 + f.y1) / 2 + 4} textAnchor="middle" className="fill-muted-foreground text-[11px] font-medium">
            {f.floor || "–"}
          </text>
        </g>
      ))}

      {/* Ducts */}
      {layout.edges.map((e, i) => {
        const midX = e.from.x + (e.to.x - e.from.x) / 2;
        const d = e.from.y === e.to.y ? `M${e.from.x},${e.from.y} H${e.to.x}` : `M${e.from.x},${e.from.y} H${midX} V${e.to.y} H${e.to.x}`;
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={airColors[e.air]}
            strokeWidth={highlight.has(e.nodeId) ? 3.2 : 1.8}
            className="cursor-pointer"
            onClick={() => onSelect(e.nodeId)}
          />
        );
      })}

      {/* Device: heat recovery (SIA 410 3.3.18) and two fans (3.4.1) */}
      <g>
        <rect x={device.x} y={device.y} width={device.w} height={device.h} rx={4} className="fill-background stroke-foreground" strokeWidth={1.5} />
        <text x={device.x + device.w / 2} y={device.y + 14} textAnchor="middle" className="fill-foreground text-[11px] font-semibold">
          {labels.device}
        </text>
        {(labels.deviceLines ?? []).map((line, i) => (
          <text key={line} x={device.x + device.w / 2} y={device.y + device.h + 12 + i * 11} textAnchor="middle" className="fill-muted-foreground text-[9px]">
            + {line}
          </text>
        ))}
        <g transform={`translate(${device.x + device.w / 2 - 18}, ${device.y + device.h / 2 - 18})`}>
          <rect width={36} height={36} className="fill-none stroke-foreground" strokeWidth={1.3} />
          <line x1={0} y1={0} x2={36} y2={36} className="stroke-foreground" strokeWidth={1.3} />
          <line x1={36} y1={0} x2={0} y2={36} className="stroke-foreground" strokeWidth={1.3} />
        </g>
        {[device.y + 34, device.y + device.h - 34].map((y, i) => (
          <g key={i} transform={`translate(${device.x + device.w - 22}, ${y})`}>
            <circle r={10} className="fill-background stroke-foreground" strokeWidth={1.3} />
            <path d={i === 0 ? "M-5,-6 L7,0 L-5,6 Z" : "M5,-6 L-7,0 L5,6 Z"} className="fill-none stroke-foreground" strokeWidth={1.1} />
          </g>
        ))}
        <text x={device.x - 4} y={layout.airY.supply + 14} textAnchor="end" className="text-[10px] font-semibold" fill={airColors.outdoor}>
          {labels.outdoor}
        </text>
        <text x={device.x - 4} y={layout.airY.extract + 14} textAnchor="end" className="text-[10px] font-semibold" fill={airColors.exhaust}>
          {labels.exhaust}
        </text>
        <text x={device.x + device.w + 4} y={layout.airY.supply + 14} className="text-[10px] font-semibold" fill={airColors.supply}>
          {labels.supply}
        </text>
        <text x={device.x + device.w + 4} y={layout.airY.extract + 14} className="text-[10px] font-semibold" fill={airColors.extract}>
          {labels.extract}
        </text>
      </g>

      {/* Elements */}
      {layout.nodes.map(({ node, air, x, y }) => (
        <g key={node.id} className="cursor-pointer" onClick={() => onSelect(node.id)}>
          <NodeSymbol node={node} air={air} x={x} y={y} selected={selected === node.id} />
          {node.type !== "terminal" && (
            <text x={x} y={y - 12} textAnchor="middle" className="fill-muted-foreground text-[9px]">
              {nodeInfo(node)}
            </text>
          )}
        </g>
      ))}

      {/* Terminal labels (room) */}
      {layout.labels.map((l) => {
        const node = layout.nodes.find((n) => n.node.id === l.nodeId)?.node;
        const parts = node ? terminalParts(node) : "";
        return (
          <g key={l.nodeId} className="cursor-pointer" onClick={() => onSelect(l.nodeId)}>
            <text x={l.x} y={l.y + 4} className="fill-foreground text-[11px]">
              {l.text}
            </text>
            {parts && (
              <text x={l.x} y={l.y + 15} className="fill-muted-foreground text-[8.5px]">
                {parts}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function NodeSymbol({ node, air, x, y, selected }: { node: NetNode; air: AirKind; x: number; y: number; selected: boolean }) {
  const color = airColors[air];
  const kind = findProduct(node.product)?.kind;
  const ring = selected ? <circle cx={x} cy={y} r={15} fill="none" stroke="currentColor" strokeDasharray="3 2" className="text-brand" strokeWidth={1.5} /> : null;
  const box = (w: number, h: number, extra?: React.ReactNode) => (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} className="fill-background stroke-foreground" strokeWidth={1.2} />
      {extra}
      {ring}
    </g>
  );

  switch (node.type) {
    case "duct":
      return (
        <g>
          <line x1={x - 3} y1={y - 5} x2={x + 3} y2={y + 5} stroke={color} strokeWidth={1.5} />
          <circle cx={x} cy={y} r={6} fill="transparent" />
          {ring}
        </g>
      );
    case "bend":
      return (
        <g>
          <path d={`M${x - 6},${y} A6,6 0 0 1 ${x},${y - 6}`} fill="none" stroke={color} strokeWidth={2} />
          {ring}
        </g>
      );
    case "tee":
      return (
        <g>
          <circle cx={x} cy={y} r={3.5} fill={color} />
          {ring}
        </g>
      );
    case "distributor":
      // Flow distributor (SIA 410 3.3.19)
      return box(
        16,
        30,
        [0, 1, 2, 3].map((i) => <line key={i} x1={x - 8} x2={x + 8} y1={y - 9 + i * 6} y2={y - 9 + i * 6} className="stroke-foreground" strokeWidth={0.8} />),
      );
    case "terminal": {
      // Supply outlet / extract inlet grille (SIA 410 3.2.1 / 3.2.2)
      const out = air === "supply";
      return (
        <g>
          <line x1={x - 2} x2={x - 2} y1={y - 8} y2={y + 8} className="stroke-foreground" strokeWidth={2} />
          <line x1={out ? x : x + 16} y1={y} x2={out ? x + 16 : x + 1} y2={y} stroke={color} strokeWidth={1.6} markerEnd={`url(#arrow-${air})`} />
          {ring}
        </g>
      );
    }
    default: {
      if (kind === "silencer")
        return box(
          14,
          28,
          [1, 2].map((i) => <line key={i} x1={x - 7} x2={x + 7} y1={y - 14 + i * 9.33} y2={y - 14 + i * 9.33} className="stroke-foreground" strokeWidth={0.8} />),
        );
      if (kind === "filter")
        return box(12, 28, <path d={`M${x - 6},${y - 14} L${x + 6},${y} L${x - 6},${y + 14}`} fill="none" className="stroke-foreground" strokeWidth={0.9} />);
      if (kind === "grille" && (air === "outdoor" || air === "exhaust"))
        return box(12, 28, <rect x={x - 6} y={y - 14} width={12} height={28} fill="url(#hatch)" />);
      if (kind === "valve" || kind === "terminal")
        return box(22, 10, <circle cx={x} cy={y} r={2} className="fill-foreground" />);
      if (air === "outdoor" || air === "exhaust")
        return box(12, 28, <rect x={x - 6} y={y - 14} width={12} height={28} fill="url(#hatch)" />);
      return box(16, 16);
    }
  }
}

export const shortInfo = (flow: number | undefined, dp: number | undefined) =>
  flow === undefined ? "" : `${formatNumber(flow, 0)} m³/h · ${formatNumber(dp ?? 0, 1, false)} Pa`;

/** Short «Auslass + Abdeckung» text for a terminal, e.g. «CLD breit + Roma breit». */
function terminalParts(node: NetNode): string {
  if (node.type !== "terminal") return "";
  const casing = findProduct(node.product);
  const short = (name: string) =>
    name
      .replace(/^Comfo(Case|Grid|Valve)\s+/, "")
      .replace(/\s+für ComfoCase .*$/, "")
      .replace(/\s*\(.*\)$/, "");
  const caseName = casing ? short(casing.family ?? casing.name) : "";
  const cover = node.cover?.startsWith(measuredCoverPrefix) ? node.cover.slice(measuredCoverPrefix.length) : (findProduct(node.cover)?.name ?? "");
  return [caseName, cover && short(cover)].filter(Boolean).join(" + ");
}
