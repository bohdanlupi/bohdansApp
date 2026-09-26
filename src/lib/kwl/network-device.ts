// Device check from the Zehnder datasheet data: maximum external pressure line and power from the measurement
// table → SPI; with attachments: ComfoFond-L Q adds its pressure drop on the supply side (outdoor air), ComfoClime
// limits the available pressure to the 100 % fan curve of the combination.

import { type AttachmentEffects, attachmentEffects, type DeviceOptions, noDeviceOptions } from "./attachments";
import { spiLimit, spiTarget } from "./calc";
import { curveValue, datasheetDevice, type DeviceMeasurement } from "./products";

/** dp = external pressure the device has to deliver (incl. ComfoFond-L Q on the supply side). */
export type DeviceSideCheck = { flow: number; dp: number; maxPressure: number | null; ok: boolean | null; stage: number | null };

export type DeviceCheck = {
  source: "datasheet" | null;
  name: string | null;
  supply: DeviceSideCheck;
  extract: DeviceSideCheck;
  powerW: number | null;
  /** W per m³/h (= Wh/m³). */
  spi: number | null;
  spiStatus: "target" | "limit" | "exceeded" | null;
  maxFlow: number | null;
  attachments: AttachmentEffects | null;
  /** Air flow outside the range of an attachment (ComfoClime range, ComfoFond max. flow). */
  attachmentFlowWarning: boolean;
};

/**
 * Power from the measurement table: least-squares fit of the specific power SPI = P / q = a + b·p + c·q, then
 * P = SPI · q. Fitting the SPI (rather than P) stays plausible below the measured flows, where P → 0 otherwise.
 * The SPI is not taken below half the lowest measured value.
 */
export function fitPower(points: DeviceMeasurement[]) {
  const valid = points.filter((m) => m.qv > 0);
  if (!valid.length) return () => null;
  const spiOf = (m: DeviceMeasurement) => m.powerW / m.qv;
  const floor = Math.min(...valid.map(spiOf)) / 2;
  if (valid.length < 3) {
    return (q: number, p: number) => {
      const n = valid.reduce((best, m) => (Math.hypot((m.qv - q) / 100, (m.pst - p) / 100) < Math.hypot((best.qv - q) / 100, (best.pst - p) / 100) ? m : best));
      return Math.max(spiOf(n), floor) * q;
    };
  }
  // Normal equations for 3 unknowns.
  const rows = valid.map((m) => [1, m.pst, m.qv]);
  const ata = [0, 1, 2].map((i) => [0, 1, 2].map((j) => rows.reduce((sum, r) => sum + r[i] * r[j], 0)));
  const atb = [0, 1, 2].map((i) => rows.reduce((sum, r, k) => sum + r[i] * spiOf(valid[k]), 0));
  const coef = solve(ata, atb);
  if (!coef) return () => null;
  return (q: number, p: number) => Math.max(floor, coef[0] + coef[1] * p + coef[2] * q) * q;
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

export function checkDevice(
  deviceKey: string | null,
  supplyIn: { flow: number; dp: number },
  extract: { flow: number; dp: number },
  options: DeviceOptions = noDeviceOptions,
): DeviceCheck {
  const side = (s: { flow: number; dp: number }): DeviceSideCheck => ({ ...s, maxPressure: null, ok: null, stage: null });
  const product = datasheetDevice(deviceKey);
  if (product?.device) {
    const d = product.device;
    const effects = attachmentEffects(product.key, options, supplyIn.flow);
    const supply = { flow: supplyIn.flow, dp: supplyIn.dp + (effects.fond?.dp ?? 0) };
    const max = (q: number, s: "supply" | "extract") => {
      const own = d.maxExternalCurve.length ? curveValue(d.maxExternalCurve, q, false) : null;
      // With ComfoClime: the combination's 100 % fan curve, not above the device's own limit line.
      return effects.clime ? Math.min(own ?? Infinity, effects.clime.maxPressure(s, q)) : own;
    };
    const check = (s: { flow: number; dp: number }, key: "supply" | "extract"): DeviceSideCheck => {
      const maxPressure = max(s.flow, key);
      const withinFlow = d.maxFlow == null || s.flow <= d.maxFlow;
      return { ...s, maxPressure, ok: maxPressure === null ? null : withinFlow && s.dp <= maxPressure, stage: null };
    };
    const q = Math.max(supply.flow, extract.flow);
    const powerW = q > 0 ? fitPower(d.measurements)(q, Math.max(supply.dp, extract.dp)) : null;
    const spi = powerW !== null && q > 0 ? powerW / q : null;
    const climeRange = effects.clime?.flowRange;
    const attachmentFlowWarning =
      (!!climeRange && (q < climeRange[0] || q > climeRange[1])) || (!!effects.fond?.maxFlow && supply.flow > effects.fond.maxFlow);
    return {
      source: "datasheet",
      name: product.name,
      supply: check(supply, "supply"),
      extract: check(extract, "extract"),
      powerW,
      spi,
      spiStatus: spiStatusOf(spi),
      maxFlow: d.maxFlow ?? null,
      attachments: effects,
      attachmentFlowWarning,
    };
  }
  return {
    source: null,
    name: null,
    supply: side(supplyIn),
    extract: side(extract),
    powerW: null,
    spi: null,
    spiStatus: null,
    maxFlow: null,
    attachments: null,
    attachmentFlowWarning: false,
  };
}
