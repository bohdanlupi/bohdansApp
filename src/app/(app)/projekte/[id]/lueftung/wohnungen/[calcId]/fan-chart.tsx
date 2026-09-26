import { chartTicks, type DeviceChartData } from "@/lib/kwl/device-chart";
import { formatNumber } from "@/lib/number-input";

const W = 520;
const H = 320;
const pad = { left: 46, right: 12, top: 12, bottom: 34 };

export type DeviceChartLabels = {
  flow: string;
  pressure: string;
  maxCurve: string;
  measurements: string;
  stages: string;
  system: string;
  operating: string;
  nominalFlow: string;
  systemPending: string;
};

/**
 * Device diagram of one side: maximum external pressure (datasheet), measurement points, fan stages, nominal flow;
 * with a pressure drop calculation also the system curve and the operating point.
 */
export function DeviceChart({ chart, title, labels }: { chart: DeviceChartData; title: string; labels: DeviceChartLabels }) {
  const x = (v: number) => pad.left + (v / chart.xMax) * (W - pad.left - pad.right);
  const y = (p: number) => H - pad.bottom - (p / chart.yMax) * (H - pad.top - pad.bottom);
  const path = (points: [number, number][]) => points.map(([v, p], i) => `${i ? "L" : "M"}${x(v).toFixed(1)},${y(p).toFixed(1)}`).join("");

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
        <text x={10} y={(pad.top + H - pad.bottom) / 2} textAnchor="middle" transform={`rotate(-90 10 ${(pad.top + H - pad.bottom) / 2})`} className="fill-muted-foreground text-[10px]">
          {labels.pressure}
        </text>

        {/* Fan stages (device alone) */}
        {chart.stages.map((s) => (
          <g key={s.stage}>
            <path d={path(s.points)} fill="none" className={s.stage === chart.nominalStage && chart.system ? "stroke-brand" : "stroke-muted-foreground/45"} strokeWidth={s.stage === chart.nominalStage && chart.system ? 1.8 : 1} />
            {s.points.length > 0 && (
              <text x={x(s.points[0][0]) + 3} y={y(s.points[0][1]) - 3} className="fill-muted-foreground text-[9px]">
                {s.stage}
              </text>
            )}
          </g>
        ))}

        {/* Maximum external pressure (datasheet) and measurement points */}
        <path d={path(chart.maxCurve)} fill="none" className="stroke-foreground" strokeWidth={2.2} />
        {chart.measurements.map((m, i) =>
          m.qv <= chart.xMax && m.pst <= chart.yMax ? <rect key={i} x={x(m.qv) - 2.5} y={y(m.pst) - 2.5} width={5} height={5} className="fill-background stroke-foreground" strokeWidth={1} /> : null,
        )}

        {/* Nominal flow */}
        {chart.flow > 0 && chart.flow <= chart.xMax && <line x1={x(chart.flow)} x2={x(chart.flow)} y1={pad.top} y2={H - pad.bottom} className="stroke-muted-foreground" strokeDasharray="2 3" />}

        {/* System curve and operating point (after the pressure drop calculation) */}
        {chart.system && <path d={path(chart.system)} fill="none" className="stroke-destructive" strokeWidth={2} strokeDasharray="6 3" />}
        {chart.stagePoints.map((p) => (
          <circle key={p.stage} cx={x(p.flow)} cy={y(p.pressure)} r={p.stage === chart.nominalStage ? 3.5 : 2.2} className={p.stage === chart.nominalStage ? "fill-brand" : "fill-foreground/60"} />
        ))}
        {chart.operating && (
          <g>
            <circle cx={x(chart.operating.flow)} cy={y(chart.operating.pressure)} r={5} className="fill-destructive" />
            <text x={x(chart.operating.flow) + 8} y={y(chart.operating.pressure) - 6} className="fill-destructive stroke-background text-[10px] font-semibold tabular-nums" strokeWidth={3} paintOrder="stroke">
              {formatNumber(chart.operating.flow, 0)} m³/h · {formatNumber(chart.operating.pressure, 0)} Pa
            </text>
          </g>
        )}
      </svg>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-5 border-t-2 border-foreground" /> {labels.maxCurve}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block size-2 border border-foreground" /> {labels.measurements}
        </li>
        {chart.stages.length > 0 && (
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-0 w-5 border-t border-muted-foreground/60" /> {labels.stages}
          </li>
        )}
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-0 border-l border-dashed border-muted-foreground" /> {labels.nominalFlow}
        </li>
        {chart.system ? (
          <>
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-0 w-5 border-t-2 border-dashed border-destructive" /> {labels.system}
            </li>
            <li className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full bg-destructive" /> {labels.operating}
            </li>
          </>
        ) : (
          <li>{labels.systemPending}</li>
        )}
      </ul>
    </figure>
  );
}
