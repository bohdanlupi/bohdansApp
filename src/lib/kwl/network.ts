// Branched duct network of a ventilation system (e.g. a single-family house), per side a tree:
//   outdoor chain: device ← … ← AUL terminal            (series, carries the total supply flow)
//   supply tree:   device → ducts / T-pieces / distributors / silencers → terminals in the rooms
//   extract tree:  terminals in the rooms → … → device
//   exhaust chain: device → … → FOL terminal            (series, carries the total extract flow)
// Leaf flows come from the rooms of the dwelling calculations; every node carries the sum of the flows
// below it. The path with the largest pressure drop is the external pressure of the device on that side;
// the other paths need throttling by the difference.

import { maxVelocity } from "./calc";
import { curveValue, findProduct, type Product, productCurve } from "./products";
import { airDensity, ductMaterials, type DuctMaterial, frictionFactor } from "./pressure";

export type NodeType = "duct" | "bend" | "tee" | "distributor" | "component" | "terminal";

export type NetNode = {
  id: string;
  type: NodeType;
  label: string;
  /** Product key (see products.ts) – Zehnder data has priority. */
  product: string | null;
  /** Curve label of the product (e.g. grille design, throttle setting). */
  curve: string | null;
  /** Ducts: length [m], parallel ducts, bends, custom geometry when no product is chosen. */
  length: number | null;
  count: number;
  bends: number | null;
  zeta: number | null;
  diameter: number | null;
  width: number | null;
  height: number | null;
  material: DuctMaterial;
  /** Manual pressure drop [Pa] at q_ref (components without product data). */
  dpRef: number | null;
  qRef: number | null;
  /** Terminals: the room they serve (dwelling calculation + room id) and their share of the room flow. */
  calcId: string | null;
  roomId: string | null;
  /** Fixed flow [m³/h] for terminals instead of the room flow (e.g. two terminals in one room). */
  flow: number | null;
  children: NetNode[];
};

export type SystemSide = "outdoor" | "supply" | "extract" | "exhaust";

export type SystemData = {
  /** Device product key (Zehnder device) or a device of the workbook (devices.ts). */
  device: string | null;
  /** Dwelling calculations this system serves. */
  calcIds: string[];
  outdoor: NetNode[];
  supply: NetNode[];
  extract: NetNode[];
  exhaust: NetNode[];
  notes: string;
};

export type RoomFlow = { calcId: string; roomId: string; name: string; floor: string; supply: number; extract: number };

export type NodeResult = {
  id: string;
  flow: number;
  dp: number;
  velocity: number | null;
  /** Friction per metre [Pa/m] for ducts. */
  r: number | null;
  /** Pressure drop from the device up to and including this node. */
  cumulative: number;
  velocityLimit: number | null;
  /** Data source of the pressure drop. */
  source: "product" | "calculated" | "manual" | "none";
};

export type LeafResult = { id: string; path: number; throttle: number; flow: number; roomLabel: string };

export type SideResult = {
  flow: number;
  nodes: Map<string, NodeResult>;
  leaves: LeafResult[];
  critical: number | null;
  criticalLeaf: string | null;
};

// ---------------------------------------------------------------------------
// Pressure drop of one node
// ---------------------------------------------------------------------------

function ductGeometry(node: NetNode) {
  const product = findProduct(node.product);
  const d = product?.inner?.diameter ?? node.diameter;
  const w = product?.inner?.width ?? node.width;
  const h = product?.inner?.height ?? node.height;
  if (w && h) {
    const a = (w / 1000) * (h / 1000);
    return { area: a, dh: (2 * (w / 1000) * (h / 1000)) / (w / 1000 + h / 1000) };
  }
  if (d) return { area: (Math.PI * (d / 1000) ** 2) / 4, dh: d / 1000 };
  return null;
}

export function nodeResult(node: NetNode, flow: number, side: "supply" | "extract"): Omit<NodeResult, "cumulative"> {
  const product = findProduct(node.product);
  const empty = { id: node.id, flow, velocity: null, r: null, velocityLimit: null };

  if (node.type === "duct" || node.type === "bend") {
    const geometry = ductGeometry(node);
    const count = Math.max(1, node.count);
    const q = flow / count;
    const v = geometry ? q / 3600 / geometry.area : null;
    const dynamic = v !== null ? (airDensity * v * v) / 2 : 0;
    const zeta = (node.type === "bend" ? 1 : (node.bends ?? 0)) * 0.3 + (node.zeta ?? 0);
    // Manufacturer friction curve (Pa/m over flow per duct) has priority over the calculation.
    const curve = productCurve(product, node.curve, side);
    let r: number | null = null;
    let source: NodeResult["source"] = "none";
    if (curve && node.type === "bend" && product?.kind === "fitting") {
      // Fitting curve: pressure drop per piece (not per metre).
      const dp = (curveValue(curve.points, q) ?? 0) + (node.zeta ?? 0) * dynamic;
      return { ...empty, dp, velocity: v, velocityLimit: v !== null ? maxVelocity(q) : null, source: "product" };
    }
    if (curve) {
      r = curveValue(curve.points, q);
      source = "product";
    } else if (geometry && v) {
      const roughness = ductMaterials[node.material] / 1000;
      const lambda = frictionFactor((v * geometry.dh) / 15.1e-6, roughness / geometry.dh);
      r = (lambda / geometry.dh) * dynamic;
      source = "calculated";
    }
    const length = node.type === "duct" ? (node.length ?? 0) : 0;
    return { ...empty, dp: (r ?? 0) * length + zeta * dynamic, velocity: v, r, velocityLimit: v !== null ? maxVelocity(q) : null, source };
  }

  // Components, T-pieces, distributors, terminals: product curve, else manual Δp_ref at q_ref (∝ q²).
  const curve = productCurve(product, node.curve, side);
  if (curve) {
    const outlets = Math.max(1, node.children.length);
    const q = curve.flowRefersTo === "perOutlet" ? flow / outlets : flow;
    return { ...empty, dp: curveValue(curve.points, q) ?? 0, source: "product" };
  }
  if (node.dpRef != null) {
    return { ...empty, dp: node.qRef ? node.dpRef * (flow / node.qRef) ** 2 : node.dpRef, source: "manual" };
  }
  return { ...empty, dp: 0, source: "none" };
}

// ---------------------------------------------------------------------------
// Flows and paths
// ---------------------------------------------------------------------------

const roomKey = (calcId: string | null, roomId: string | null) => `${calcId}|${roomId}`;

/** Leaf flows: the room flow split over all terminals of that room and side (unless a fixed flow is set). */
function leafFlows(roots: NetNode[], rooms: RoomFlow[], side: "supply" | "extract") {
  const terminals: NetNode[] = [];
  const walk = (n: NetNode) => (n.type === "terminal" ? terminals.push(n) : n.children.forEach(walk));
  roots.forEach(walk);
  const perRoom = new Map<string, number>();
  for (const t of terminals) if (t.flow == null) perRoom.set(roomKey(t.calcId, t.roomId), (perRoom.get(roomKey(t.calcId, t.roomId)) ?? 0) + 1);
  const flows = new Map<string, number>();
  for (const t of terminals) {
    if (t.flow != null) {
      flows.set(t.id, t.flow);
      continue;
    }
    const room = rooms.find((r) => r.calcId === t.calcId && r.roomId === t.roomId);
    const total = room ? room[side] : 0;
    flows.set(t.id, total / (perRoom.get(roomKey(t.calcId, t.roomId)) ?? 1));
  }
  return flows;
}

function subtreeFlow(node: NetNode, leaves: Map<string, number>, out: Map<string, number>): number {
  const own = node.type === "terminal" ? (leaves.get(node.id) ?? 0) : 0;
  const flow = own + node.children.reduce((s, c) => s + subtreeFlow(c, leaves, out), 0);
  out.set(node.id, flow);
  return flow;
}

export function evaluateTree(roots: NetNode[], rooms: RoomFlow[], side: "supply" | "extract"): SideResult {
  const leaves = leafFlows(roots, rooms, side);
  const flows = new Map<string, number>();
  const flow = roots.reduce((s, r) => s + subtreeFlow(r, leaves, flows), 0);
  const nodes = new Map<string, NodeResult>();
  const leafResults: LeafResult[] = [];

  const walk = (node: NetNode, before: number) => {
    const res = nodeResult(node, flows.get(node.id) ?? 0, side);
    const cumulative = before + res.dp;
    nodes.set(node.id, { ...res, cumulative });
    if (node.type === "terminal" || node.children.length === 0) {
      const room = rooms.find((r) => r.calcId === node.calcId && r.roomId === node.roomId);
      leafResults.push({ id: node.id, path: cumulative, throttle: 0, flow: flows.get(node.id) ?? 0, roomLabel: room?.name ?? node.label });
    }
    node.children.forEach((c) => walk(c, cumulative));
  };
  roots.forEach((r) => walk(r, 0));

  const worst = leafResults.reduce<LeafResult | null>((m, l) => (!m || l.path > m.path ? l : m), null);
  const critical = nodes.size ? (worst?.path ?? 0) : null;
  for (const l of leafResults) l.throttle = critical !== null ? critical - l.path : 0;
  return { flow, nodes, leaves: leafResults, critical, criticalLeaf: worst?.id ?? null };
}

/** Series chain (outdoor / exhaust air) at a fixed flow. */
export function evaluateChain(chain: NetNode[], flow: number, side: "supply" | "extract") {
  const nodes = new Map<string, NodeResult>();
  let cumulative = 0;
  for (const node of chain) {
    const res = nodeResult(node, flow, side);
    cumulative += res.dp;
    nodes.set(node.id, { ...res, cumulative });
  }
  return { flow, nodes, total: chain.length ? cumulative : null };
}

export function evaluateSystem(data: SystemData, rooms: RoomFlow[]) {
  const supply = evaluateTree(data.supply, rooms, "supply");
  const extract = evaluateTree(data.extract, rooms, "extract");
  const outdoor = evaluateChain(data.outdoor, supply.flow, "supply");
  const exhaust = evaluateChain(data.exhaust, extract.flow, "extract");
  const external = {
    supply: supply.critical !== null || outdoor.total !== null ? (outdoor.total ?? 0) + (supply.critical ?? 0) : null,
    extract: extract.critical !== null || exhaust.total !== null ? (exhaust.total ?? 0) + (extract.critical ?? 0) : null,
  };
  return { supply, extract, outdoor, exhaust, external };
}

export type SystemResult = ReturnType<typeof evaluateSystem>;

// ---------------------------------------------------------------------------
// Quantities (for the LV)
// ---------------------------------------------------------------------------

export type Quantity = { product: string | null; label: string; unit: "m" | "Stk"; quantity: number; articles: string[] };

const genericWords = new Set(["zuluft", "abluft", "ohne", "mit", "filter", "einstellung", "einstellstufe", "einstellposition", "druckverlust", "comfovalve", "comfogrid", "comfocase", "kurve", "breit"]);

/**
 * Article of the grille / valve named in a curve label (e.g. «ComfoGrid Roma breit, Zuluft ohne Filter» on a
 * ComfoCase): the accessory article whose text shares most of the label's name words.
 */
function curveArticle(product: Product, curveLabel: string | undefined): Product["articles"][number] | null {
  if (!curveLabel || product.articles.length < 2) return null;
  const words = curveLabel
    .split(",")[0]
    .toLowerCase()
    .split(/[^a-z0-9äöü]+/)
    .filter((w) => w.length >= 3 && !genericWords.has(w) && !/^dn\d+$/.test(w));
  if (!words.length) return null;
  let best: { article: Product["articles"][number]; score: number } | null = null;
  for (const article of product.articles.slice(1)) {
    const text = article.text.toLowerCase();
    const score = words.filter((w) => text.includes(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { article, score };
  }
  return best && best.score >= Math.min(2, words.length) ? best.article : null;
}

export function systemQuantities(data: SystemData): Quantity[] {
  const map = new Map<string, Quantity>();
  const add = (key: string, q: Omit<Quantity, "quantity">, amount: number) => {
    const current = map.get(key);
    if (current) current.quantity += amount;
    else map.set(key, { ...q, quantity: amount });
  };
  const walk = (side: "supply" | "extract") => (n: NetNode) => {
    const product = findProduct(n.product);
    // Only the product's own (first) article: the others are accessories and variants.
    const articles = product?.articles[0] ? [product.articles[0].number] : [];
    const label = product?.name ?? n.label;
    const accessory = product && n.type !== "duct" ? curveArticle(product, productCurve(product, n.curve, side)?.label) : null;
    if (accessory) {
      add(`${n.product}|${accessory.number}`, { product: n.product, label: accessory.text, unit: "Stk", articles: [accessory.number] }, Math.max(1, n.count));
    }
    if (n.type === "duct") {
      const key = n.product ?? `custom-${n.diameter ?? `${n.width}x${n.height}`}-${n.material}`;
      add(key, { product: n.product, label: product?.name ?? `${n.label} ${n.diameter ? `ø ${n.diameter}` : `${n.width}×${n.height}`}`, unit: "m", articles }, (n.length ?? 0) * Math.max(1, n.count));
    } else if (n.type !== "tee" || n.product) {
      add(n.product ?? `${n.type}-${n.label}`, { product: n.product, label, unit: "Stk", articles }, Math.max(1, n.count));
    }
    n.children.forEach(walk(side));
  };
  [...data.outdoor, ...data.supply].forEach(walk("supply"));
  [...data.extract, ...data.exhaust].forEach(walk("extract"));
  return [...map.values()].map((q) => ({ ...q, quantity: q.unit === "m" ? Math.ceil(q.quantity * 10) / 10 : q.quantity }));
}

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

export const newNode = (type: NodeType, patch: Partial<NetNode> = {}): NetNode => ({
  id: newId(),
  type,
  label: "",
  product: null,
  curve: null,
  length: type === "duct" ? 1 : null,
  count: 1,
  bends: null,
  zeta: null,
  diameter: null,
  width: null,
  height: null,
  material: "plastic",
  dpRef: null,
  qRef: null,
  calcId: null,
  roomId: null,
  flow: null,
  children: [],
  ...patch,
});

export function mapTree(roots: NetNode[], fn: (node: NetNode) => NetNode | null): NetNode[] {
  return roots.flatMap((n) => {
    const mapped = fn({ ...n, children: mapTree(n.children, fn) });
    return mapped ? [mapped] : [];
  });
}

export function findNode(roots: NetNode[], id: string): NetNode | null {
  for (const n of roots) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return null;
}

/** Path of node ids from a root to the node (for highlighting). */
export function pathTo(roots: NetNode[], id: string): string[] {
  for (const n of roots) {
    if (n.id === id) return [n.id];
    const sub = pathTo(n.children, id);
    if (sub.length) return [n.id, ...sub];
  }
  return [];
}

/** Room flows of dwelling calculations, as input for the network. */
export function roomFlows(calcs: { id: string; name: string; data: { rooms: { id: string; number: string; name: string; floor: string; supply: number | null; extract: number | null }[] } }[], calcIds: string[]): RoomFlow[] {
  const multiple = calcIds.length > 1;
  return calcs
    .filter((c) => calcIds.includes(c.id))
    .flatMap((c) =>
      c.data.rooms.map((r) => ({
        calcId: c.id,
        roomId: r.id,
        name: [multiple ? c.name : null, r.number, r.name].filter(Boolean).join(" "),
        floor: r.floor,
        supply: r.supply ?? 0,
        extract: r.extract ?? 0,
      })),
    );
}

/** For each dwelling calculation: the external pressure drops of the (first) system that serves it. */
export function systemDropsByCalc(
  systems: { id: string; name: string; data: SystemData }[],
  calcs: Parameters<typeof roomFlows>[0],
): Map<string, { supply: number | null; extract: number | null; systemId: string; name: string }> {
  const out = new Map<string, { supply: number | null; extract: number | null; systemId: string; name: string }>();
  for (const s of systems) {
    const result = evaluateSystem(s.data, roomFlows(calcs, s.data.calcIds));
    for (const calcId of s.data.calcIds) {
      if (!out.has(calcId)) out.set(calcId, { ...result.external, systemId: s.id, name: s.name });
    }
  }
  return out;
}

/** Elements operated above the manufacturer's recommended flow (per duct / per piece). */
export function overRange(data: SystemData, result: SystemResult): { id: string; label: string; flow: number; max: number }[] {
  const out: { id: string; label: string; flow: number; max: number }[] = [];
  const check = (n: NetNode, res: NodeResult | undefined) => {
    const product = findProduct(n.product);
    const max = product?.recommendedRange?.[1];
    if (!res || !product || !max) return;
    const flow = n.type === "duct" || n.type === "bend" ? res.flow / Math.max(1, n.count) : res.flow;
    if (flow > max * 1.001) out.push({ id: n.id, label: n.label || product.name, flow, max });
  };
  const walk = (nodes: NetNode[], map: Map<string, NodeResult>) =>
    nodes.forEach(function visit(n) {
      check(n, map.get(n.id));
      n.children.forEach(visit);
    });
  walk(data.outdoor, result.outdoor.nodes);
  walk(data.supply, result.supply.nodes);
  walk(data.extract, result.extract.nodes);
  walk(data.exhaust, result.exhaust.nodes);
  return out;
}
