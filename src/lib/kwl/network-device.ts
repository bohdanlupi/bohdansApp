// Device check for a ventilation system: Zehnder devices from the datasheet data (maximum external pressure
// and power from the measurement table), otherwise the fan curves of the LUPI workbook (devices.ts).

import { analyseSide, spiLimit, spiTarget } from "./calc";
import { findDevice } from "./devices";
import { curveValue, datasheetDevice, type DeviceMeasurement } from "./products";

export type DeviceSideCheck = { flow: number; dp: number; maxPressure: number | null; ok: boolean | null; stage: number | null };

export type DeviceCheck = {
  source: "datasheet" | "workbook" | null;
  name: string | null;
  supply: DeviceSideCheck;
  extract: DeviceSideCheck;
  powerW: number | null;
  /** W per m³/h (= Wh/m³). */
  spi: number | null;
  spiStatus: "target" | "limit" | "exceeded" | null;
  maxFlow: number | null;
};

/** Least-squares fit P = a + b·q + c·p + d·q·p over the measurement points (bilinear surface). */
export function fitPower(points: DeviceMeasurement[]) {
  if (points.length < 4) {
    return (q: number, p: number) => {
      if (!points.length) return null;
      const n = points.reduce((best, m) => (Math.hypot((m.qv - q) / 100, (m.pst - p) / 100) < Math.hypot((best.qv - q) / 100, (best.pst - p) / 100) ? m : best));
      return n.powerW;
    };
  }
  // Normal equations for 4 unknowns.
  const rows = points.map((m) => [1, m.qv, m.pst, m.qv * m.pst]);
  const ata = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => rows.reduce((s, r) => s + r[i] * r[j], 0)));
  const atb = [0, 1, 2, 3].map((i) => rows.reduce((s, r, k) => s + r[i] * points[k].powerW, 0));
  const coef = solve(ata, atb);
  if (!coef) return () => null;
  return (q: number, p: number) => Math.max(0, coef[0] + coef[1] * q + coef[2] * p + coef[3] * q * p);
}

function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[pivot][c])) pivot = r;
    if (Math.abs(m[pivot][c]) < 1e-12) return null;
    [m[c], m[pivot]] = [m[pivot], m[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

const spiStatusOf = (spi: number | null) => (spi === null ? null : spi <= spiTarget ? "target" : spi <= spiLimit ? "limit" : "exceeded");

export function checkDevice(deviceKey: string | null, supply: { flow: number; dp: number }, extract: { flow: number; dp: number }): DeviceCheck {
  const side = (s: { flow: number; dp: number }): DeviceSideCheck => ({ ...s, maxPressure: null, ok: null, stage: null });
  const product = datasheetDevice(deviceKey);
  if (product?.device) {
    const d = product.device;
    const max = (q: number) => (d.maxExternalCurve.length ? curveValue(d.maxExternalCurve, q, false) : null);
    const check = (s: { flow: number; dp: number }): DeviceSideCheck => {
      const maxPressure = max(s.flow);
      const withinFlow = d.maxFlow == null || s.flow <= d.maxFlow;
      return { ...s, maxPressure, ok: maxPressure === null ? null : withinFlow && s.dp <= maxPressure, stage: null };
    };
    const q = Math.max(supply.flow, extract.flow);
    const powerW = q > 0 ? fitPower(d.measurements)(q, Math.max(supply.dp, extract.dp)) : null;
    const spi = powerW !== null && q > 0 ? powerW / q : null;
    return { source: "datasheet", name: product.name, supply: check(supply), extract: check(extract), powerW, spi, spiStatus: spiStatusOf(spi), maxFlow: d.maxFlow ?? null };
  }
  const device = findDevice(deviceKey);
  if (device) {
    const s = analyseSide(device, supply.flow, supply.dp);
    const e = analyseSide(device, extract.flow, extract.dp);
    const toCheck = (x: typeof s, input: { flow: number; dp: number }): DeviceSideCheck => ({
      ...input,
      maxPressure: null,
      ok: x ? x.nominalStage !== null : null,
      stage: x?.nominalStage?.stage ?? null,
    });
    const spis = [s?.spi, e?.spi].filter((v): v is number => v != null);
    const spi = spis.length ? Math.max(...spis) : null;
    return { source: "workbook", name: device.name, supply: toCheck(s, supply), extract: toCheck(e, extract), powerW: null, spi, spiStatus: spiStatusOf(spi), maxFlow: null };
  }
  return { source: null, name: null, supply: side(supply), extract: side(extract), powerW: null, spi: null, spiStatus: null, maxFlow: null };
}
