// Operating points of a Zehnder device per side, from the datasheet Kennlinien (Zehnder PDFs):
// the Anlagenkennlinie Δp = k·V² through the nominal point crosses the fan Kennlinien (SL: speeds / steps) – for
// units with constant-volume control (ComfoAir Q, Flex) the flow is set freely below the pressure limit line.
//   Normalbetrieb: Kennlinie closest to the nominal flow (eingesetzte Luftmenge)
//   Minimum:       Kennlinie closest to the sum of the minimum flows
//   Party:         largest possible flow at the external pressure drop (top Kennlinie / limit × Anlagenkennlinie,
//                  at most the device's max. flow)

import { attachmentEffects, type DeviceOptions } from "./attachments";
import { fitPower } from "./network-device";
import { curveValue, datasheetDevice } from "./products";

type Points = [number, number][];

export type OperatingPoint = {
  /** Kennlinie (e.g. «Stufe 6», «80 %»); null for constant-volume control. */
  curve: string | null;
  flow: number;
  pressure: number;
  powerW: number | null;
};

export type SideOperation = {
  control: "stages" | "constantFlow";
  nominalFlow: number;
  minFlow: number;
  /** External pressure at the nominal flow [Pa] (supply incl. ComfoFond). */
  dp: number | null;
  /** Anlagenkennlinie Δp = k·V²; null without pressure drop. */
  k: number | null;
  /** Maximum external pressure of the device (datasheet; with ComfoClime the combination's 100 % curve). */
  limit: Points;
  /** Fan Kennlinien, highest first (none for constant-volume control). */
  curves: { label: string; points: Points }[];
  /** Crossings of the Kennlinien with the Anlagenkennlinie. */
  stagePoints: OperatingPoint[];
  normal: OperatingPoint | null;
  minimum: OperatingPoint | null;
  party: OperatingPoint | null;
  /** Largest flow of the device alone (datasheet max. flow). */
  maxFlow: number | null;
  /** The nominal flow is not reached at the external pressure. */
  tooSmall: boolean;
};

/** First crossing (from the left) of a Kennlinie with Δp = k·V²; at the end of the curve its last flow. */
export function crossing(points: Points, k: number): { flow: number; pressure: number } | null {
  if (points.length < 2) return null;
  const g = (q: number, p: number) => p - k * q * q;
  for (let i = 1; i < points.length; i++) {
    const [q0, p0] = points[i - 1];
    const [q1, p1] = points[i];
    if (g(q0, p0) >= 0 && g(q1, p1) <= 0) {
      let lo = q0;
      let hi = q1;
      const p = (q: number) => (q1 === q0 ? p0 : p0 + ((p1 - p0) * (q - q0)) / (q1 - q0));
      for (let n = 0; n < 40; n++) {
        const mid = (lo + hi) / 2;
        if (g(mid, p(mid)) > 0) lo = mid;
        else hi = mid;
      }
      const q = (lo + hi) / 2;
      return { flow: q, pressure: k * q * q };
    }
  }
  const [qEnd, pEnd] = points[points.length - 1];
  return g(qEnd, pEnd) > 0 ? { flow: qEnd, pressure: k * qEnd * qEnd } : null;
}

const closest = (points: OperatingPoint[], flow: number) =>
  points.reduce<OperatingPoint | null>((best, p) => (!best || Math.abs(p.flow - flow) < Math.abs(best.flow - flow) ? p : best), null);

export function operateSide({
  deviceKey,
  options,
  side,
  nominalFlow,
  minFlow,
  dp,
}: {
  deviceKey: string | null;
  options: DeviceOptions;
  side: "supply" | "extract";
  nominalFlow: number;
  minFlow: number;
  dp: number | null;
}): SideOperation | null {
  const product = datasheetDevice(deviceKey);
  const d = product?.device;
  if (!d) return null;
  const effects = attachmentEffects(product.key, options, nominalFlow);

  // Limit line (ComfoClime: not above the combination's 100 % curve).
  const first = d.maxExternalCurve[0]?.[0] ?? 0;
  const last = d.maxExternalCurve.at(-1)?.[0] ?? first;
  const limit: Points = [];
  for (let i = 0; i <= 40; i++) {
    const q = first + ((last - first) * i) / 40;
    const own = i === 0 ? (d.maxExternalCurve[0]?.[1] ?? 0) : (curveValue(d.maxExternalCurve, q, false) ?? 0);
    limit.push([q, Math.max(0, effects.clime ? Math.min(own, effects.clime.maxPressure(side, q)) : own)]);
  }
  // With ComfoClime the fans follow the combination's curve: only its limit is known.
  const curves = effects.clime ? [] : (d.fanCurves ?? []);
  const control = curves.length ? "stages" : "constantFlow";
  const maxFlow = Math.min(d.maxFlow ?? Infinity, effects.clime ? effects.clime.flowRange[1] : Infinity);
  const k = dp !== null && dp > 0 && nominalFlow > 0 ? dp / (nominalFlow * nominalFlow) : null;
  const power = fitPower(d.measurements);
  const point = (curve: string | null, flow: number, pressure: number): OperatingPoint => ({ curve, flow, pressure, powerW: flow > 0 ? power(flow, pressure) : null });
  const base = { control, nominalFlow, minFlow, dp, k, limit, curves, maxFlow: Number.isFinite(maxFlow) ? maxFlow : null } as const;

  if (k === null) return { ...base, stagePoints: [], normal: null, minimum: null, party: null, tooSmall: false };

  if (control === "constantFlow") {
    const top = crossing(limit, k);
    const partyFlow = top ? Math.min(top.flow, maxFlow) : null;
    const party = partyFlow !== null ? point(null, partyFlow, k * partyFlow * partyFlow) : null;
    return {
      ...base,
      stagePoints: [],
      normal: point(null, nominalFlow, k * nominalFlow * nominalFlow),
      minimum: minFlow > 0 ? point(null, minFlow, k * minFlow * minFlow) : null,
      party,
      tooSmall: !party || party.flow < nominalFlow * 0.999,
    };
  }

  const stagePoints = curves
    .map((c) => {
      const x = crossing(c.points, k);
      return x ? point(c.label, Math.min(x.flow, maxFlow), k * Math.min(x.flow, maxFlow) ** 2) : null;
    })
    .filter((p): p is OperatingPoint => !!p);
  const party = stagePoints[0] ?? null;
  return {
    ...base,
    stagePoints,
    normal: closest(stagePoints, nominalFlow),
    minimum: minFlow > 0 ? closest(stagePoints, minFlow) : null,
    party,
    tooSmall: !party || party.flow < nominalFlow * 0.999,
  };
}

export type DeviceResult = {
  supply: SideOperation | null;
  extract: SideOperation | null;
  /** Party flow for both sides (balanced): the smaller of the two party points. */
  partyFlow: number | null;
  spi: number | null;
  /** SPI from the power entered by hand instead of the datasheet. */
  spiFromInput: boolean;
};
