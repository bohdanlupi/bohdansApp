// Data of the device diagram per side, laid out like the LUPI workbook («Kennlinien Zuluft / Abluft»): the fan
// Kennlinien of the Zehnder datasheet (SL: per speed / step; ComfoAir Q / Flex: the pressure limit of the
// constant-volume control), the Anlagenkennlinie Δp = k·V² and its crossings – normal operation, minimum flow and
// party (largest possible flow). The Anlagenkennlinie is drawn once the pressure drop calculation is done.

import type { OperatingPoint, SideOperation } from "./device-operation";
import type { DeviceMeasurement } from "./products";

type Points = [number, number][];

export type DeviceChartData = {
  xMax: number;
  yMax: number;
  control: SideOperation["control"];
  /** Pressure limit (constant-volume control) – for stage devices the top Kennlinie. */
  limit: Points;
  curves: { label: string; points: Points }[];
  measurements: DeviceMeasurement[];
  nominalFlow: number;
  minFlow: number;
  system: Points | null;
  stagePoints: OperatingPoint[];
  normal: OperatingPoint | null;
  minimum: OperatingPoint | null;
  party: OperatingPoint | null;
};

const niceMax = (v: number) => {
  if (!(v > 0)) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(v));
  return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * magnitude).find((m) => m >= v) ?? v;
};

export function deviceChart(op: SideOperation, measurements: DeviceMeasurement[], withSystem: boolean): DeviceChartData {
  const lastQ = (points: Points) => points.at(-1)?.[0] ?? 0;
  const xMax = niceMax(Math.max(lastQ(op.limit), ...op.curves.map((c) => lastQ(c.points)), op.maxFlow ?? 0, op.nominalFlow) * 1.04);
  const yMax = niceMax(Math.max(...op.limit.map(([, p]) => p), ...op.curves.map((c) => c.points[0]?.[1] ?? 0), op.dp ?? 0) * 1.06);

  let system: Points | null = null;
  if (withSystem && op.k) {
    const k = op.k;
    system = [];
    for (let i = 0; i <= 60; i++) {
      const q = (xMax * i) / 60;
      if (k * q * q > yMax) {
        system.push([Math.sqrt(yMax / k), yMax]);
        break;
      }
      system.push([q, k * q * q]);
    }
  }
  const show = <T,>(v: T) => (system ? v : null);
  return {
    xMax,
    yMax,
    control: op.control,
    limit: op.limit,
    curves: op.curves.map((c) => ({ ...c, points: c.points.filter(([q, p]) => q <= xMax && p >= 0 && p <= yMax * 1.02) })),
    measurements,
    nominalFlow: op.nominalFlow,
    minFlow: op.minFlow,
    system,
    stagePoints: system ? op.stagePoints : [],
    normal: show(op.normal),
    minimum: show(op.minimum),
    party: show(op.party),
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

/** Colours of the Kennlinien (similar to the workbook's chart palette). */
export const curveColors = ["#1f4e79", "#c55a11", "#7f7f7f", "#bf9000", "#2e75b6", "#548235", "#203864", "#843c0c", "#595959", "#7f6000"];
