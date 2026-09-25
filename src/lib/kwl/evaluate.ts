import { airFlows, analyseDevice, outdoorAirClass, type SettlementKey, supplyFilterMatrix, type TrafficKey } from "./calc";
import { findDevice } from "./devices";
import type { KwlData, KwlFilterInput } from "./schema";

/** Effective outdoor air class: set by hand, else from traffic + settlement. */
export const effectiveOda = (filter: KwlFilterInput) =>
  filter.odaOverride ?? outdoorAirClass(filter.traffic as TrafficKey | null, filter.settlement as SettlementKey | null);

/** All results of a KWL calculation. */
export function evaluateKwl(data: KwlData) {
  // The party flow depends on the device, the device on the nominal flows: nominal flows first.
  const base = airFlows(data.rooms, null);
  const device = findDevice(data.device.id);
  const deviceResult = analyseDevice(
    device,
    base.summary.supply,
    base.summary.extract,
    data.device.supplyDrop,
    data.device.extractDrop,
    data.device.power,
  );
  const { rows, summary } = airFlows(data.rooms, deviceResult.partyFlow);
  const oda = effectiveOda(data.filter);
  return {
    rows,
    summary,
    device,
    deviceResult,
    oda,
    supplyFilter: oda ? supplyFilterMatrix[oda][data.filter.ida] : null,
  };
}

export type KwlEvaluation = ReturnType<typeof evaluateKwl>;
