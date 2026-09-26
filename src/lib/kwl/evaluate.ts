import { airFlows, analyseDevice, outdoorAirClass, type SettlementKey, supplyFilterMatrix, type TrafficKey } from "./calc";
import { findDevice } from "./devices";
import { checkDevice } from "./network-device";
import { datasheetDevice } from "./products";
import type { KwlData, KwlFilterInput } from "./schema";

/** Effective outdoor air class: set by hand, else from traffic + settlement. */
export const effectiveOda = (filter: KwlFilterInput) =>
  filter.odaOverride ?? outdoorAirClass(filter.traffic as TrafficKey | null, filter.settlement as SettlementKey | null);

/** External pressure drops calculated in the ventilation system that serves the dwelling. */
export type SystemDrops = { supply: number | null; extract: number | null; systemId: string; name: string };

/** All results of a KWL calculation. */
export function evaluateKwl(data: KwlData, system: SystemDrops | null = null) {
  // The party flow depends on the device, the device on the nominal flows: nominal flows first.
  const base = airFlows(data.rooms, null, data.height);
  const device = findDevice(data.device.id);
  // External pressure drops: from the ventilation system (duct network, critical paths) when one serves this
  // dwelling, else the values entered by hand.
  const drops: { supply: number | null; extract: number | null; source: "system" | "manual"; system: SystemDrops | null } =
    system && (system.supply !== null || system.extract !== null)
      ? { supply: system.supply, extract: system.extract, source: "system", system }
      : { supply: data.device.supplyDrop, extract: data.device.extractDrop, source: "manual", system: null };
  const deviceResult = analyseDevice(device, base.summary.supply, base.summary.extract, drops.supply, drops.extract, data.device.power);
  const { rows, summary } = airFlows(data.rooms, deviceResult.partyFlow, data.height);
  const oda = effectiveOda(data.filter);
  // Zehnder datasheet (maximum external pressure, power from the measurement table) – priority over the workbook.
  const datasheet = datasheetDevice(data.device.id)
    ? checkDevice(data.device.id, { flow: summary.supply, dp: drops.supply ?? 0 }, { flow: summary.extract, dp: drops.extract ?? 0 })
    : null;
  return {
    datasheet,
    rows,
    summary,
    device,
    deviceResult,
    drops,
    oda,
    supplyFilter: oda ? supplyFilterMatrix[oda][data.filter.ida] : null,
  };
}

export type KwlEvaluation = ReturnType<typeof evaluateKwl>;
