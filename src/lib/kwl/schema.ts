import { z } from "zod";

import { idaClasses, odaClasses, roomTypeKeys, settlementOptions, trafficOptions } from "./calc";
import { ductMaterials, type DuctMaterial } from "./pressure";
import { deviceOptionsSchema, noDeviceOptions } from "./attachments";
import { datasheetDevice } from "./products";

// Input data of a KWL calculation, stored as jsonb in ventilation_calcs.data.

const num = (max: number) => z.number().finite().min(0).max(max).nullable().catch(null);
const text = (max: number) => z.string().max(max).catch("");

export const kwlRoomSchema = z.object({
  id: z.string().min(1).max(40),
  number: text(40),
  name: text(120),
  type: z.enum(roomTypeKeys).nullable().catch(null),
  /** Storey (e.g. UG, EG, OG, DG) for the Prinzipschema. */
  floor: text(20),
  area: num(10000),
  supply: num(100000),
  extract: num(100000),
});

/** Array whose invalid entries are dropped one by one. */
const lenientArray = <T extends z.ZodType>(item: T, max: number) =>
  z
    .array(z.unknown())
    .transform((list) =>
      list.slice(0, max).flatMap((raw) => {
        const parsed = item.safeParse(raw);
        return parsed.success ? [parsed.data as z.infer<T>] : [];
      }),
    )
    .catch([]);

export const segmentSchema = z.object({
  id: z.string().min(1).max(40),
  name: text(120),
  kind: z.enum(["duct", "component"]).catch("duct"),
  preset: text(40),
  shape: z.enum(["round", "rect"]).catch("round"),
  diameter: num(3000),
  width: num(5000),
  height: num(5000),
  length: num(1000),
  count: z.number().int().min(1).max(20).catch(1),
  material: z.enum(Object.keys(ductMaterials) as [DuctMaterial, ...DuctMaterial[]]).catch("plastic"),
  roughness: num(20),
  bends: num(100),
  zeta: num(1000),
  dpRef: num(10000),
  qRef: num(100000),
  flow: num(100000),
});

const segments = lenientArray(segmentSchema, 50);

const networkSideSchema = z
  .object({
    outer: segments,
    main: segments,
    branches: z
      .record(z.string(), z.unknown())
      .transform((obj) =>
        Object.fromEntries(
          Object.entries(obj)
            .filter(([key]) => key.length <= 40)
            .map(([key, list]) => [key, segments.parse(list)]),
        ),
      )
      .catch({}),
  })
  .catch({ outer: [], main: [], branches: {} });

export const networkSchema = z
  .object({
    supply: networkSideSchema,
    extract: networkSideSchema,
    /** Use the calculated external pressure drops for the device instead of the manual values. */
    applyToDevice: z.boolean().catch(false),
  })
  .catch({ supply: { outer: [], main: [], branches: {} }, extract: { outer: [], main: [], branches: {} }, applyToDevice: false });

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
  /** Duct networks for the pressure drop AUL → rooms and rooms → FOL. */
  network: networkSchema,
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
      ida: z.enum(idaClasses).catch("IDA 3"),
    })
    .catch({
      traffic: null,
      settlement: null,
      odaOverride: null,
      overrideReason: "",
      ida: "IDA 3",
    }),
  device: z
    .object({
      /** Zehnder datasheet device key; older keys (workbook «…-st», other manufacturers) are mapped or dropped. */
      id: z
        .string()
        .max(80)
        .nullable()
        .catch(null)
        .transform((id) => datasheetDevice(id)?.key ?? null),
      /** Pressure drop at nominal flow AUL → ZUL and ABL → FOL (from the KWL tool / Enerweb). */
      supplyDrop: num(5000),
      extractDrop: num(5000),
      /** Electrical power at nominal operation [W], when the device data has none. */
      power: num(10000),
      /** Attachments (ComfoFond-L Q, enthalpy exchanger, ComfoClime). */
      options: deviceOptionsSchema,
    })
    .catch({ id: null, supplyDrop: 80, extractDrop: 70, power: null, options: noDeviceOptions }),
  notes: text(4000),
});

export type KwlData = z.infer<typeof kwlDataSchema>;
export type KwlFilterInput = KwlData["filter"];

/** Parses stored data leniently: unknown or broken fields fall back to defaults. */
export const parseKwlData = (value: unknown): KwlData => kwlDataSchema.parse(value ?? {});

export const emptyKwlData = (): KwlData => parseKwlData({});
