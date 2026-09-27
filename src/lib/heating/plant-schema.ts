import { z } from "zod";

import { type GeneratorType, generatorTypes } from "./plan-schema";

// Wärmeerzeugungsanlage (heating_plants.data), chapter 242: System (generators), Warmwasser, Energiespeicher,
// Gruppen. Parsed leniently: broken fields fall back to defaults. The subchapters are filled one by one; fields
// not known to this version are dropped on save.

const set = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .array(z.unknown())
    .transform((list): T[number][] => values.filter((v) => list.includes(v)))
    .catch([]);

export const plantSchema = z.object({
  /** Heat generators of the Anlage (242 System). */
  generators: set(generatorTypes),
  /** The Anlage also cools (e.g. reversible heat pump, free cooling via the borehole heat exchangers). */
  cooling: z.boolean().catch(false),
  /** Energy storage present (242 Energiespeicher). */
  storage: z.boolean().catch(false),
  notes: z.string().max(4000).catch(""),
});

export type PlantData = z.infer<typeof plantSchema> & { generators: GeneratorType[] };

export const emptyPlant = (): PlantData => plantSchema.parse({});
export const parsePlant = (value: unknown): PlantData => plantSchema.catch(emptyPlant).parse(value ?? {});
