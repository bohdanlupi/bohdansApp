import { z } from "zod";

import { checkSchema, lenientRecord } from "@/lib/planning";

// Sanitärplanung of a project (sanitary_plans.data): design criteria, checklist states and notes per SIA 108
// phase. Parsed leniently: broken fields fall back to defaults.

export const sanitaryScopes = ["drinkingWater", "wastewater", "rainwater"] as const;
export const separatorTypes = ["grease", "oil"] as const;

export type SanitaryScope = (typeof sanitaryScopes)[number];

const num = (min: number, max: number) => z.number().finite().min(min).max(max).nullable().catch(null);
const bool = z.boolean().catch(false);
/** Set of enum values; unknown entries are dropped, duplicates removed. */
const set = <T extends readonly [string, ...string[]]>(values: T, fallback: T[number][] = []) =>
  z
    .array(z.unknown())
    .transform((list): T[number][] => values.filter((v) => list.includes(v)))
    .catch(fallback);

export const sanitaryParamsSchema = z.object({
  /** Trades of the mandate; checklist items of trades not in scope are marked as not applicable. */
  scope: set(sanitaryScopes, [...sanitaryScopes]),
  buildingType: z.enum(["efh", "mfh", "nonResidential"]).catch("mfh"),
  construction: z.enum(["new", "renovation"]).catch("new"),
  /** Hygiene-sensitive use (Spitäler, Alters- und Pflegeheime, Hotels, Sportanlagen) after SVGW W3/E3. */
  use: z.enum(["residential", "sensitive"]).catch("residential"),
  /** Number of Nutzeinheiten (dwellings) – W3 simultaneity, Wasserzählung. */
  units: num(1, 10000),
  /** Trinkwarmwasser: central Wassererwärmer, decentral (Durchlauferhitzer per Nutzeinheit) or both. */
  dhw: z.enum(["central", "decentral", "mixed"]).catch("central"),
  heater: z.enum(["storage", "instant"]).catch("storage"),
  /** Warmhaltung of the PWH distribution. */
  warmKeeping: z.enum(["circulation", "traceHeating", "none"]).catch("circulation"),
  /** Heat source of the Wassererwärmer (Wärmepumpe / Solar need their own checks). */
  heatSource: z.enum(["boiler", "heatPump", "solar", "electric", "district"]).catch("heatPump"),
  pressureBoost: bool,
  pressureReduce: bool,
  waterTreatment: bool,
  rainwaterUse: bool,
  /** Wasserlöschposten / Innenhydranten after SVGW W3 Kapitel 9 (no sprinklers). */
  fireWater: bool,
  /** Wasserversorgung einer Sprinkleranlage im Auftrag (VKF BSR 19-15). */
  sprinklerSupply: bool,
  /** Entwässerung: Ablaufstellen unterhalb der Rückstauebene. */
  belowBackflowLevel: bool,
  liftingStation: bool,
  separators: set(separatorTypes),
  infiltration: bool,
  retention: bool,
  flatRoof: bool,
  undergroundGarage: bool,
  /** Schallschutz requirement level after SIA 181 (Mindestanforderungen or erhöhte Anforderungen). */
  noise: z.enum(["minimum", "increased"]).catch("minimum"),
});

export const sanitaryPlanSchema = z.object({
  params: sanitaryParamsSchema.catch(() => sanitaryParamsSchema.parse({})),
  /** Checklist item id → state. Missing = open. */
  checks: lenientRecord(checkSchema),
  notes: lenientRecord(z.string().max(4000), 10),
  /** Items set to «nicht zutreffend» or excluded by the criteria are hidden in the phase pages. */
  hideNa: bool,
});

export type SanitaryPlan = z.infer<typeof sanitaryPlanSchema>;
export type SanitaryParams = SanitaryPlan["params"];

export const parseSanitaryPlan = (value: unknown): SanitaryPlan => sanitaryPlanSchema.parse(value ?? {});
