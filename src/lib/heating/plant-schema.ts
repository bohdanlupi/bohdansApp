import { z } from "zod";

import { brineMedia, envelopeFactors, regenerationRates, requirementClasses, rockTypes } from "./ews-data";
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
/**
 * How the Wassererwärmer is loaded: Umschaltventil in the supply main; separate Vorlauf from the generator, switched
 * inside it, the Rücklauf straight into the main (internal); separate Vorlauf and Rücklauf at the generator with a
 * Ladepumpe (generator); as the consumer of a Heizgruppe (group).
 */
export const hotWaterConnections = ["diverter", "internal", "generator", "group"] as const;
/** Heating of the Wassererwärmer: innenliegendes Register or aussenliegender Wärmetauscher (Platten-WT + Ladepumpe). */
export const hotWaterHeaters = ["coil", "external"] as const;
/** Innenliegende Register: one; two with the lower / upper one connected; two connected in series. */
export const hotWaterCoilTypes = ["single", "lower", "upper", "series"] as const;
/** Energiespeicher: konventionell (VL and RL through the Speicher) or reduziert (VL teed off, RL through it). */
export const storageConnections = ["conventional", "reduced"] as const;
/**
 * Temperaturfühler / Thermostat of the Wassererwärmer and the Technischer Speicher: Tauchfühler from the top (down to
 * 2/3 of the height), one Tauchfühler or a Thermostat on the side in the middle, two Tauchfühler (Ein & Aus) on the
 * side at 1/3 and 2/3 of the height.
 */
export const tankSensors = ["none", "topProbe", "sideProbe", "sideThermostat", "onOff"] as const;
export type TankSensor = (typeof tankSensors)[number];

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
  /** Sicherheitsthermostat (Anlegethermostat) in the Vorlauf below the Vorlauffühler, e.g. for a Fussbodenheizung. */
  safetyThermostat: z.boolean().catch(false),
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
  /** Spreizung VL – RL at the generator [K] (null = by type, see hydraulics.ts). */
  deltaT: num(1, 60),
  /**
   * Pumps built into the generator: Quellenpumpe (Sole- / Zwischenkreis of a Sole/Wasser- or Wasser/Wasser-WP),
   * Heizungspumpe, WW-Ladepumpe of the separate Warmwasser connection. They are neither drawn nor in the Materialauszug.
   */
  internalPumps: z
    .object({ source: z.boolean().catch(false), heating: z.boolean().catch(false), hotWater: z.boolean().catch(false) })
    .catch({ source: false, heating: false, hotWater: false }),
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

const layerSchema = z.object({
  id: z.string().min(1).max(64),
  /** Gesteinstyp of Tabelle 11 / 12 (null = own values). */
  rock: z.enum(Object.keys(rockTypes) as [keyof typeof rockTypes, ...(keyof typeof rockTypes)[]]).nullable().catch(null),
  thickness: z.number().finite().min(0).max(1000).catch(0),
  lambda: z.number().finite().min(0.1).max(10).catch(2),
  rhoC: z.number().finite().min(0.1).max(5).catch(2),
});

export type GroundLayer = z.infer<typeof layerSchema>;

/** Erdwärmesonden after SIA 384/6 (inputs; results in ews.ts). Null = default from the project or the norm. */
const ewsSchema = z.object({
  diameter: z.union([z.literal(32), z.literal(40)]).catch(32),
  probes: z.number().int().min(1).max(50).catch(1),
  /** 4 EWS in a 2 × 2 square instead of a line. */
  square: z.boolean().catch(false),
  spacing: z.number().finite().min(1).max(50).catch(10),
  /** Sondenverteiler: none (probes straight to the WP), in the Technikraum or outside the building. */
  distributor: z.enum(["none", "inside", "outside"]).catch("none"),
  /** Maximum Bohrtiefe of the permit [m]. */
  maxDepth: num(0, 2000),
  layers: z
    .array(z.unknown())
    .catch([])
    .transform((list) =>
      list.slice(0, 20).flatMap((l) => {
        const parsed = layerSchema.safeParse(l);
        return parsed.success ? [parsed.data] : [];
      }),
    ),
  altitude: num(0, 5000),
  thetaMean: num(-20, 30),
  /** Bodenoberflächentemperatur for the Heizfall, if measured [°C]. */
  thetaGs: num(-20, 30),
  side: z.enum(["north", "south"]).catch("north"),
  gradient: z.number().finite().min(0).max(0.2).catch(0.03),
  heatLoad: num(0, 100000),
  /** Wärmepumpe at the Auslegepunkt B0W35: Heizleistung, Kälteleistung; Heizleistung for Warmwasser (B0W55) [kW]. */
  heatingCapacity: num(0, 100000),
  coolingCapacity: num(0, 100000),
  heatingCapacityHotWater: num(0, 100000),
  hotWater: z.boolean().catch(true),
  hotWaterLitres: z.number().finite().min(0).max(1000000).catch(0),
  hotWaterTemp: z.number().finite().min(0).max(100).catch(55),
  coldWaterTemp: z.number().finite().min(0).max(40).catch(10),
  regeneration: z.enum(regenerationRates).catch("none"),
  /** Anforderung R1–R4 (null = from the neighbour probes, else R1). */
  requirement: z.enum(requirementClasses).nullable().catch(null),
  neighbours: z
    .object({
      enabled: z.boolean().catch(false),
      gsf: num(0, 10000000),
      asf: num(0, 10000000),
      aff: num(0, 10000000),
      energyArea: num(0, 10000000),
      category: z.enum(Object.keys(envelopeFactors) as [keyof typeof envelopeFactors, ...(keyof typeof envelopeFactors)[]]).catch("mfh"),
      /** Q_H,li0 and ΔQ_H,li after SIA 380/1:2016 Tabelle 6, Q_W after Tabelle 27 [kWh/m²]. */
      qHli0: num(0, 1000),
      dqHli: num(0, 1000),
      qW: num(0, 1000),
      fGeo: num(0, 100),
      f50m: num(0, 100),
    })
    .catch(() => ({ enabled: false, gsf: null, asf: null, aff: null, energyArea: null, category: "mfh" as const, qHli0: null, dqHli: null, qW: null, fGeo: null, f50m: null })),
  medium: z.enum(Object.keys(brineMedia) as [keyof typeof brineMedia, ...(keyof typeof brineMedia)[]]).catch("eg25"),
  cp: num(1, 5),
  /** Temperature difference at the evaporator [K] (3.4.4.5: 3–4 K, max. 5 K). */
  deltaT: z.number().finite().min(0.5).max(10).catch(3),
  /** Zuleitung EWS – Verteiler (single length) and Solekreisleitung Verteiler – WP; PE SDR 11 outer diameter. */
  feedLength: z.number().finite().min(0).max(10000).catch(10),
  feedDn: z.number().int().catch(40),
  mainLength: z.number().finite().min(0).max(10000).catch(10),
  mainDn: z.number().int().catch(50),
  distributorLoss: num(0, 1000),
  evaporatorLoss: num(0, 1000),
  pumpEfficiency: z.number().finite().min(0.05).max(1).catch(0.3),
  /** Further contents (Verdampfer, Verteiler) [l]. */
  extraVolume: num(0, 100000),
  vesselPrePressure: z.number().finite().min(0).max(10).catch(1),
  vesselMaxPressure: z.number().finite().min(0.5).max(20).catch(3),
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
  /** Elektroeinsatz of the Wassererwärmer [kW] (0 = none); sizes its Sicherheitsventil. */
  hotWaterElectric: z.number().finite().min(0).max(1000).catch(9),
  /**
   * How the Wassererwärmer is loaded: Umschaltventil in the supply main, separately at a generator with its own
   * Ladepumpe, or as the consumer of a Heizgruppe (WW-Ladegruppe on the Verteiler).
   */
  hotWaterConnection: z.enum(hotWaterConnections).catch("diverter"),
  hotWaterHeater: z.enum(hotWaterHeaters).catch("coil"),
  hotWaterCoils: z.enum(hotWaterCoilTypes).catch("single"),
  hotWaterSensor: z.enum(tankSensors).catch("none"),
  /** Thermometers on the Wassererwärmer (0–3, centred at 1/2 – 1/3 and 2/3 – 1/3, 1/2 and 2/3 of its height). */
  hotWaterThermometers: z.number().int().min(0).max(3).catch(0),
  /** Id of the generator of the separate connection (null = the first one). */
  hotWaterGenerator: z.string().max(64).nullable().catch(null),
  /** Id of the Heizgruppe loading the Wassererwärmer. */
  hotWaterGroup: z.string().max(64).nullable().catch(null),
  /** Energy storage (technischer Speicher) present. */
  storage: z.boolean().catch(false),
  storageVolume: num(0, 1000000),
  storageConnection: z.enum(storageConnections).catch("conventional"),
  storageSensor: z.enum(tankSensors).catch("none"),
  /** Thermometers on the Technischer Speicher (as on the Wassererwärmer). */
  storageThermometers: z.number().int().min(0).max(3).catch(0),
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
  ews: ewsSchema.catch(() => ewsSchema.parse({})),
  /** DN chosen by hand per circuit (key from hydraulics.ts), instead of the calculated one. */
  dn: z.record(z.string().max(80), z.number().int().min(10).max(200)).catch({}),
  /** Single pipe length per circuit [m] (key from hydraulics.ts); VL + RL give its content. */
  lengths: z.record(z.string().max(80), z.number().finite().min(0).max(100000)).catch({}),
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
    generators: raw.generators.map((g) => (typeof g === "string" ? { id: g, type: g, name: "", power: typeof powers[g] === "number" ? powers[g] : null, deltaT: null } : g)),
  };
}

export const emptyPlant = (): PlantData => plantSchema.parse({});
export const parsePlant = (value: unknown): PlantData => plantSchema.catch(emptyPlant).parse(migrate(value ?? {}));

/** Types of the generators, without duplicates (checklists). */
export const generatorTypesOf = (data: PlantData): GeneratorType[] => generatorTypes.filter((t) => data.generators.some((g) => g.type === t));

/** Generator with the separate Warmwasser connection (its own Ladepumpe), null with another connection. */
export const hotWaterUnit = (data: PlantData): GeneratorUnit | null =>
  data.hotWater && (data.hotWaterConnection === "generator" || data.hotWaterConnection === "internal")
    ? (data.generators.find((u) => u.id === data.hotWaterGenerator) ?? data.generators[0] ?? null)
    : null;

/**
 * Pumps built into a generator: as chosen, and with «Separater Vorlauf, Umschaltung intern» the Heizungs- and the
 * WW-Ladepumpe of the loading generator (forced). Such pumps are neither drawn nor in the Materialauszug.
 */
export function pumpsInside(data: PlantData, unit: GeneratorUnit) {
  const forced = data.hotWaterConnection === "internal" && hotWaterUnit(data)?.id === unit.id;
  return { source: unit.internalPumps.source, heating: unit.internalPumps.heating || forced, hotWater: unit.internalPumps.hotWater || forced, forced };
}

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
