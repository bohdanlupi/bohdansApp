import { z } from "zod";

import { airtightnessClasses, fireplaceTypes, frostVariants, kitchenConcepts, noiseLevels, systemTypes } from "./sia3825";

// KWL-Planung of a project (ventilation_plans.data): design criteria, checklist states, inputs of the
// phase calculations and commissioning measurements. Parsed leniently: broken fields fall back to defaults.

const num = (min: number, max: number, fallback: number | null = null) =>
  z.number().finite().min(min).max(max).nullable().catch(fallback);
const text = (max: number) => z.string().max(max).catch("");
const bool = z.boolean().catch(false);

/** Record whose invalid entries are dropped one by one (instead of losing the whole record). */
const lenientRecord = <T extends z.ZodType>(value: T, keyMax = 60) =>
  z
    .record(z.string(), z.unknown())
    .transform((obj) => {
      const out: Record<string, z.infer<T>> = {};
      for (const [key, raw] of Object.entries(obj)) {
        const parsed = value.safeParse(raw);
        if (key.length <= keyMax && parsed.success) out[key] = parsed.data;
      }
      return out;
    })
    .catch({});

export const planParamsSchema = z.object({
  buildingType: z.enum(["efh", "mfh"]).catch("mfh"),
  construction: z.enum(["new", "renovation"]).catch("new"),
  system: z.enum(systemTypes).catch("balanced"),
  unit: z.enum(["single", "multi"]).catch("single"),
  operation: z.enum(["continuous", "demand"]).catch("continuous"),
  dwellings: num(1, 10000),
  simultaneity: num(0.7, 1),
  standard: z.enum(["standard", "minergie"]).catch("standard"),
  altitude: num(0, 5000),
  storeys: z.enum(["one", "two"]).catch("one"),
  fireplace: z.enum(fireplaceTypes).catch("none"),
  kitchen: z.enum(kitchenConcepts).catch("recirculationHood"),
  airtightness: z.enum([...airtightnessClasses, "unknown"]).catch("unknown"),
  noise: z.enum(noiseLevels).catch("increased"),
  frost: z
    .enum(frostVariants.map((v) => v.code) as [string, ...string[]])
    .nullable()
    .catch(null),
  radon: bool,
  strongWind: bool,
  fog: bool,
  publicIntake: bool,
  electricityPrice: num(0, 10, 0.3),
});

export const dwellingTypeSchema = z.object({
  id: z.string().min(1).max(40),
  name: text(120),
  count: num(0, 10000),
  rooms: num(0, 50),
  baths: num(0, 20),
  wcs: num(0, 20),
  shortUse: num(0, 20),
  closedKitchen: bool,
});

const checkSchema = z.object({
  s: z.enum(["done", "na", "open"]),
  n: text(1000).optional(),
});

const measurementSchema = z.object({
  supply: num(0, 100000),
  extract: num(0, 100000),
  laeq: num(0, 150),
});

export const planDataSchema = z.object({
  params: planParamsSchema.catch(() => planParamsSchema.parse({})),
  /** Vorprojekt rough sizing by dwelling type. */
  dwellingTypes: z
    .array(z.unknown())
    .transform((list) =>
      list.slice(0, 100).flatMap((raw) => {
        const parsed = dwellingTypeSchema.safeParse(raw);
        return parsed.success ? [parsed.data] : [];
      }),
    )
    .catch([]),
  /** Checklist item id → state. Missing = open. */
  checks: lenientRecord(checkSchema),
  /** Free inputs of the phase calculators (key → number). */
  inputs: lenientRecord(z.number().finite().nullable()),
  /** Commissioning: calc id → room id → measured values, plus measured power per calc. */
  measurements: lenientRecord(
    z.object({
      rooms: lenientRecord(measurementSchema, 40),
      power: num(0, 100000),
    }),
    40,
  ),
  notes: lenientRecord(z.string().max(4000), 10),
});

export type PlanData = z.infer<typeof planDataSchema>;
export type PlanParams = PlanData["params"];
export type DwellingType = z.infer<typeof dwellingTypeSchema>;

export const defaultPlanParams: PlanParams = planParamsSchema.parse({});

export const parsePlanData = (value: unknown): PlanData => planDataSchema.parse(value ?? {});
