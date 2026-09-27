// Starting points for a ventilation network: a standard network for a single-family house and the
// conversion of the per-dwelling star networks (previous "Druckverlust" tab).

import { type NetNode, newNode, type NodeType, type RoomFlow, type SystemData } from "./network";
import type { Network, Segment } from "./pressure";
import { curveGroup, measuredCoverPrefix, noBends, type Product, productCurve, products, type ProductKind } from "./products";
import { floorOrder } from "./schema-layout";

/** First Zehnder product of a kind whose name matches – null when the data has no such product. */
function pick(kind: ProductKind, ...patterns: RegExp[]): Product | null {
  return pickOnly(kind, ...patterns) ?? products.find((p) => p.kind === kind) ?? null;
}

/** Zehnder product of a kind whose name matches, else null. */
function pickOnly(kind: ProductKind, ...patterns: RegExp[]): Product | null {
  const candidates = products.filter((p) => p.kind === kind);
  for (const re of patterns) {
    const hit = candidates.find((p) => re.test(p.name));
    if (hit) return hit;
  }
  return null;
}

export type DefaultLabels = {
  intake: string;
  exhaust: string;
  outdoorDuct: string;
  exhaustDuct: string;
  mainDuct: string;
  floorDuct: string;
  silencer: string;
  distributor: string;
  roomDuct: string;
};

/** Cover measured with the Auslass for the air side (first curve of the case datasheet for that side). */
function coverFor(casing: Product | null, side: "supply" | "extract"): Partial<NetNode> {
  const curve = productCurve(casing, null, side);
  return curve ? { cover: measuredCoverPrefix + curveGroup(curve.label), curve: curve.label } : {};
}

/**
 * Standard network: every strand starts with a silencer at the unit. Supply / extract air: silencer → main duct →
 * per storey a floor duct and its own distributor (one storey: straight to the distributor) → one ComfoTube branch
 * per room (1–3 tubes as in the workbook's distribution sketch) → terminal. Outdoor / exhaust air: silencer → duct
 * → weather grille.
 */
export function defaultSystem(rooms: RoomFlow[], labels: DefaultLabels, base: SystemData): SystemData {
  const pipe = pick("duct", /ComfoPipe Compact.*DN160/i, /ComfoPipe/i);
  const tube = pick("duct", /ComfoTube Flow 90/i, /ComfoTube.*90/i);
  const silencer = pick("silencer", /ComfoSilence 350 16\/16 L700/i, /ComfoSilence \d/i);
  const supplyTerminal = pick("terminal", /CLD breit L430/i, /CLD/i);
  const extractTerminal = pick("terminal", /TVA-P 125 1x90 H=170/i, /TVA-P/i);
  // Weather protection grille: round in the pipe diameter (Schmidlin WS-R from Ø 200), else rectangular WS-50 Alu.
  const pipeDiameter = pipe?.inner?.diameter;
  const outerGrille =
    products.find((p) => p.manufacturer === "Schmidlin" && /^Wetterschutzgitter rund/.test(p.name) && p.inner?.diameter === pipeDiameter && /Alu$/.test(p.name)) ??
    pickOnly("grille", /^Wetterschutzgitter eckig WS-50 200 × 200, Alu$/, /Wetterschutz/i);

  const duct = (product: Product | null, label: string, length: number, bends: number, patch: Partial<NetNode> = {}) =>
    newNode("duct", { product: product?.key ?? null, diameter: product ? null : 160, label, length, bendCounts: { ...noBends(), 90: bends }, ...patch });
  const component = (type: NodeType, product: Product | null, label: string, patch: Partial<NetNode> = {}) =>
    newNode(type, { product: product?.key ?? null, label, ...patch });
  const tubes = (flow: number) => (flow < 38 ? 1 : flow <= 60 ? 2 : Math.ceil(flow / 30));

  /** Smallest ComfoCube APV F with enough outlets for the tubes of one distributor. */
  const distributorFor = (outlets: number) =>
    products
      .filter((p) => p.kind === "distributor" && /APV F \d/.test(p.name) && (p.outlets ?? 0) >= outlets)
      .sort((a, b) => (a.outlets ?? 0) - (b.outlets ?? 0))[0] ?? pick("distributor", /APV F 10/i, /ComfoCube/i);

  const tree = (side: "supply" | "extract") => {
    const served = rooms.filter((r) => r[side] > 0);
    const terminal = side === "supply" ? supplyTerminal : extractTerminal;
    const floors = [...new Set(served.map((r) => r.floor.trim()))].sort((a, b) => floorOrder(a) - floorOrder(b));
    const several = floors.length > 1;
    const distributorOf = (floor: string) => {
      const floorRooms = served.filter((r) => r.floor.trim() === floor);
      const branches = floorRooms.map((r) =>
        duct(tube, labels.roomDuct, 10, 2, {
          count: tubes(r[side]),
          children: [component("terminal", terminal, r.name, { calcId: r.calcId, roomId: r.roomId, ...coverFor(terminal, side) })],
        }),
      );
      const outlets = floorRooms.reduce((s, r) => s + tubes(r[side]), 0);
      return component("distributor", distributorFor(outlets), several && floor ? `${labels.distributor} ${floor}` : labels.distributor, { children: branches });
    };
    // Several storeys: a floor duct to each storey's own distributor.
    const afterMain = several
      ? floors.map((floor) => duct(pipe, floor ? `${labels.floorDuct} ${floor}` : labels.floorDuct, 4, 1, { children: [distributorOf(floor)] }))
      : [distributorOf(floors[0] ?? "")];
    return [component("component", silencer, labels.silencer, { children: [duct(pipe, labels.mainDuct, 2, 1, { children: afterMain })] })];
  };

  // Chains are listed from the unit outwards: the silencer sits at the unit, the grille at the end.
  return {
    ...base,
    outdoor: [component("component", silencer, labels.silencer), duct(pipe, labels.outdoorDuct, 4, 2), component("component", outerGrille, labels.intake)],
    supply: tree("supply"),
    extract: tree("extract"),
    exhaust: [component("component", silencer, labels.silencer), duct(pipe, labels.exhaustDuct, 4, 2), component("component", outerGrille, labels.exhaust)],
  };
}

/** Converts a per-dwelling star network (series main part, one branch per room) into tree nodes. */
export function starToSystem(network: Network, calcId: string, base: SystemData): SystemData {
  const toNode = (s: Segment): NetNode =>
    s.kind === "duct"
      ? newNode("duct", {
          label: s.name,
          diameter: s.shape === "round" ? s.diameter : null,
          width: s.shape === "rect" ? s.width : null,
          height: s.shape === "rect" ? s.height : null,
          material: s.material,
          length: s.length,
          count: s.count,
          bendCounts: { ...noBends(), 90: Math.round(s.bends ?? 0) },
          zeta: s.zeta,
        })
      : newNode("component", { label: s.name, dpRef: s.dpRef, qRef: s.qRef });
  /** Series list → nested chain; returns [root, last]. */
  const chain = (segments: Segment[]): [NetNode, NetNode] | null => {
    if (!segments.length) return null;
    const nodes = segments.map(toNode);
    for (let i = nodes.length - 2; i >= 0; i--) nodes[i].children = [nodes[i + 1]];
    return [nodes[0], nodes[nodes.length - 1]];
  };
  const side = (s: Network["supply"]) => {
    const main = chain(s.main);
    const branches = Object.entries(s.branches).flatMap(([roomId, segments]) => {
      const c = chain(segments.length ? segments : []);
      if (!c) return [];
      const [root, last] = c;
      // The last element of a branch is the terminal of the room.
      const terminal = { ...last, type: "terminal" as const, calcId, roomId, children: [] };
      if (root === last) return [terminal];
      const replace = (n: NetNode): NetNode => (n.id === last.id ? terminal : { ...n, children: n.children.map(replace) });
      return [replace(root)];
    });
    if (!main) return branches;
    const [root, last] = main;
    last.children = branches;
    if (last.type === "component") last.type = "distributor";
    return [root];
  };
  const outer = (segments: Segment[]) => segments.map(toNode);
  return {
    ...base,
    outdoor: outer([...network.supply.outer].reverse()),
    supply: side(network.supply),
    extract: side(network.extract),
    exhaust: outer(network.extract.outer),
  };
}
