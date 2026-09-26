import { chartTicks, curveColors, type DeviceChartData } from "@/lib/kwl/device-chart";
import type { OperatingPoint } from "@/lib/kwl/device-operation";
import { formatNumber } from "@/lib/number-input";

const W = 560;
const H = 360;
const pad = { left: 48, right: 14, top: 14, bottom: 36 };

export type DeviceChartLabels = {
  flow: string;
  pressure: string;
  limit: string;
  measurements: string;
  system: string;
  normal: string;
  minimum: string;
  party: string;
  normalShort: string;
  minimumShort: string;
  partyShort: string;
  stagePoints: string;
  systemPending: string;
};

/**
 * Kennlinien diagram of one side (like the workbook): fan Kennlinien of the Zehnder datasheet, pressure limit,
 * measurement points; with the pressure drop calculation the Anlagenkennlinie and its crossings.
 */
export function DeviceChart({ chart, title, labels }: { chart: DeviceChartData; title: string; labels: DeviceChartLabels }) {
  const x = (v: number) => pad.left + (v / chart.xMax) * (W - pad.left - pad.right);
  const y = (p: number) => H - pad.bottom - (p / chart.yMax) * (H - pad.top - pad.bottom);
  const path = (points: [number, number][]) => points.map(([v, p], i) => `${i ? "L" : "M"}${x(v).toFixed(1)},${y(p).toFixed(1)}`).join("");
  const stages = chart.control === "stages";
  const marker = (p: OperatingPoint | null, label: string, className: string, dy: number) =>
    p ? (
      <g>
        <circle cx={x(p.flow)} cy={y(p.pressure)} r={5.5} className={className} />
        <text x={x(p.flow) < W * 0.45 ? x(p.flow) + 9 : x(p.flow) - 9} y={y(p.pressure) + dy} textAnchor={x(p.flow) < W * 0.45 ? "start" : "end"} className="fill-foreground stroke-background text-[10px] font-semibold tabular-nums" strokeWidth={3} paintOrder="stroke">
          {label}
        </text>
      </g>
    ) : null;

  return (
    <figure className="space-y-1">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-2xl text-foreground" role="img" aria-label={title}>
        {chartTicks(chart.yMax).map((t) => (
          <g key={`y${t}`}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
            <text x={pad.left - 6} y={y(t) + 3.5} textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
              {formatNumber(t, 0)}
            </text>
          </g>
        ))}
        {chartTicks(chart.xMax).map((t) => (
          <g key={`x${t}`}>
            <line x1={x(t)} x2={x(t)} y1={pad.top} y2={H - pad.bottom} className="stroke-border" strokeWidth={1} />
            <text x={x(t)} y={H - pad.bottom + 13} textAnchor="middle" className="fill-muted-foreground text-[10px] tabular-nums">
              {formatNumber(t, 0)}
            </text>
          </g>
        ))}
        <text x={(pad.left + W - pad.right) / 2} y={H - 4} textAnchor="middle" className="fill-muted-foreground text-[10px]">
          {labels.flow}
        </text>
        <text x={11} y={(pad.top + H - pad.bottom) / 2} textAnchor="middle" transform={`rotate(-90 11 ${(pad.top + H - pad.bottom) / 2})`} className="fill-muted-foreground text-[10px]">
          {labels.pressure}
        </text>

        {/* Fan Kennlinien per stage / speed (Zehnder datasheet) */}
        {chart.curves.map((c, i) => (
          <g key={c.label}>
            <path d={path(c.points)} fill="none" stroke={curveColors[i % curveColors.length]} strokeWidth={i === 0 ? 2.2 : 1.5} />
            {c.points.length > 0 && (
              <text x={x(c.points[0][0]) + 4} y={y(c.points[0][1]) - 3} fill={curveColors[i % curveColors.length]} className="text-[9px] font-medium">
                {c.label}
              </text>
            )}
          </g>
        ))}
        {/* Pressure limit of the constant-volume control */}
        {!stages && <path d={path(chart.limit)} fill="none" className="stroke-foreground" strokeWidth={2.2} />}
        {chart.measurements.map((m, i) =>
          m.qv <= chart.xMax && m.pst <= chart.yMax ? <rect key={i} x={x(m.qv) - 2.5} y={y(m.pst) - 2.5} width={5} height={5} className="fill-background stroke-muted-foreground" strokeWidth={1} /> : null,
        )}

        {/* Nominal and minimum flow */}
        {[chart.nominalFlow, chart.minFlow].map((q, i) =>
          q > 0 && q <= chart.xMax ? <line key={i} x1={x(q)} x2={x(q)} y1={pad.top} y2={H - pad.bottom} className="stroke-muted-foreground/70" strokeDasharray={i ? "1 3" : "3 3"} /> : null,
        )}

        {/* Anlagenkennlinie and crossings (after the pressure drop calculation) */}
        {chart.system && <path d={path(chart.system)} fill="none" className="stroke-destructive" strokeWidth={2} strokeDasharray="7 4" />}
        {chart.stagePoints.map((p, i) => (
          <circle key={p.curve ?? i} cx={x(p.flow)} cy={y(p.pressure)} r={3} fill={curveColors[chart.curves.findIndex((c) => c.label === p.curve) % curveColors.length] ?? "currentColor"} />
        ))}
        {marker(chart.minimum, labels.minimumShort, "fill-emerald-600", 18)}
        {marker(chart.normal, labels.normalShort, "fill-brand", -9)}
        {marker(chart.party, labels.partyShort, "fill-destructive", -9)}
      </svg>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {!stages && (
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-0 w-5 border-t-2 border-foreground" /> {labels.limit}
          </li>
        )}
        <li className="flex items-center gap-1.5">
          <span className="inline-block size-2 border border-muted-foreground" /> {labels.measurements}
        </li>
        {chart.system ? (
          <>
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-0 w-5 border-t-2 border-dashed border-destructive" /> {labels.system}
            </li>
            {stages && (
              <li className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full bg-muted-foreground" /> {labels.stagePoints}
              </li>
            )}
            <li className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full bg-brand" /> {labels.normal}
            </li>
            <li className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full bg-emerald-600" /> {labels.minimum}
            </li>
            <li className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full bg-destructive" /> {labels.party}
            </li>
          </>
        ) : (
          <li>{labels.systemPending}</li>
        )}
      </ul>
    </figure>
  );
}
