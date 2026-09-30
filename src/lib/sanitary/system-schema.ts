import { z } from "zod";

import { type Central, defaultCentral, defaultSettings, type SanitaryData, type SanNode, type Settings } from "./network";
import { findSize } from "./pipes";
import { applianceKeys } from "./w3";

// Data of a Sanitäranlage (sanitary_systems.data). Parsed leniently: invalid nodes are dropped one by one, invalid
// settings fall back to the defaults.

const num = (max: number) => z.number().finite().min(0).max(max).nullable().catch(null);
const text = (max: number) => z.string().max(max).catch("");
const sizeKey = z
  .string()
  .max(20)
  .nullable()
  .catch(null)
  .transform((k) => (findSize(k) ? k : null));

const nodeFields = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(["pipe", "consumer"]),
  label: text(120),
  floor: text(20),
  length: num(1000),
  riser: z.boolean().catch(false),
  role: z.enum(["auto", "distribution", "floor"]).catch("auto"),
  pwc: z.boolean().catch(true),
  pwh: z.boolean().catch(true),
  system: z.enum(["optipress", "optiflex"]).catch("optipress"),
  circulation: z.enum(["none", "conventional", "rar"]).catch("none"),
  sizePwc: sizeKey,
  sizePwh: sizeKey,
  sizePwhc: sizeKey,
  meter: z.boolean().catch(false),
  shutoff: z.boolean().catch(false),
  regValve: z.enum(["thermal", "manual"]).catch("thermal"),
  bends90: z.number().int().min(0).max(999).catch(0),
  bends45: z.number().int().min(0).max(999).catch(0),
  appliances: z
    .record(z.string(), z.unknown())
    .catch({})
    .transform((obj) =>
      Object.fromEntries(
        applianceKeys.flatMap((k) => {
          const v = obj[k];
          return typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 999 ? [[k, v]] : [];
        }),
      ),
    ),
});

const MAX_DEPTH = 40;
const MAX_NODES = 2000;

function parseNodes(raw: unknown, depth: number, budget: { left: number }): SanNode[] {
  if (!Array.isArray(raw) || depth > MAX_DEPTH) return [];
  const out: SanNode[] = [];
  for (const item of raw) {
    if (budget.left <= 0) break;
    const parsed = nodeFields.safeParse(item);
    if (!parsed.success) continue;
    budget.left--;
    // Consumers are leaves.
    const children = parsed.data.type === "pipe" ? parseNodes((item as { children?: unknown }).children, depth + 1, budget) : [];
    out.push({ ...parsed.data, children });
  }
  return out;
}

const d = defaultCentral();
const centralSchema: z.ZodType<Central> = z
  .object({
    houseLength: num(1000),
    centralLength: num(1000),
    trunkLength: num(1000),
    heaterLength: num(1000),
    meter: z.boolean().catch(d.meter),
    filter: z.enum(["none", "fine", "redfil"]).catch(d.filter),
    reducer: z.boolean().catch(d.reducer),
    softener: z.enum(["none", "heater", "all"]).catch(d.softener),
    heaterLabel: text(80),
    heaterVolume: num(100000),
    safetyGroup: z.boolean().catch(d.safetyGroup),
    mixer: z.boolean().catch(d.mixer),
  })
  .catch(defaultCentral());

const s = defaultSettings();
const range = (min: number, max: number, fallback: number) => z.number().finite().min(min).max(max).catch(fallback);
const settingsSchema: z.ZodType<Settings> = z
  .object({
    tHot: range(40, 90, s.tHot),
    tReturn: range(30, 90, s.tReturn),
    lossConventional: range(0, 2, s.lossConventional),
    lossRar: range(0, 2, s.lossRar),
    allowance: range(0, 2, s.allowance),
    dpCheck: range(0, 2000, s.dpCheck),
    dpValve: range(0, 2000, s.dpValve),
    vCirc: range(0.1, 2, s.vCirc),
    insulationMaterial: z.enum(["pir", "mineralwool"]).catch(s.insulationMaterial),
    // Older data: a thickness in mm (> 0 = insulated).
    pwcInsulation: z.preprocess((v) => (typeof v === "number" ? v > 0 : v), z.boolean()).catch(s.pwcInsulation),
    pump: z.string().max(20).nullable().catch(null),
  })
  .catch(defaultSettings());

/** Older data: a λ value instead of the material (below 0.03 W/(m·K) = PIR). */
function withMaterial(raw: unknown) {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (o.insulationMaterial === undefined && typeof o.lambda === "number") return { ...o, insulationMaterial: o.lambda < 0.03 ? "pir" : "mineralwool" };
  return o;
}

export function parseSanitaryData(value: unknown): SanitaryData {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    central: centralSchema.parse(v.central ?? {}),
    settings: settingsSchema.parse(withMaterial(v.settings)),
    network: parseNodes(v.network, 0, { left: MAX_NODES }),
    notes: typeof v.notes === "string" ? v.notes.slice(0, 4000) : "",
  };
}

export const emptySanitaryData = (): SanitaryData => parseSanitaryData({});
