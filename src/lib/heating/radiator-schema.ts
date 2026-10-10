import { z } from "zod";

import {
  defaultRadiatorDefaults,
  pipeSources,
  radiatorConnections,
  type RadiatorPlan,
  valveDns,
  valveForms,
  valveSeries,
} from "./radiators";

// Lenient parsing of the Heizkörper of an Anlage (heating_plants.radiators): invalid rooms / radiators are dropped one
// by one, invalid fields fall back to null (= the default of the Anlage).

const num = (min: number, max: number) => z.number().finite().min(min).max(max).nullable().catch(null);
const text = (max: number) => z.string().max(max).catch("");
const id = z.string().min(1).max(40);
const ref = z.string().max(64).nullable().catch(null);

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

const radiatorSchema = z.object({
  id,
  label: text(80),
  share: num(0, 1),
  model: ref,
  size: num(1, 10000),
  connection: z.enum(radiatorConnections).nullable().catch(null),
  side: z.enum(["left", "right"]).nullable().catch(null),
  pipeFrom: z.enum(pipeSources).nullable().catch(null),
  connFactor: num(0.5, 1.2),
  valveSeries: z.enum(valveSeries).nullable().catch(null),
  vlForm: z.enum(valveForms).nullable().catch(null),
  rlForm: z.enum(["eck", "durchgang"]).nullable().catch(null),
  head: ref,
  drain: z.enum(["return", "separate"]).nullable().catch(null),
  vent: z.boolean().catch(true),
});

const roomSchema = z.object({
  id,
  calcId: ref,
  roomId: ref,
  groupId: ref,
  name: text(120),
  floor: text(20),
  load: num(0, 1000000),
  roomTemp: num(0, 40),
  radiators: lenientArray(radiatorSchema, 20),
});

const defaults = defaultRadiatorDefaults();
const defaultsSchema = z.object({
  model: z.string().min(1).max(64).catch(defaults.model),
  connection: z.enum(radiatorConnections).catch(defaults.connection),
  side: z.enum(["left", "right"]).catch(defaults.side),
  pipeFrom: z.enum(pipeSources).catch(defaults.pipeFrom),
  valveSeries: z.enum(valveSeries).catch(defaults.valveSeries),
  head: z.string().min(1).max(64).catch(defaults.head),
  drain: z.enum(["return", "separate"]).catch(defaults.drain),
  dn: z
    .number()
    .refine((v) => (valveDns as readonly number[]).includes(v))
    .catch(defaults.dn),
  vent: z.string().max(64).catch(defaults.vent),
  drainCock: z.string().max(64).catch(defaults.drainCock),
});

export const radiatorPlanSchema = z.object({
  defaults: defaultsSchema.catch(() => defaultsSchema.parse({})),
  rooms: lenientArray(roomSchema, 500),
  notes: text(20000),
});

export const parseRadiatorPlan = (value: unknown): RadiatorPlan =>
  radiatorPlanSchema.catch(() => radiatorPlanSchema.parse({})).parse(value ?? {}) as RadiatorPlan;
