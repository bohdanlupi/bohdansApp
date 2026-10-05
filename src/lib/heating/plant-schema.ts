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

const closing = z.enum(["0.8", "0.9"]).catch("0.8");

/** Solekreis of a Sole/Wasser-WP: own Druckausdehnungsgefäss (HE301-01 3.2.4). */
const brineSchema = z.object({
  vsys: num(0, 1000000),
  glycol: z.enum(["ethylene", "propylene"]).catch("propylene"),
  share: z.number().catch(25),
  minTemp: z.number().finite().min(-40).max(20).catch(-5),
  regeneration: z.boolean().catch(false),
  height: num(0, 300),
  pSV: z.number().finite().min(0.5).max(40).catch(3),
  closing,
  pfin: num(0, 40),
  vn: num(0, 100000),
});

/** One Wärmeerzeuger of the Anlage; several of the same type are possible. */
const generatorSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(generatorTypes),
  /** Name in the schema (empty = type, numbered when the type occurs more than once). */
  name: z.string().max(60).catch(""),
  /** Nennwärmeleistung ΦN [kW] (HE301-01: Sicherheitsventil, Zuschlagsfaktor X). */
  power: num(0, 100000),
});

export type GeneratorUnit = z.infer<typeof generatorSchema>;

/** Sicherheitseinrichtungen after SWKI HE301-01 (inputs; results in safety.ts). */
const safetySchema = z.object({
  medium: z.enum(["water", "antifreeze30", "antifreeze40"]).catch("water"),
  /** Mittlere Auslegungstemperatur (VL + RL) / 2 [°C]; null = from the Heizgruppen. */
  meanTemp: num(0, 150),
  /** Anlageinhalt without Speicher [dm³]; null = Richtwert after Tabelle 13. */
  vsys: num(0, 1000000),
  /** Maximum Speichertemperatur [°C] (null = 60). */
  storageTemp: num(0, 150),
  /** Static height from the vessel connection to the highest consumer [m]. */
  height: num(0, 300),
  /** Maximum abgesicherte Vorlauftemperatur [°C] (Dampfdruck above 100 °C). */
  thetaMax: num(0, 150),
  pSV: z.number().finite().min(0.5).max(40).catch(3),
  closing,
  pfin: num(0, 40),
  /** Additional Vordruck with the vessel on the pressure side of the pump [bar]. */
  extraP0: num(0, 10),
  /** Chosen nominal volume [dm³]; null = next standard size. */
  vn: num(0, 100000),
  brine: brineSchema.catch(() => brineSchema.parse({})),
});

export const plantSchema = z.object({
  /** Heat generators of the Anlage (Wärmequelle), connected in parallel. */
  generators: z
    .array(z.unknown())
    .catch([])
    .transform((list) =>
      list.slice(0, 20).flatMap((g) => {
        const parsed = generatorSchema.safeParse(g);
        return parsed.success ? [parsed.data] : [];
      }),
    ),
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
  /** Id of the generator of the separate connection (null = the first one). */
  hotWaterGenerator: z.string().max(64).nullable().catch(null),
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
  safety: safetySchema.catch(() => safetySchema.parse({})),
  notes: z.string().max(4000).catch(""),
});

export type PlantData = z.infer<typeof plantSchema>;

/**
 * Older Anlagen stored the generators as a set of types and their power in safety.powers: each type becomes one
 * generator whose id is the type (so hotWaterGenerator, which held the type, still points to it).
 */
function migrate(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.generators) || !raw.generators.some((g) => typeof g === "string")) return raw;
  const powers = ((raw.safety as Record<string, unknown> | undefined)?.powers ?? {}) as Record<string, unknown>;
  return {
    ...raw,
    generators: raw.generators.map((g) => (typeof g === "string" ? { id: g, type: g, name: "", power: typeof powers[g] === "number" ? powers[g] : null } : g)),
  };
}

export const emptyPlant = (): PlantData => plantSchema.parse({});
export const parsePlant = (value: unknown): PlantData => plantSchema.catch(emptyPlant).parse(migrate(value ?? {}));

/** Types of the generators, without duplicates (checklists). */
export const generatorTypesOf = (data: PlantData): GeneratorType[] => generatorTypes.filter((t) => data.generators.some((g) => g.type === t));

/** Name of a generator: its own, else the type, numbered when the type occurs more than once. */
export function generatorName(units: GeneratorUnit[], unit: GeneratorUnit, typeName: (t: GeneratorType) => string): string {
  if (unit.name.trim()) return unit.name.trim();
  const same = units.filter((u) => u.type === unit.type);
  return same.length > 1 ? `${typeName(unit.type)} ${same.indexOf(unit) + 1}` : typeName(unit.type);
}

/** Circuits that need a differential pressure on the Verteiler (no own group pump on the primary side). */
export const needsPressure = (circuit: CircuitType) => circuit !== "mixing";

/** The Schaltung does not suit the Verteiler: Beimischung on a druckbehafteten, the others on a drucklosen one. */
export const circuitMismatch = (circuit: CircuitType, distributor: DistributorType) =>
  needsPressure(circuit) !== (distributor === "pressurized");
