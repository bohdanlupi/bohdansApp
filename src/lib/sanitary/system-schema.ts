import { z } from "zod";

import { type Distributor, distributorTypes, type LineParts, meterSlots } from "./distributor";
import { type Central, defaultCentral, defaultSettings, MAX_OUTLETS, type Outlet, outletsFrom, type SanitaryData, type SanNode, type Settings } from "./network";
import { findSize } from "./pipes";
import { type ApplianceKey, applianceKeys } from "./w3";

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
  // Older data: Wohnungswasserzähler and mounting on the Leitung, moved to its Apparategruppen below.
  meter: z.boolean().catch(false),
  shutoff: z.boolean().catch(false),
  regValve: z.enum(["thermal", "manual"]).catch("thermal"),
  mount: z.enum(["surface", "concealed"]).catch("surface"),
  bends90: z.number().int().min(0).max(999).catch(0),
  bends45: z.number().int().min(0).max(999).catch(0),
  // Older data: counts per type, turned into single Apparate (outlets) below.
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

const outletSchema: z.ZodType<Outlet> = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(applianceKeys as [ApplianceKey, ...ApplianceKey[]]),
  lengthPwc: num(1000),
  lengthPwh: num(1000),
  sizePwc: sizeKey,
  sizePwh: sizeKey,
});

/** Apparate of a consumer: the list, else (older data) one per counted appliance. */
function parseOutlets(raw: unknown, counts: Partial<Record<ApplianceKey, number>>): Outlet[] {
  if (!Array.isArray(raw)) return outletsFrom(counts);
  return raw.flatMap((o) => {
    const parsed = outletSchema.safeParse(o);
    return parsed.success ? [parsed.data] : [];
  }).slice(0, MAX_OUTLETS);
}

const partsSchema: z.ZodType<LineParts> = z.object({
  shutoff: z.boolean().catch(false),
  reducer: z.boolean().catch(false),
  meter: z.enum(meterSlots as [LineParts["meter"], ...LineParts["meter"][]]).catch("none"),
});
const distributorSchema: z.ZodType<Distributor> = z.object({
  type: z.enum(distributorTypes as [Distributor["type"], ...Distributor["type"][]]),
  pwc: partsSchema,
  pwh: partsSchema,
});

/** Older data: Wohnungswasserzähler / Absperrventile / Unterputz of the Leitung above an Apparategruppe. */
type Legacy = { meter: boolean; shutoff: boolean; concealed: boolean };

/** Verteiler of a consumer: as saved, else from the Leitung above it (older data), else without parts. */
function parseDistributor(raw: unknown, legacy: Legacy | null): Distributor {
  const parsed = distributorSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const parts = (): LineParts => ({ shutoff: legacy?.shutoff ?? false, reducer: false, meter: legacy?.meter ? "meter" : "none" });
  return { type: legacy?.concealed ? "cabinet" : "surface", pwc: parts(), pwh: parts() };
}

const MAX_DEPTH = 40;
const MAX_NODES = 2000;

function parseNodes(raw: unknown, depth: number, budget: { left: number }, legacy: Legacy | null = null): SanNode[] {
  if (!Array.isArray(raw) || depth > MAX_DEPTH) return [];
  const out: SanNode[] = [];
  for (const item of raw) {
    if (budget.left <= 0) break;
    const parsed = nodeFields.safeParse(item);
    if (!parsed.success) continue;
    budget.left--;
    // Consumers are leaves.
    const { appliances, meter, mount, ...fields } = parsed.data;
    const raw = item as { children?: unknown; outlets?: unknown; distributor?: unknown };
    // A Leitung with a Wohnungswasserzähler or Unterputz mounting (older data) hands it, with its Absperrventile, to
    // the Apparategruppen below.
    const own = fields.type === "pipe" && (meter || mount === "concealed") ? { meter, shutoff: fields.shutoff, concealed: mount === "concealed" } : null;
    const children = fields.type === "pipe" ? parseNodes(raw.children, depth + 1, budget, own ?? legacy) : [];
    const outlets = fields.type === "consumer" ? parseOutlets(raw.outlets, appliances) : [];
    const distributor = parseDistributor(raw.distributor, fields.type === "consumer" ? legacy : null);
    out.push({ ...fields, shutoff: own ? false : fields.shutoff, outlets, distributor, children });
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
