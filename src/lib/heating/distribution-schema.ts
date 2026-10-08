import { z } from "zod";

import { defaultDistributionSettings, type DistributionData, type DistributionSettings, findHeatPipe, type HeatNode } from "./distribution";

// Strangschema of an Anlage (heating_plants.distribution). Parsed leniently: invalid nodes are dropped one by one,
// invalid settings fall back to the defaults.

const num = (max: number) => z.number().finite().min(0).max(max).nullable().catch(null);
const text = (max: number) => z.string().max(max).catch("");
const ref = z.string().max(40).nullable().catch(null);

const nodeFields = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(["pipe", "radiator", "floor", "consumer"]),
  label: text(120),
  floor: text(20),
  length: num(1000),
  riser: z.boolean().catch(false),
  role: z.enum(["auto", "distribution", "floor"]).catch("auto"),
  system: z.enum(["therm", "flowpress"]).catch("therm"),
  size: z
    .string()
    .max(20)
    .nullable()
    .catch(null)
    .transform((k) => (findHeatPipe(k) ? k : null)),
  bends90: z.number().int().min(0).max(999).catch(0),
  bends45: z.number().int().min(0).max(999).catch(0),
  ambient: z.enum(["heated", "unheated", "outside"]).catch("heated"),
  insulation: num(300),
  shutoff: z.boolean().catch(false),
  regValve: z.boolean().catch(false),
  meterSet: z.boolean().catch(false),
  heatMeter: z.boolean().catch(false),
  calcId: ref,
  roomId: ref,
  systemId: ref,
  distributorId: ref,
  power: num(10000000),
  dp: num(1000),
});

const MAX_DEPTH = 40;
const MAX_NODES = 3000;

function parseNodes(raw: unknown, depth: number, budget: { left: number }): HeatNode[] {
  if (!Array.isArray(raw) || depth > MAX_DEPTH) return [];
  const out: HeatNode[] = [];
  for (const item of raw) {
    if (budget.left <= 0) break;
    const parsed = nodeFields.safeParse(item);
    if (!parsed.success) continue;
    budget.left--;
    // Terminals (Heizkörper, FBH-Verteiler, consumers) are leaves.
    const children = parsed.data.type === "pipe" ? parseNodes((item as { children?: unknown }).children, depth + 1, budget) : [];
    out.push({ ...parsed.data, children });
  }
  return out;
}

const s = defaultDistributionSettings();
const range = (min: number, max: number, fallback: number) => z.number().finite().min(min).max(max).catch(fallback);
const settingsSchema: z.ZodType<DistributionSettings> = z
  .object({
    tHeated: range(0, 40, s.tHeated),
    tUnheated: range(-30, 40, s.tUnheated),
    tOutside: z.number().finite().min(-40).max(30).nullable().catch(null),
    lambda: range(0.01, 0.1, s.lambda),
    allowance: range(0, 3, s.allowance),
    zeta90: range(0, 10, s.zeta90),
    zeta45: range(0, 10, s.zeta45),
    valveDp: range(0, 100, s.valveDp),
  })
  .catch(defaultDistributionSettings());

export function parseDistribution(value: unknown): DistributionData {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const raw = (v.networks && typeof v.networks === "object" ? v.networks : {}) as Record<string, unknown>;
  const budget = { left: MAX_NODES };
  const networks: Record<string, HeatNode[]> = {};
  for (const [groupId, nodes] of Object.entries(raw).slice(0, 40)) {
    if (groupId.length > 64) continue;
    const parsed = parseNodes(nodes, 0, budget);
    if (parsed.length) networks[groupId] = parsed;
  }
  return {
    settings: settingsSchema.parse(v.settings ?? {}),
    networks,
    notes: typeof v.notes === "string" ? v.notes.slice(0, 4000) : "",
  };
}
