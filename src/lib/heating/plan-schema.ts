import { z } from "zod";

import { checkSchema, lenientRecord } from "@/lib/planning";

// Heizungsplanung of a project (heating_plans.data): design criteria, checklist states and notes per SIA 108
// phase. Parsed leniently: broken fields fall back to defaults.

export const generatorTypes = ["hpAir", "hpBrine", "hpWater", "pellets", "logWood", "district", "gasOil"] as const;
export const emitterTypes = ["floor", "radiators", "tabs", "air"] as const;

export type GeneratorType = (typeof generatorTypes)[number];
export type EmitterType = (typeof emitterTypes)[number];

const num = (min: number, max: number) => z.number().finite().min(min).max(max).nullable().catch(null);
const bool = z.boolean().catch(false);
/** Set of enum values; unknown entries are dropped, duplicates removed. */
const set = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .array(z.unknown())
    .transform((list): T[number][] => values.filter((v) => list.includes(v)))
    .catch([]);

export const heatingParamsSchema = z.object({
  buildingType: z.enum(["efh", "mfh", "nonResidential"]).catch("mfh"),
  /** New building, renovation of the building, or replacement of the heat generator only. */
  construction: z.enum(["new", "renovation", "replacement"]).catch("new"),
  generators: set(generatorTypes),
  emitters: set(emitterTypes),
  standard: z.enum(["standard", "minergie"]).catch("standard"),
  /** Heat output of the generation in kW (rough value, for the thresholds of SIA 384/1 and HE301). */
  power: num(0, 100000),
  /** Energiebezugsfläche in m². */
  energyArea: num(0, 1000000),
  multiUnit: bool,
  storage: bool,
  cooling: bool,
});

export const heatingPlanSchema = z.object({
  params: heatingParamsSchema.catch(() => heatingParamsSchema.parse({})),
  /** Checklist item id → state. Missing = open. */
  checks: lenientRecord(checkSchema),
  notes: lenientRecord(z.string().max(4000), 10),
});

export type HeatingPlan = z.infer<typeof heatingPlanSchema>;
export type HeatingParams = HeatingPlan["params"];

export const parseHeatingPlan = (value: unknown): HeatingPlan => heatingPlanSchema.parse(value ?? {});
