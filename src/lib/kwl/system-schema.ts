import { z } from "zod";

import type { NetNode, SystemData } from "./network";
import { deviceOptionsSchema, normalizeOptions } from "./attachments";
import { ductMaterials, type DuctMaterial } from "./pressure";
import { currentProductKey, datasheetDevice, findProduct, noBends } from "./products";

// Data of a ventilation system (ventilation_systems.data). Parsed leniently: invalid nodes are dropped one by one.

const num = (max: number) => z.number().finite().min(0).max(max).nullable().catch(null);
const text = (max: number) => z.string().max(max).catch("");
const id = z.string().min(1).max(40);

const count = z.number().int().min(0).max(100).catch(0);

const nodeFields = z.object({
  id,
  type: z.enum(["duct", "bend", "tee", "distributor", "component", "terminal"]),
  label: text(120),
  product: z.string().max(80).nullable().catch(null).transform(currentProductKey),
  curve: z.string().max(120).nullable().catch(null),
  cover: z.string().max(160).nullable().catch(null),
  coverCurve: z.string().max(120).nullable().catch(null),
  length: num(1000),
  count: z.number().int().min(1).max(50).catch(1),
  /** Legacy: number of 90° bends (before the counts per angle). */
  bends: num(100),
  bendCounts: z
    .object({ 15: count, 30: count, 45: count, 60: count, 90: count })
    .nullable()
    .catch(null),
  zeta: num(1000),
  diameter: num(3000),
  width: num(5000),
  height: num(5000),
  material: z.enum(Object.keys(ductMaterials) as [DuctMaterial, ...DuctMaterial[]]).catch("plastic"),
  dpRef: num(10000),
  qRef: num(100000),
  calcId: z.string().max(40).nullable().catch(null),
  roomId: z.string().max(40).nullable().catch(null),
  flow: num(100000),
});

const MAX_DEPTH = 40;
const MAX_NODES = 2000;

/** Terminals saved with a grille / valve as their product: that part is the cover (no Auslass). */
function moveCover<T extends { type: string; product: string | null; curve: string | null; cover: string | null; coverCurve: string | null }>(n: T): T {
  const p = n.type === "terminal" && !n.cover ? findProduct(n.product) : null;
  return p && (p.kind === "grille" || p.kind === "valve") ? { ...n, product: null, curve: null, cover: p.key, coverCurve: n.curve } : n;
}

function parseNodes(raw: unknown, depth: number, budget: { left: number }): NetNode[] {
  if (!Array.isArray(raw) || depth > MAX_DEPTH) return [];
  const out: NetNode[] = [];
  for (const item of raw) {
    if (budget.left <= 0) break;
    const parsed = nodeFields.safeParse(item);
    if (!parsed.success) continue;
    budget.left--;
    const children = parseNodes((item as { children?: unknown }).children, depth + 1, budget);
    const { bends, bendCounts, ...fields } = parsed.data;
    const counts = bendCounts ?? { ...noBends(), 90: Math.round(bends ?? 0) };
    out.push({ ...moveCover({ ...fields, bendCounts: counts }), children });
  }
  return out;
}

export function parseSystemData(value: unknown): SystemData {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const budget = { left: MAX_NODES };
  const device = typeof v.device === "string" && v.device.length <= 80 ? (datasheetDevice(v.device)?.key ?? null) : null;
  return {
    device,
    deviceOptions: normalizeOptions(device, deviceOptionsSchema.parse(v.deviceOptions)),
    calcIds: Array.isArray(v.calcIds) ? v.calcIds.filter((x): x is string => typeof x === "string" && x.length <= 40).slice(0, 200) : [],
    outdoor: parseNodes(v.outdoor, 0, budget),
    supply: parseNodes(v.supply, 0, budget),
    extract: parseNodes(v.extract, 0, budget),
    exhaust: parseNodes(v.exhaust, 0, budget),
    notes: typeof v.notes === "string" ? v.notes.slice(0, 4000) : "",
  };
}

export const emptySystemData = (): SystemData => parseSystemData({});
