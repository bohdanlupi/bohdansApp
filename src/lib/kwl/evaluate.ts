import { attachmentEffects, normalizeOptions } from "./attachments";
import { airFlows, outdoorAirClass, type SettlementKey, supplyFilterMatrix, type TrafficKey } from "./calc";
import { type DeviceResult, operateSide } from "./device-operation";
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
  // Zehnder datasheet device with its attachments.
  const product = datasheetDevice(data.device.id);
  const options = normalizeOptions(product?.key ?? null, data.device.options);
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
  // Operating points on the datasheet Kennlinien: normal operation, minimum flow, party (largest possible flow).
  const side = (s: "supply" | "extract") =>
    operateSide({
      deviceKey: product?.key ?? null,
      options,
      side: s,
      nominalFlow: s === "supply" ? base.summary.supply : base.summary.extract,
      minFlow: s === "supply" ? base.summary.minSupply : base.summary.minExtract,
      dp: s === "supply" ? drops.supply : drops.extract,
    });
  const supplyOp = side("supply");
  const extractOp = side("extract");
  const partyFlow = supplyOp?.party && extractOp?.party ? Math.min(supplyOp.party.flow, extractOp.party.flow) : null;
  const { rows, summary } = airFlows(data.rooms, partyFlow, data.height);
  const oda = effectiveOda(data.filter);
  // Datasheet check (maximum external pressure, power from the measurement table → SPI); a power entered by hand
  // overrides the SPI.
  const datasheet = product
    ? checkDevice(product.key, { flow: summary.supply, dp: drops.given.supply ?? 0 }, { flow: summary.extract, dp: drops.extract ?? 0 }, options)
    : null;
  const largerFlow = Math.max(summary.supply, summary.extract);
  const spiFromInput = data.device.power !== null && data.device.power > 0 && largerFlow > 0;
  const deviceResult: DeviceResult = {
    supply: supplyOp,
    extract: extractOp,
    partyFlow,
    spi: spiFromInput ? data.device.power! / largerFlow : (datasheet?.spi ?? null),
    spiFromInput,
  };
  return {
    product,
    options,
    datasheet,
    rows,
    summary,
    deviceResult,
    drops,
    oda,
    supplyFilter: oda ? supplyFilterMatrix[oda][data.filter.ida] : null,
  };
}

export type KwlEvaluation = ReturnType<typeof evaluateKwl>;
