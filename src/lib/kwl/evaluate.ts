import { airFlows, analyseDevice, outdoorAirClass, type SettlementKey, supplyFilterMatrix, type TrafficKey } from "./calc";
import { findDevice } from "./devices";
import { attachmentEffects, normalizeOptions } from "./attachments";
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
  // Zehnder datasheet device; its fan stage curves (if any) for the stage selection.
  const product = datasheetDevice(data.device.id);
  const options = normalizeOptions(product?.key ?? null, data.device.options);
  // Stage curves are for the device alone: not with ComfoClime (other fans curve of the combination).
  const device = options.clime ? null : findDevice(product?.key);
  // External pressure drops: from the ventilation system (duct network, critical paths) when one serves this
  // dwelling, else the values entered by hand.
  // ComfoFond-L Q in the outdoor air adds its pressure drop on the supply side (supply = total incl. ComfoFond).
  const given =
    system && (system.supply !== null || system.extract !== null)
      ? { supply: system.supply, extract: system.extract, source: "system" as const, system }
      : { supply: data.device.supplyDrop, extract: data.device.extractDrop, source: "manual" as const, system: null };
  const fond = attachmentEffects(product?.key ?? null, options, base.summary.supply).fond;
  const drops: {
    supply: number | null;
    extract: number | null;
    /** Values from the network / entered by hand, without attachments. */
    given: { supply: number | null; extract: number | null };
    fond: number | null;
    source: "system" | "manual";
    system: SystemDrops | null;
  } = {
    supply: fond ? (given.supply ?? 0) + fond.dp : given.supply,
    extract: given.extract,
    given: { supply: given.supply, extract: given.extract },
    fond: fond?.dp ?? null,
    source: given.source,
    system: given.system,
  };
  const stageResult = analyseDevice(device, base.summary.supply, base.summary.extract, drops.supply, drops.extract, data.device.power);
  const { rows, summary } = airFlows(data.rooms, stageResult.partyFlow, data.height);
  const oda = effectiveOda(data.filter);
  // Datasheet check (maximum external pressure, power from the measurement table): its SPI has priority over the
  // stage power table; a power entered by hand overrides both.
  const datasheet = product
    ? checkDevice(product.key, { flow: summary.supply, dp: drops.given.supply ?? 0 }, { flow: summary.extract, dp: drops.extract ?? 0 }, options)
    : null;
  const deviceResult = !stageResult.spiFromInput && datasheet?.spi != null ? { ...stageResult, spi: datasheet.spi } : stageResult;
  return {
    product,
    options,
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
