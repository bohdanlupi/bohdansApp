import { z } from "zod";

import { usageCategoryKeys } from "./sia3801-data";

// Gebäudemodell of a project (building_models.data): Geschosse, rooms traced along the inner wall faces and the thermal
// envelope traced along the external face, both over the plan of their Geschoss; zones (SIA 380/1 Gebäudekategorie) and
// the climate set. Lenient parsing: invalid list entries are dropped, invalid fields fall back to defaults. Geometry is
// stored in the pixel coordinates of the plan snapshot (building_plans), see geometry.ts; the envelope ↔ room matching
// lives in envelope.ts, the storey stacking in stack.ts, the SIA 380/1 balance in sia3801.ts.

/** What lies beyond an envelope segment or slab (SIA 384/2 adjacency without «heated», which is an interior partition). */
export const envelopeAdjacencies = ["outside", "unheated", "ground"] as const;
export type EnvelopeAdjacency = (typeof envelopeAdjacencies)[number];

/** SIA 380/1 Tabelle 17: unheated room behind an element → b [not insulated, insulated and airtight]. */
export const unheatedCases = {
  attic: [0.9, 0.7],
  cellarBelow: [0.7, 0.5],
  cellarAbove: [0.8, 0.7],
  annex: [0.8, 0.7],
  glazed: [0.9, 0.9],
} as const;
export type UnheatedCase = keyof typeof unheatedCases;
export const unheatedCaseKeys = Object.keys(unheatedCases) as UnheatedCase[];

export type BuildingFloor = {
  /** Stable key, referenced by rooms, envelopes and building_plans.floor. */
  key: string;
  name: string;
  /** Storey level for sorting (0 = EG, -1 = UG, 1 = 1. OG …). */
  level: number;
  /** Lichte Raumhöhe [m] of the rooms without their own height (net volume). */
  height: number | null;
  /** Geschosshöhe [m] (floor surface to floor surface) for the external wall areas; null = lichte Höhe + 0.3. */
  storeyHeight: number | null;
  /** Matching tolerance envelope ↔ room = thickness of the exterior walls [m]. */
  wallThickness: number | null;
  /** Default height of windows drawn on this Geschoss [m]. */
  windowHeight: number | null;
  /** Floor area not above another drawn room: what lies below, its construction, b case when unheated. */
  floorAdjacency: EnvelopeAdjacency;
  floorConstructionId: string | null;
  floorUnheatedCase: UnheatedCase;
  floorUnheatedInsulated: boolean;
  /** Ceiling area not below another drawn room (roof): what lies above. */
  ceilingAdjacency: EnvelopeAdjacency;
  ceilingConstructionId: string | null;
  ceilingUnheatedCase: UnheatedCase;
  ceilingUnheatedInsulated: boolean;
  /** Slab between rooms of this and the next storey, and interior walls between rooms (both only where heat flows). */
  slabConstructionId: string | null;
  partitionConstructionId: string | null;
};

export const roomKinds = ["heated", "passive"] as const;
export type RoomKind = (typeof roomKinds)[number];

export type BuildingRoom = {
  id: string;
  number: string;
  name: string;
  floor: string;
  /** Polygon along the inner wall faces, snapshot px. */
  polygon: [number, number][];
  kind: RoomKind;
  thetaInt: number | null;
  /** Own lichte Höhe [m]; null = height of the Geschoss. */
  height: number | null;
  /** SIA 380/1 zone; null = the only zone of the model. */
  zoneId: string | null;
  /** Passive rooms: Tabelle 17 case for elements of heated rooms towards this room. */
  unheatedCase: UnheatedCase;
  unheatedInsulated: boolean;
  /** SIA 2024 Raumnutzung code (1.01 …); null = none. */
  usage: string | null;
};

export const openingKinds = ["window", "door"] as const;
export type OpeningKind = (typeof openingKinds)[number];

export type Opening = {
  id: string;
  kind: OpeningKind;
  /** Start along the segment, fraction 0…1 of its length. */
  at: number;
  /** Width along the wall [m] and height [m]; null height = Geschoss default (windows) or 2.1 m (doors). */
  width: number | null;
  height: number | null;
  count: number | null;
  constructionId: string | null;
  /** SIA 380/1 shading angles [°]: horizon, overhang, side fins left / right (null = 0). */
  horizon: number | null;
  overhang: number | null;
  finLeft: number | null;
  finRight: number | null;
};

/** Vertex of the envelope polygon; it also carries the attributes of the segment that starts here. */
export type EnvelopeVertex = {
  id: string;
  p: [number, number];
  constructionId: string | null;
  adjacency: EnvelopeAdjacency;
  /** Orientation override (N, NO, …); null = from the segment and the plan's north. */
  orientation: string | null;
  /** Matching tolerance override [m]; null = wall thickness of the Geschoss. */
  tolerance: number | null;
  /** Tabelle 17 case when the segment faces an unheated room. */
  unheatedCase: UnheatedCase;
  unheatedInsulated: boolean;
  openings: Opening[];
};

export type BuildingEnvelope = {
  id: string;
  floor: string;
  vertices: EnvelopeVertex[];
};

export const buildingStates = ["new", "renovation"] as const;
export const regulations = ["single", "reference", "other"] as const;
export type Regulation = (typeof regulations)[number];
/** Regelungszuschlag Δθ [K] (Tabelle 8). */
export const regulationSurcharge: Record<Regulation, number> = { single: 0, reference: 1, other: 2 };
export const constructionModes = ["heavy", "medium", "light", "veryLight"] as const;
export type ConstructionMode = (typeof constructionModes)[number];
/** Wärmespeicherfähigkeit C_R/A_E [kWh/(m²K)] (Tabelle 25). */
export const heatCapacity: Record<ConstructionMode, number> = { heavy: 0.15, medium: 0.08, light: 0.03, veryLight: 0.01 };

export type ThermalBridge = { id: string; name: string; psi: number | null; length: number | null; b: number | null };

/** SIA 380/1 Nutzungszone. */
export type BuildingZone = {
  id: string;
  name: string;
  category: (typeof usageCategoryKeys)[number];
  state: (typeof buildingStates)[number];
  /** Room temperature override [°C]; null = Standardnutzung. */
  thetaInt: number | null;
  regulation: Regulation;
  construction: ConstructionMode;
  /** Thermally effective outdoor air flow [m³/(h m²)]; null = Standardnutzung × (1 − η_WRG). */
  airflowOverride: number | null;
  wrgEfficiency: number | null;
  /** Thermal bridges: surcharge on Q_T [%] and / or detailed list. */
  bridgesPct: number | null;
  bridges: ThermalBridge[];
  /** Max. flow temperature of a floor heating (Bauteilheizung, Tabelle 16) [°C]; null = none. */
  floorHeatingFlow: number | null;
};

export const climateSetKeys = ["sia2028", "sia4028"] as const;
export type ClimateSetKey = (typeof climateSetKeys)[number];

export type BuildingModel = {
  floors: BuildingFloor[];
  rooms: BuildingRoom[];
  envelopes: BuildingEnvelope[];
  zones: BuildingZone[];
  climate: { set: ClimateSetKey; station: string | null };
  notes: string;
};

const num = (min: number, max: number) => z.number().finite().min(min).max(max).nullable().catch(null);
const text = (max: number) => z.string().max(max).catch("");
const id = z.string().min(1).max(40);
const bool = (d: boolean) => z.boolean().catch(d);
const unheatedCaseSchema = z.enum(unheatedCaseKeys as [UnheatedCase, ...UnheatedCase[]]);

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

const pointSchema = z.tuple([z.number().finite(), z.number().finite()]);

const floorSchema = z.object({
  key: id,
  name: text(60),
  level: z.number().int().min(-20).max(200).catch(0),
  height: num(0.5, 30),
  storeyHeight: num(0.5, 30),
  wallThickness: num(0.05, 3),
  windowHeight: num(0.2, 10),
  floorAdjacency: z.enum(envelopeAdjacencies).catch("unheated"),
  floorConstructionId: id.nullable().catch(null),
  floorUnheatedCase: unheatedCaseSchema.catch("cellarBelow"),
  floorUnheatedInsulated: bool(false),
  ceilingAdjacency: z.enum(envelopeAdjacencies).catch("outside"),
  ceilingConstructionId: id.nullable().catch(null),
  ceilingUnheatedCase: unheatedCaseSchema.catch("attic"),
  ceilingUnheatedInsulated: bool(false),
  slabConstructionId: id.nullable().catch(null),
  partitionConstructionId: id.nullable().catch(null),
});

const roomSchema = z.object({
  id,
  number: text(20),
  name: text(120),
  floor: text(40),
  polygon: lenientArray(pointSchema, 500),
  kind: z.enum(roomKinds).catch("heated"),
  thetaInt: num(-30, 60),
  height: num(0.5, 30),
  zoneId: id.nullable().catch(null),
  unheatedCase: unheatedCaseSchema.catch("cellarAbove"),
  unheatedInsulated: bool(false),
  usage: z.string().max(10).nullable().catch(null),
});

const openingSchema = z.object({
  id,
  kind: z.enum(openingKinds).catch("window"),
  at: z.number().finite().min(0).max(1).catch(0),
  width: num(0.1, 50),
  height: num(0.1, 20),
  count: num(1, 100),
  constructionId: id.nullable().catch(null),
  horizon: num(0, 90),
  overhang: num(0, 90),
  finLeft: num(0, 90),
  finRight: num(0, 90),
});

const vertexSchema = z.object({
  id,
  p: pointSchema,
  constructionId: id.nullable().catch(null),
  adjacency: z.enum(envelopeAdjacencies).catch("outside"),
  orientation: z.string().max(2).nullable().catch(null),
  tolerance: num(0.05, 3),
  unheatedCase: unheatedCaseSchema.catch("annex"),
  unheatedInsulated: bool(false),
  openings: lenientArray(openingSchema, 50),
});

const envelopeSchema = z.object({
  id,
  floor: text(40),
  vertices: lenientArray(vertexSchema, 500),
});

const bridgeSchema = z.object({ id, name: text(120), psi: num(0, 10), length: num(0, 10000), b: num(0, 1) });

const zoneSchema = z.object({
  id,
  name: text(120),
  category: z.enum(usageCategoryKeys).catch("II"),
  state: z.enum(buildingStates).catch("new"),
  thetaInt: num(5, 40),
  regulation: z.enum(regulations).catch("single"),
  construction: z.enum(constructionModes).catch("medium"),
  airflowOverride: num(0, 20),
  wrgEfficiency: num(0, 1),
  bridgesPct: num(0, 100),
  bridges: lenientArray(bridgeSchema, 100),
  floorHeatingFlow: num(20, 90),
});

export const buildingModelSchema = z.object({
  floors: lenientArray(floorSchema, 50),
  rooms: lenientArray(roomSchema, 2000),
  envelopes: lenientArray(envelopeSchema, 50),
  zones: lenientArray(zoneSchema, 20),
  climate: z.object({ set: z.enum(climateSetKeys).catch("sia2028"), station: z.string().max(80).nullable().catch(null) }).catch({ set: "sia2028", station: null }),
  notes: text(4000),
});

export const parseBuildingModel = (value: unknown): BuildingModel => buildingModelSchema.catch(() => buildingModelSchema.parse({})).parse(value ?? {});
export const emptyBuildingModel = (): BuildingModel => parseBuildingModel({});

const slabDefaults = {
  floorConstructionId: null,
  floorUnheatedCase: "cellarBelow" as UnheatedCase,
  floorUnheatedInsulated: false,
  ceilingAdjacency: "outside" as EnvelopeAdjacency,
  ceilingConstructionId: null,
  ceilingUnheatedCase: "attic" as UnheatedCase,
  ceilingUnheatedInsulated: false,
  slabConstructionId: null,
  partitionConstructionId: null,
};

export const newFloor = (key: string, name: string, level: number): BuildingFloor => ({
  key,
  name,
  level,
  height: 2.5,
  storeyHeight: 2.8,
  wallThickness: 0.5,
  windowHeight: 1.3,
  floorAdjacency: level < 0 ? "ground" : "unheated",
  ...slabDefaults,
});

/** Default Geschosse of a new model (UG, EG, OG). */
export const defaultFloors = (): BuildingFloor[] => [
  { ...newFloor("ug", "UG", -1), height: 2.4, storeyHeight: 2.7, windowHeight: 1.0 },
  newFloor("eg", "EG", 0),
  newFloor("og1", "1. OG", 1),
];

export const newZone = (id: string, name: string): BuildingZone => ({
  id,
  name,
  category: "II",
  state: "new",
  thetaInt: null,
  regulation: "single",
  construction: "medium",
  airflowOverride: null,
  wrgEfficiency: null,
  bridgesPct: null,
  bridges: [],
  floorHeatingFlow: null,
});

export const sortFloors = (floors: readonly BuildingFloor[]) => [...floors].sort((a, b) => b.level - a.level);

/** Geschosshöhe used for wall areas: entered, or lichte Höhe + 0.3 m. */
export const storeyHeightOf = (floor: BuildingFloor | null) => floor?.storeyHeight ?? (floor?.height === null || floor?.height === undefined ? null : floor.height + 0.3);

export const DEFAULT_WALL_THICKNESS = 0.5;
export const DEFAULT_DOOR_HEIGHT = 2.1;
export const DEFAULT_WINDOW_HEIGHT = 1.3;

/** Short random id for vertices and openings (the derived element sources are built from them). */
export const shortId = () => Math.random().toString(36).slice(2, 10);

export const newVertex = (p: [number, number], like?: EnvelopeVertex): EnvelopeVertex => ({
  id: shortId(),
  p,
  constructionId: like?.constructionId ?? null,
  adjacency: like?.adjacency ?? "outside",
  orientation: null,
  tolerance: like?.tolerance ?? null,
  unheatedCase: like?.unheatedCase ?? "annex",
  unheatedInsulated: like?.unheatedInsulated ?? false,
  openings: [],
});

export const newOpening = (at: number, width: number | null, constructionId: string | null): Opening => ({
  id: shortId(),
  kind: "window",
  at,
  width,
  height: null,
  count: null,
  constructionId,
  horizon: null,
  overhang: null,
  finLeft: null,
  finRight: null,
});

/** Text of the plan's PDF text layer at a position (snapshot px): room names, printed areas, dimensions. */
export type PlanLabel = { text: string; x: number; y: number };

export const planLabelsSchema = z
  .array(z.unknown())
  .transform((list) =>
    list.slice(0, 5000).flatMap((raw) => {
      const parsed = z.object({ text: z.string().min(1).max(200), x: z.number().finite(), y: z.number().finite() }).safeParse(raw);
      return parsed.success ? [parsed.data] : [];
    }),
  )
  .catch([]);

/** Plan calibration of a Geschoss as the editor needs it (building_plans row). */
export type PlanInfo = {
  labels: PlanLabel[];
  /** Smaller PNG for the plan PDF; null for plans uploaded before phase D (the snapshot is used). */
  previewPath: string | null;
  id: string;
  floor: string;
  name: string;
  page: number;
  width: number;
  height: number;
  /** Metres per snapshot pixel; null until calibrated. */
  scale: number | null;
  rotation: number;
  /** angleDeg of a vector pointing north on the snapshot; null until set. */
  north: number | null;
  /** Reference point (snapshot px) that all Geschosse share, for stacking rooms across storeys. */
  originX: number;
  originY: number;
};
