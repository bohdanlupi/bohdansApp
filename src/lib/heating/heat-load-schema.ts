import { z } from "zod";

import {
  adjacencies,
  constructionKinds,
  emissionSystems,
  f1Table4,
  groundwaterLevels,
  type HeatLoadData,
  type HeatSite,
  inertiaModes,
  ventilationConcepts,
} from "./heat-load";

// Lenient parsing of the heat load inputs: site and catalogue (heating_plans.data), calculations (heating_calcs.data).
// Invalid list entries are dropped one by one, invalid fields fall back to defaults.

const num = (min: number, max: number) => z.number().finite().min(min).max(max).nullable().catch(null);
const text = (max: number) => z.string().max(max).catch("");
const id = z.string().min(1).max(40);
const keys = <T extends Record<string, unknown>>(obj: T) => Object.keys(obj) as [keyof T & string, ...(keyof T & string)[]];

/** Array whose invalid entries are dropped instead of failing the whole list. */
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

export const heatSiteSchema = z.object({
  station: z.string().max(60).nullable().catch(null),
  altitude: num(0, 5000),
  thetaEOverride: num(-40, 20),
  thetaMeanOverride: num(-20, 30),
  inertia: z.enum(inertiaModes).catch("medium"),
  tau: num(0, 10000),
  inertiaManual: num(-3, 0),
  airtight: z.enum(["new", "old"]).catch("new"),
  groundwater: z.enum(keys(groundwaterLevels)).catch("far"),
  frostProtection: z.boolean().catch(true),
});

export const defaultHeatSite: HeatSite = heatSiteSchema.parse({});

export const constructionSchema = z.object({
  id,
  code: text(20),
  name: text(120),
  kind: z.enum(constructionKinds),
  value: num(0, 100),
  groundType: z.enum(["wall", "floor"]).catch("floor"),
  slabArea: num(0, 1000000),
  perimeter: num(0, 100000),
  depth: num(0, 50),
  ueqOverride: num(0, 10),
});

export const catalogSchema = lenientArray(constructionSchema, 200);

const elementSchema = z.object({
  id,
  constructionId: z.string().max(40).nullable().catch(null),
  orientation: text(4),
  adjacency: z.enum(adjacencies).catch("outside"),
  width: num(0, 10000),
  length: num(0, 10000),
  count: num(0, 10000),
  deduction: num(0, 100000),
  areaOverride: num(0, 100000),
  neighbourMode: z.enum(["temperature", "table4", "room"]).catch("temperature"),
  neighbourTemp: num(-40, 60),
  neighbourRoomId: z.string().max(40).nullable().catch(null),
  table4: z.enum(keys(f1Table4)).catch("side1"),
  table4HighAirChange: z.boolean().catch(false),
  height: num(0, 100),
  heatedSurface: z.boolean().catch(false),
});

const roomSchema = z.object({
  id,
  number: text(20),
  name: text(120),
  floor: text(20),
  kind: z.enum(["heated", "passive"]).catch("heated"),
  thetaInt: num(-10, 40),
  area: num(0, 100000),
  height: num(0, 100),
  volume: num(0, 1000000),
  roomType: z.string().max(20).catch("exterior"),
  nMinOverride: num(0, 20),
  standing: z.boolean().catch(false),
  emission: z.enum(keys(emissionSystems)).catch("radiators"),
  gains: num(0, 1000000),
  elements: lenientArray(elementSchema, 200),
});

export const heatLoadSchema = z.object({
  concept: z.enum(ventilationConcepts).catch("natural"),
  fiz: num(0, 1),
  rooms: lenientArray(roomSchema, 500),
  notes: text(20000),
});

export const parseHeatLoad = (value: unknown): HeatLoadData => heatLoadSchema.catch(() => heatLoadSchema.parse({})).parse(value ?? {});

export const emptyHeatLoad = (): HeatLoadData => parseHeatLoad({});
