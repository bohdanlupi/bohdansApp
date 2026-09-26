// Attachments of the Zehnder units, selected together with the device: ComfoFond-L Q (brine ground heat exchanger in
// the outdoor air, Q350/Q450/Q600), enthalpy exchanger (ERV, instead of the standard heat exchanger) and
// ComfoClime 24 / 36 (air conditioning unit on the ComfoAir Q). Data from the Zehnder datasheets (zehnder-data.ts).

import { z } from "zod";

import { curveValue } from "./products";
import { zehnderAttachments } from "./zehnder-data";

type Article = { number: string; text: string };
type Points = [number, number][];

export type ZehnderAttachments = {
  fond: {
    name: string;
    source: { file: string; page?: number };
    withFilter: Points;
    withoutFilter: Points;
    /** Per device key: pump power at nominal operation, max. air flow. */
    devices: Record<string, { pumpW: number; maxFlow: number | null }>;
    articles: Article[];
  };
  erv: {
    source: { file: string; page?: number };
    devices: Record<
      string,
      { heatRecoveryPct: number | null; humidityRecoveryPct: number | null; spiPhi: number | null; tempEfficiencyPct: number | null; retrofitArticle: Article | null }
    >;
  };
  clime: {
    key: string;
    name: string;
    source: { file: string; page?: number };
    heatingKW: number;
    coolingKW: number;
    maxPowerW: number;
    flowRange: [number, number];
    article: Article;
    /** 100 % fan curves of the combination (external pressure over air flow) and the mandatory adapter kit. */
    combinations: { device: string; supply: Points; extract: Points; adapter: Article | null }[];
    accessories: Article[];
  }[];
};

export type FondOption = "none" | "filter" | "noFilter";
/** ComfoFond-L Q version: supply air connection on the left or on the right. */
export type FondSide = "left" | "right";
export type DeviceOptions = { erv: boolean; fond: FondOption; fondSide: FondSide; clime: string | null };

export const noDeviceOptions: DeviceOptions = { erv: false, fond: "none", fondSide: "right", clime: null };

export const deviceOptionsSchema = z
  .object({
    erv: z.boolean().catch(false),
    fond: z.enum(["none", "filter", "noFilter"]).catch("none"),
    fondSide: z.enum(["left", "right"]).catch("right"),
    clime: z.string().max(40).nullable().catch(null),
  })
  .catch(noDeviceOptions);

/** Attachments that exist for a device. */
export function availableOptions(deviceKey: string | null) {
  const key = deviceKey ?? "";
  return {
    erv: key in zehnderAttachments.erv.devices,
    fond: key in zehnderAttachments.fond.devices,
    clime: zehnderAttachments.clime.filter((c) => c.combinations.some((x) => x.device === key)).map((c) => ({ key: c.key, name: c.name })),
  };
}

/** Options without the attachments that do not fit the device. */
export function normalizeOptions(deviceKey: string | null, options: DeviceOptions | null | undefined): DeviceOptions {
  const o = options ?? noDeviceOptions;
  const available = availableOptions(deviceKey);
  return {
    erv: o.erv && available.erv,
    fond: available.fond ? o.fond : "none",
    fondSide: o.fondSide === "left" ? "left" : "right",
    clime: o.clime && available.clime.some((c) => c.key === o.clime) ? o.clime : null,
  };
}

export const hasOptions = (o: DeviceOptions) => o.erv || o.fond !== "none" || o.clime !== null;

/** Effects of the attachments at the given air flows. */
export function attachmentEffects(deviceKey: string | null, options: DeviceOptions, supplyFlow: number) {
  const key = deviceKey ?? "";
  const o = normalizeOptions(deviceKey, options);
  const fondDevice = zehnderAttachments.fond.devices[key];
  const fond =
    o.fond !== "none" && fondDevice
      ? {
          name: zehnderAttachments.fond.name,
          withFilter: o.fond === "filter",
          side: o.fondSide,
          /** Pressure drop on the outdoor air side at the supply flow [Pa]. */
          dp: curveValue(o.fond === "filter" ? zehnderAttachments.fond.withFilter : zehnderAttachments.fond.withoutFilter, supplyFlow) ?? 0,
          pumpW: fondDevice.pumpW,
          maxFlow: fondDevice.maxFlow,
          source: zehnderAttachments.fond.source,
        }
      : null;
  const ervData = o.erv ? zehnderAttachments.erv.devices[key] : undefined;
  const erv = ervData ? { ...ervData, source: zehnderAttachments.erv.source } : null;
  const climeUnit = o.clime ? zehnderAttachments.clime.find((c) => c.key === o.clime) : undefined;
  const combination = climeUnit?.combinations.find((c) => c.device === key);
  const clime =
    climeUnit && combination
      ? {
          name: climeUnit.name,
          heatingKW: climeUnit.heatingKW,
          coolingKW: climeUnit.coolingKW,
          maxPowerW: climeUnit.maxPowerW,
          flowRange: climeUnit.flowRange,
          /** Available external pressure of the combination (100 % fan curve) [Pa]. */
          maxPressure: (side: "supply" | "extract", q: number) => Math.max(0, curveValue(combination[side], q, false) ?? 0),
          source: climeUnit.source,
        }
      : null;
  return { options: o, fond, erv, clime };
}

export type AttachmentEffects = ReturnType<typeof attachmentEffects>;

/**
 * Articles of the device with its attachments for the LV: the device (standard or enthalpy exchanger version),
 * ComfoFond-L Q (supply on the right, option box, filter set with the filter option) and ComfoClime with the
 * mandatory adapter kit for the device.
 */
export function deviceArticles(deviceKey: string | null, deviceName: string, deviceArticleList: Article[], options: DeviceOptions) {
  const o = normalizeOptions(deviceKey, options);
  const out: { label: string; article: Article | null }[] = [];
  // ComfoAir Q: two articles (S = standard heat exchanger, E = enthalpy exchanger).
  const enthalpyVersion = deviceArticleList.find((a) => /enthalpie/i.test(a.text));
  const standard = deviceArticleList.find((a) => a !== enthalpyVersion) ?? deviceArticleList[0] ?? null;
  const ervRetrofit = o.erv ? zehnderAttachments.erv.devices[deviceKey ?? ""]?.retrofitArticle : null;
  const deviceArticle = o.erv && enthalpyVersion ? enthalpyVersion : standard;
  out.push({ label: deviceArticle?.text || `Zehnder ${deviceName}`, article: deviceArticle });
  if (o.erv && !enthalpyVersion && ervRetrofit) out.push({ label: ervRetrofit.text, article: ervRetrofit });
  if (o.fond !== "none") {
    const a = zehnderAttachments.fond.articles;
    const unit = a.find((x) => (o.fondSide === "left" ? /ZUL links/i : /ZUL rechts/i).test(x.text)) ?? a[0];
    const box = a.find((x) => /option box/i.test(x.text));
    const filters = a.find((x) => /filterset/i.test(x.text));
    for (const x of [unit, box, o.fond === "filter" ? filters : undefined]) if (x) out.push({ label: x.text, article: x });
  }
  const climeUnit = o.clime ? zehnderAttachments.clime.find((c) => c.key === o.clime) : undefined;
  if (climeUnit) {
    out.push({ label: climeUnit.article.text, article: climeUnit.article });
    const adapter = climeUnit.combinations.find((c) => c.device === deviceKey)?.adapter;
    if (adapter) out.push({ label: adapter.text, article: adapter });
  }
  return out;
}

/** Short description of the selected attachments, e.g. «Enthalpietauscher, ComfoFond-L Q, ComfoClime 24». */
export function optionsLabel(
  deviceKey: string | null,
  options: DeviceOptions,
  labels: { erv: string; fond: string; fondFilter: string; fondLeft: string; fondRight: string },
) {
  const o = normalizeOptions(deviceKey, options);
  const parts: string[] = [];
  if (o.erv) parts.push(labels.erv);
  if (o.fond !== "none") {
    const details = [o.fond === "filter" ? labels.fondFilter : null, o.fondSide === "left" ? labels.fondLeft : labels.fondRight].filter(Boolean);
    parts.push(`${labels.fond} (${details.join(", ")})`);
  }
  const clime = o.clime ? zehnderAttachments.clime.find((c) => c.key === o.clime) : undefined;
  if (clime) parts.push(clime.name);
  return parts.join(", ");
}
