import { z } from "zod";

import { idaClasses, odaClasses, roomTypeKeys, settlementOptions, trafficOptions } from "./calc";

// Input data of a KWL calculation, stored as jsonb in ventilation_calcs.data.

const num = (max: number) => z.number().finite().min(0).max(max).nullable().catch(null);
const text = (max: number) => z.string().max(max).catch("");

export const kwlRoomSchema = z.object({
  id: z.string().min(1).max(40),
  number: text(40),
  name: text(120),
  type: z.enum(roomTypeKeys).nullable().catch(null),
  area: num(10000),
  supply: num(100000),
  extract: num(100000),
});

export const kwlDataSchema = z.object({
  // Invalid rooms are dropped one by one instead of losing the whole list.
  rooms: z
    .array(z.unknown())
    .transform((list) =>
      list.slice(0, 300).flatMap((raw) => {
        const parsed = kwlRoomSchema.safeParse(raw);
        return parsed.success ? [parsed.data] : [];
      }),
    )
    .catch([]),
  /** Clear room height [m], for room volumes (air change, bathroom volume for acoustics). */
  height: z.number().finite().min(1.5).max(10).catch(2.5),
  standard: z.enum(["standard", "minergie"]).catch("standard"),
  filter: z
    .object({
      traffic: z
        .enum(trafficOptions.map((o) => o.key) as [string, ...string[]])
        .nullable()
        .catch(null),
      settlement: z
        .enum(settlementOptions.map((o) => o.key) as [string, ...string[]])
        .nullable()
        .catch(null),
      /** Set by hand for special conditions, with a reason. */
      odaOverride: z.enum(odaClasses).nullable().catch(null),
      overrideReason: text(500),
      ida: z.enum(idaClasses).catch("IDA 2"),
    })
    .catch({
      traffic: null,
      settlement: null,
      odaOverride: null,
      overrideReason: "",
      ida: "IDA 2",
    }),
  device: z
    .object({
      id: z.string().max(80).nullable().catch(null),
      /** Pressure drop at nominal flow AUL → ZUL and ABL → FOL (from the KWL tool / Enerweb). */
      supplyDrop: num(5000),
      extractDrop: num(5000),
      /** Electrical power at nominal operation [W], when the device data has none. */
      power: num(10000),
    })
    .catch({ id: null, supplyDrop: 150, extractDrop: 100, power: null }),
  notes: text(4000),
});

export type KwlData = z.infer<typeof kwlDataSchema>;
export type KwlFilterInput = KwlData["filter"];

/** Parses stored data leniently: unknown or broken fields fall back to defaults. */
export const parseKwlData = (value: unknown): KwlData => kwlDataSchema.parse(value ?? {});

export const emptyKwlData = (): KwlData => parseKwlData({});
