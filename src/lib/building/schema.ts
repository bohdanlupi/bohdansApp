import { z } from "zod";

// Gebäudemodell of a project (building_models.data): Geschosse, rooms traced over the plan of their Geschoss. Lenient
// parsing: invalid list entries are dropped, invalid fields fall back to defaults. Geometry is stored in the pixel
// coordinates of the plan snapshot (building_plans), see geometry.ts.

export type BuildingFloor = {
  /** Stable key, referenced by rooms and by building_plans.floor. */
  key: string;
  name: string;
  /** Storey level for sorting (0 = EG, -1 = UG, 1 = 1. OG …). */
  level: number;
  /** Lichte Raumhöhe [m] of the rooms without their own height. */
  height: number | null;
  /** Matching tolerance envelope ↔ room = thickness of the exterior walls [m] (phase B). */
  wallThickness: number | null;
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

export type BuildingModel = {
  floors: BuildingFloor[];
  rooms: BuildingRoom[];
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
  wallThickness: num(0.05, 3),
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

export const buildingModelSchema = z.object({
  floors: lenientArray(floorSchema, 50),
  rooms: lenientArray(roomSchema, 2000),
  notes: text(4000),
});

export const parseBuildingModel = (value: unknown): BuildingModel => buildingModelSchema.catch(() => buildingModelSchema.parse({})).parse(value ?? {});
export const emptyBuildingModel = (): BuildingModel => parseBuildingModel({});

/** Default Geschosse of a new model (UG, EG, OG). */
export const defaultFloors = (): BuildingFloor[] => [
  { key: "ug", name: "UG", level: -1, height: 2.4, wallThickness: 0.5 },
  { key: "eg", name: "EG", level: 0, height: 2.5, wallThickness: 0.5 },
  { key: "og1", name: "1. OG", level: 1, height: 2.5, wallThickness: 0.5 },
];

export const sortFloors = (floors: readonly BuildingFloor[]) => [...floors].sort((a, b) => b.level - a.level);

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
