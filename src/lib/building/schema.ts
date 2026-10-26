import { z } from "zod";

// Gebäudemodell of a project (building_models.data): Geschosse, rooms traced along the inner wall faces and the thermal
// envelope traced along the external face, both over the plan of their Geschoss. Lenient parsing: invalid list entries
// are dropped, invalid fields fall back to defaults. Geometry is stored in the pixel coordinates of the plan snapshot
// (building_plans), see geometry.ts; the envelope ↔ room matching lives in envelope.ts.

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
};

/** What lies beyond an envelope segment (SIA 384/2 adjacency without «heated», which is an interior partition). */
export const envelopeAdjacencies = ["outside", "unheated", "ground"] as const;
export type EnvelopeAdjacency = (typeof envelopeAdjacencies)[number];

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
  openings: Opening[];
};

export type BuildingEnvelope = {
  id: string;
  floor: string;
  vertices: EnvelopeVertex[];
};

export type BuildingModel = {
  floors: BuildingFloor[];
  rooms: BuildingRoom[];
  envelopes: BuildingEnvelope[];
  notes: string;
};

const num = (min: number, max: number) => z.number().finite().min(min).max(max).nullable().catch(null);
const text = (max: number) => z.string().max(max).catch("");
const id = z.string().min(1).max(40);

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
});

const openingSchema = z.object({
  id,
  kind: z.enum(openingKinds).catch("window"),
  at: z.number().finite().min(0).max(1).catch(0),
  width: num(0.1, 50),
  height: num(0.1, 20),
  count: num(1, 100),
  constructionId: id.nullable().catch(null),
});

const vertexSchema = z.object({
  id,
  p: pointSchema,
  constructionId: id.nullable().catch(null),
  adjacency: z.enum(envelopeAdjacencies).catch("outside"),
  orientation: z.string().max(2).nullable().catch(null),
  tolerance: num(0.05, 3),
  openings: lenientArray(openingSchema, 50),
});

const envelopeSchema = z.object({
  id,
  floor: text(40),
  vertices: lenientArray(vertexSchema, 500),
});

export const buildingModelSchema = z.object({
  floors: lenientArray(floorSchema, 50),
  rooms: lenientArray(roomSchema, 2000),
  envelopes: lenientArray(envelopeSchema, 50),
  notes: text(4000),
});

export const parseBuildingModel = (value: unknown): BuildingModel => buildingModelSchema.catch(() => buildingModelSchema.parse({})).parse(value ?? {});
export const emptyBuildingModel = (): BuildingModel => parseBuildingModel({});

/** Default Geschosse of a new model (UG, EG, OG). */
export const defaultFloors = (): BuildingFloor[] => [
  { key: "ug", name: "UG", level: -1, height: 2.4, storeyHeight: 2.7, wallThickness: 0.5, windowHeight: 1.0 },
  { key: "eg", name: "EG", level: 0, height: 2.5, storeyHeight: 2.8, wallThickness: 0.5, windowHeight: 1.3 },
  { key: "og1", name: "1. OG", level: 1, height: 2.5, storeyHeight: 2.8, wallThickness: 0.5, windowHeight: 1.3 },
];

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
  openings: [],
});

/** Plan calibration of a Geschoss as the editor needs it (building_plans row). */
export type PlanInfo = {
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
  originX: number;
  originY: number;
};
