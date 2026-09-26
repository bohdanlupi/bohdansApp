import { z } from "zod";

import { floorPipes, floorSpacings, type FloorSystemData, insulationThicknesses } from "./floor";

// Lenient parsing of a floor heating system (heating_systems.data): invalid rooms / distributors are dropped one by one.

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

const roomSchema = z.object({
  id,
  calcId: z.string().max(40).nullable().catch(null),
  roomId: z.string().max(40).nullable().catch(null),
  name: text(120),
  load: num(0, 1000000),
  area: num(0, 100000),
  roomTemp: num(0, 40),
  covering: num(0, 1),
  edgeArea: num(0, 100000),
  gain: num(0, 1000000),
  belowTemp: num(-40, 60),
  supplyLength: num(0, 1000),
  rings: z.number().int().min(1).max(20).nullable().catch(null),
  spacingOverride: z
    .number()
    .refine((v) => floorSpacings.includes(v))
    .nullable()
    .catch(null),
  bath: z.boolean().catch(false),
});

const distributorSchema = z.object({ id, name: text(80), rooms: lenientArray(roomSchema, 100) });

export const floorSystemSchema = z.object({
  calcIds: z.array(z.string().max(40)).max(50).catch([]),
  spread: z.number().finite().min(2).max(20).catch(10),
  pipe: z.enum(floorPipes as [string, ...string[]]).catch("17/13"),
  designSpacing: z
    .number()
    .refine((v) => floorSpacings.includes(v))
    .catch(30),
  flowOverride: num(15, 60),
  insulation: z
    .number()
    .refine((v) => (insulationThicknesses as readonly number[]).includes(v))
    .catch(40),
  maxRingLength: z.number().finite().min(20).max(300).catch(120),
  valveLoss: num(0, 100000),
  distributors: lenientArray(distributorSchema, 50),
  notes: text(20000),
});

export const parseFloorSystem = (value: unknown): FloorSystemData => floorSystemSchema.catch(() => floorSystemSchema.parse({})).parse(value ?? {});

export const emptyFloorSystem = (): FloorSystemData => ({ ...parseFloorSystem({}), distributors: [{ id: crypto.randomUUID(), name: "V1", rooms: [] }] });
