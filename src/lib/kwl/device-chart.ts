// Data of the device diagram (external pressure over air flow) per side: the datasheet's maximum external pressure
// line (with ComfoClime: the 100 % curve of the combination), the measurement points, the fan stage curves where
// available and – once the pressure drop calculation is done – the system curve Δp = k·q² with the operating point.

import { attachmentEffects, type DeviceOptions } from "./attachments";
import { fanPressure, type SideResult } from "./calc";
import type { KwlDevice } from "./devices";
import { curveValue, datasheetDevice } from "./products";

type Points = [number, number][];

export type DeviceChartData = {
  xMax: number;
  yMax: number;
  /** Maximum external pressure of the device (datasheet), with ComfoClime limited by the combination's curve. */
  maxCurve: Points;
  /** Measurement points of the datasheet table (external pressure, power). */
  measurements: { qv: number; pst: number; powerW: number }[];
  /** Fan stage curves (for the device alone), highest stage first. */
  stages: { stage: number; points: Points }[];
  nominalStage: number | null;
  /** Nominal air flow of the dwelling / system. */
  flow: number;
  /** System curve through the operating point – only with a pressure drop calculation. */
  system: Points | null;
  operating: { flow: number; pressure: number } | null;
  /** Operating points of the stages on the system curve (only with the system curve). */
  stagePoints: { stage: number; flow: number; pressure: number }[];
};

const niceMax = (v: number) => {
  if (!(v > 0)) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(v));
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * magnitude).find((m) => m >= v) ?? v;
};

export function deviceChart({
  deviceKey,
  options,
  side,
  flow,
  dp,
  withSystem,
  stageDevice,
  stageSide,
}: {
  deviceKey: string | null;
  options: DeviceOptions;
  side: "supply" | "extract";
  /** Nominal flow of the side [m³/h]. */
  flow: number;
  /** External pressure the device has to deliver on this side [Pa] (supply incl. ComfoFond). */
  dp: number | null;
  withSystem: boolean;
  stageDevice: KwlDevice | null;
  stageSide: SideResult | null;
}): DeviceChartData | null {
  const product = datasheetDevice(deviceKey);
  const d = product?.device;
  if (!d) return null;
  const effects = attachmentEffects(product.key, options, flow);
  const lastFlow = d.maxExternalCurve.at(-1)?.[0] ?? d.maxFlow ?? flow;
  const xMax = niceMax(Math.max(lastFlow, d.maxFlow ?? 0, flow) * 1.08);

  // Maximum external pressure, sampled so the ComfoClime limit can be applied (curveValue gives 0 at q = 0, so the
  // first point is taken from the curve itself).
  const firstFlow = d.maxExternalCurve[0]?.[0] ?? 0;
  const maxCurve: Points = [];
  for (let i = 0; i <= 40; i++) {
    const q = firstFlow + ((lastFlow - firstFlow) * i) / 40;
    const own = i === 0 ? (d.maxExternalCurve[0]?.[1] ?? null) : curveValue(d.maxExternalCurve, q, false);
    if (own === null) continue;
    const p = effects.clime ? Math.min(own, effects.clime.maxPressure(side, q)) : own;
    maxCurve.push([q, Math.max(0, p)]);
  }

  const stages = stageDevice
    ? stageDevice.stages.map((stage) => {
        const points: Points = [];
        for (let i = 0; i <= 48; i++) {
          const q = (stageDevice.xMax * i) / 48;
          const p = fanPressure(stage, q);
          if (p < 0) break;
          points.push([q, p]);
        }
        return { stage: stage.stage, points };
      })
    : [];

  const maxP = Math.max(...maxCurve.map(([, p]) => p), ...d.measurements.map((m) => m.pst), dp ?? 0, ...stages.map((s) => s.points[0]?.[1] ?? 0));
  const yMax = niceMax(maxP * 1.08);

  let system: Points | null = null;
  let operating: DeviceChartData["operating"] = null;
  if (withSystem && dp !== null && dp > 0 && flow > 0) {
    const k = dp / (flow * flow);
    system = [];
    for (let i = 0; i <= 48; i++) {
      const q = (xMax * i) / 48;
      const p = k * q * q;
      if (p > yMax) {
        system.push([Math.sqrt(yMax / k), yMax]);
        break;
      }
      system.push([q, p]);
    }
    operating = { flow, pressure: dp };
  }

  return {
    xMax,
    yMax,
    maxCurve,
    measurements: d.measurements,
    stages: stages.map((s) => ({ ...s, points: s.points.filter(([q, p]) => q <= xMax && p <= yMax * 1.02) })),
    nominalStage: stageSide?.nominalStage?.stage ?? null,
    flow,
    system,
    operating,
    stagePoints: system && stageSide ? stageSide.points.filter((p) => p.flow > 0 && p.flow <= xMax && p.pressure <= yMax) : [],
  };
}

/** About 5–8 round tick values from 0 to max. */
export function chartTicks(max: number): number[] {
  const raw = max / 6;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10;
  const result: number[] = [];
  for (let t = 0; t <= max + 1e-9; t += step) result.push(Math.round(t));
  return result;
}
