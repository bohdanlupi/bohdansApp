import { fanChart, type SideResult } from "@/lib/kwl/calc";
import type { KwlDevice } from "@/lib/kwl/devices";
import { formatNumber } from "@/lib/number-input";

const W = 460;
const H = 300;
const pad = { left: 44, right: 12, top: 12, bottom: 34 };

/** Fan curves of all stages, system curve through the nominal point and the operating points. */
export function FanChart({
  device,
  side,
  title,
  flowLabel,
  pressureLabel,
  systemLabel,
}: {
  device: KwlDevice;
  side: SideResult | null;
  title: string;
  flowLabel: string;
  pressureLabel: string;
  systemLabel: string;
}) {
  const { curves, system } = fanChart(device, side);
  const x = (v: number) => pad.left + (v / device.xMax) * (W - pad.left - pad.right);
  const y = (p: number) => H - pad.bottom - (p / device.yMax) * (H - pad.top - pad.bottom);
  const path = (points: [number, number][]) => points.map(([v, p], i) => `${i ? "L" : "M"}${x(v).toFixed(1)},${y(p).toFixed(1)}`).join("");
  const xTicks = ticks(device.xMax);
  const yTicks = ticks(device.yMax);
  const nominal = side?.nominalStage?.stage;

  return (
    <figure className="space-y-1">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl text-foreground" role="img" aria-label={title}>
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
            <text x={pad.left - 6} y={y(t) + 3.5} textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
              {formatNumber(t, 0)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line x1={x(t)} x2={x(t)} y1={pad.top} y2={H - pad.bottom} className="stroke-border" strokeWidth={1} />
            <text x={x(t)} y={H - pad.bottom + 13} textAnchor="middle" className="fill-muted-foreground text-[10px] tabular-nums">
              {formatNumber(t, 0)}
            </text>
          </g>
        ))}
        <text x={(pad.left + W - pad.right) / 2} y={H - 4} textAnchor="middle" className="fill-muted-foreground text-[10px]">
          {flowLabel}
        </text>
        <text x={10} y={(pad.top + H - pad.bottom) / 2} textAnchor="middle" transform={`rotate(-90 10 ${(pad.top + H - pad.bottom) / 2})`} className="fill-muted-foreground text-[10px]">
          {pressureLabel}
        </text>

        {curves.map((c) => (
          <g key={c.stage}>
            <path
              d={path(c.points)}
              fill="none"
              className={c.stage === nominal ? "stroke-brand" : "stroke-muted-foreground/60"}
              strokeWidth={c.stage === nominal ? 2.2 : 1.2}
            />
            {c.points.length > 0 && (
              <text x={x(c.points[0][0]) + 3} y={y(c.points[0][1]) - 3} className="fill-muted-foreground text-[9px]">
                {c.stage}
              </text>
            )}
          </g>
        ))}

        {system.length > 1 && <path d={path(system)} fill="none" className="stroke-destructive" strokeWidth={1.8} strokeDasharray="5 3" />}
        {side?.points.map((p) =>
          p.flow > 0 && p.flow <= device.xMax && p.pressure <= device.yMax ? (
            <circle key={p.stage} cx={x(p.flow)} cy={y(p.pressure)} r={p.stage === nominal ? 4 : 2.5} className={p.stage === nominal ? "fill-brand" : "fill-foreground/70"} />
          ) : null,
        )}
        {side && (
          <g>
            <line x1={x(side.nominalFlow)} x2={x(side.nominalFlow)} y1={pad.top} y2={H - pad.bottom} className="stroke-destructive/50" strokeDasharray="2 3" />
          </g>
        )}
      </svg>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-block h-0 w-5 border-t-2 border-dashed border-destructive" /> {systemLabel}
      </p>
    </figure>
  );
}

/** About 5–8 round tick values from 0 to max. */
export function ticks(max: number): number[] {
  const raw = max / 6;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10;
  const result: number[] = [];
  for (let t = 0; t <= max + 1e-9; t += step) result.push(Math.round(t));
  return result;
}
