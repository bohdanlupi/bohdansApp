import { z } from "zod";

import { emitterTypes, type GeneratorType, generatorTypes } from "./plan-schema";

// Wärmeerzeugungsanlage (heating_plants.data), chapter 242 Wärmeerzeugung in four sectors: Wärmequelle (generators),
// Warmwasser, Energiespeicher, Verteiler with the Heizgruppen. Parsed leniently: broken fields fall back to defaults,
// fields not known to this version are dropped on save.

/**
 * Hydraulic circuits of a Heizgruppe: Drosselschaltung, Umlenkschaltung, Beimischschaltung, Einspritzschaltung mit
 * Dreiwegventil, Einspritzschaltung mit Durchgangsventil.
 */
export const circuitTypes = ["throttle", "diverting", "mixing", "injection3", "injection2"] as const;
/** Verteiler with differential pressure (Hauptpumpe) or without (drucklos, decoupled by bypass or Speicher). */
export const distributorTypes = ["pressurized", "unpressurized"] as const;

/** Connection of the Wassererwärmer: Umschaltventil in the main, separately at a generator, at a Heizgruppe. */
export const hotWaterConnections = ["diverter", "generator", "group"] as const;

export type CircuitType = (typeof circuitTypes)[number];
export type HotWaterConnection = (typeof hotWaterConnections)[number];
export type DistributorType = (typeof distributorTypes)[number];

const set = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .array(z.unknown())
    .transform((list): T[number][] => values.filter((v) => list.includes(v)))
    .catch([]);
const num = (min: number, max: number) => z.number().finite().min(min).max(max).nullable().catch(null);

const groupSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(80).catch(""),
  circuit: z.enum(circuitTypes).catch("mixing"),
  emitter: z.enum(emitterTypes).nullable().catch(null),
  /** Heat output [kW]. */
  power: num(0, 100000),
  /** Design supply / return temperature [°C]. */
  supplyTemp: num(0, 150),
  returnTemp: num(0, 150),
  heatMeter: z.boolean().catch(false),
});

export type HeatingGroup = z.infer<typeof groupSchema>;

export const plantSchema = z.object({
  /** Heat generators of the Anlage (Wärmequelle), connected in parallel. */
  generators: set(generatorTypes),
  /** The Anlage also cools (e.g. reversible heat pump, free cooling via the borehole heat exchangers). */
  cooling: z.boolean().catch(false),
  /** Wassererwärmer charged by the Anlage (Umschaltventil in the supply). */
  hotWater: z.boolean().catch(false),
  hotWaterVolume: num(0, 100000),
  /**
   * How the Wassererwärmer is loaded: Umschaltventil in the supply main, separately at a generator with its own
   * Ladepumpe, or as the consumer of a Heizgruppe (WW-Ladegruppe on the Verteiler).
   */
  hotWaterConnection: z.enum(hotWaterConnections).catch("diverter"),
  /** Generator of the separate connection (null = the first one). */
  hotWaterGenerator: z.enum(generatorTypes).nullable().catch(null),
  /** Id of the Heizgruppe loading the Wassererwärmer. */
  hotWaterGroup: z.string().max(64).nullable().catch(null),
  /** Energy storage (technischer Speicher) present. */
  storage: z.boolean().catch(false),
  storageVolume: num(0, 1000000),
  distributor: z.enum(distributorTypes).catch("unpressurized"),
  groups: z
    .array(z.unknown())
    .catch([])
    .transform((list) =>
      list.slice(0, 40).flatMap((g) => {
        const parsed = groupSchema.safeParse(g);
        return parsed.success ? [parsed.data] : [];
      }),
    ),
  notes: z.string().max(4000).catch(""),
});

export type PlantData = z.infer<typeof plantSchema> & { generators: GeneratorType[] };

export const emptyPlant = (): PlantData => plantSchema.parse({});
export const parsePlant = (value: unknown): PlantData => plantSchema.catch(emptyPlant).parse(value ?? {});

/** Circuits that need a differential pressure on the Verteiler (no own group pump on the primary side). */
export const needsPressure = (circuit: CircuitType) => circuit !== "mixing";

/** The Schaltung does not suit the Verteiler: Beimischung on a druckbehafteten, the others on a drucklosen one. */
export const circuitMismatch = (circuit: CircuitType, distributor: DistributorType) =>
  needsPressure(circuit) !== (distributor === "pressurized");
