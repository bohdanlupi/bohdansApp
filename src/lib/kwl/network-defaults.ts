// Starting points for a ventilation network: a standard network for a single-family house and the
// conversion of the per-dwelling star networks (previous "Druckverlust" tab).

import { terminalKind, tubeCount } from "./calc";
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

/**
 * Cover measured with the Auslass: the curve of the group (e.g. «ComfoGrid Genua breit») for the air side, the one
 * matching the connections if there is one; without such a group the first curve of the case for that side.
 */
function measuredCover(casing: Product | null, group: string, side: "supply" | "extract", connections: RegExp): Partial<NetNode> {
  const curves = casing?.curves.filter((c) => curveGroup(c.label) === group && c.use === side) ?? [];
  const curve = curves.find((c) => connections.test(c.label)) ?? curves[0] ?? productCurve(casing, null, side);
  return curve ? { cover: measuredCoverPrefix + curveGroup(curve.label), curve: curve.label } : {};
}

/**
 * Standard network: every strand starts with a silencer at the unit. Supply / extract air: silencer → main duct →
 * per storey a floor duct and its own distributor (one storey: straight to the distributor) → one ComfoTube branch
 * per room (1–3 tubes as in the workbook's distribution sketch) → terminal by room type (branchFor). Outdoor / exhaust air: silencer → duct
 * → weather grille.
 */
export function defaultSystem(rooms: RoomFlow[], labels: DefaultLabels, base: SystemData): SystemData {
  const pipe = pick("duct", /ComfoPipe Compact.*DN160/i, /ComfoPipe/i);
  const tube = pick("duct", /ComfoTube Flow 90/i, /ComfoTube.*90/i);
  const silencer = pick("silencer", /ComfoSilence 350 16\/16 L700/i, /ComfoSilence \d/i);
  const cld = pick("terminal", /CLD breit L430/i, /CLD/i);
  const cldP = pickOnly("terminal", /CLD-P L260/i) ?? cld;
  const csbp400 = pick("terminal", /CSB-P 400/i, /CLD breit L430/i);
  const csbp600 = pick("terminal", /CSB-P 600/i, /CLD breit L430/i);
  const stcValve = pickOnly("valve", /ComfoValve Via STC/i);
  const spiro125 = pickOnly("duct", /^Spirorohr DN 125\b/);
  // Weather protection grille: round in the pipe diameter (Schmidlin WS-R from Ø 200), else rectangular WS-50 Alu.
  const pipeDiameter = pipe?.inner?.diameter;
  const outerGrille =
    products.find((p) => p.manufacturer === "Schmidlin" && /^Wetterschutzgitter rund/.test(p.name) && p.inner?.diameter === pipeDiameter && /Alu$/.test(p.name)) ??
    pickOnly("grille", /^Wetterschutzgitter eckig WS-50 200 × 200, Alu$/, /Wetterschutz/i);

  const duct = (product: Product | null, label: string, length: number, bends: number, patch: Partial<NetNode> = {}) =>
    newNode("duct", { product: product?.key ?? null, diameter: product ? null : 160, label, length, bendCounts: { ...noBends(), 90: bends }, ...patch });
  const component = (type: NodeType, product: Product | null, label: string, patch: Partial<NetNode> = {}) =>
    newNode(type, { product: product?.key ?? null, label, ...patch });

  /** Smallest ComfoCube APV F with enough outlets for the tubes of one distributor. */
  const distributorFor = (outlets: number) =>
    products
      .filter((p) => p.kind === "distributor" && /APV F \d/.test(p.name) && (p.outlets ?? 0) >= outlets)
      .sort((a, b) => (a.outlets ?? 0) - (b.outlets ?? 0))[0] ?? pick("distributor", /APV F 10/i, /ComfoCube/i);

  /**
   * Room branch by room type (SIA 382/5): 1.1 Zimmer (supply) → ComfoCase CSB-P + ComfoGrid Bilamina (400 for one
   * tube, 600 for two); 2.5 short use (extract) → ComfoValve Via STC directly in a spiro pipe DN 125; all other
   * rooms → ComfoCase CLD-P 1×90 + ComfoGrid Genua for one tube, CLD breit 2×90 + ComfoGrid Genua breit for more.
   * Returns the branch and the distributor outlets it uses.
   */
  const branchFor = (r: RoomFlow, side: "supply" | "extract"): { node: NetNode; outlets: number } => {
    const room = { calcId: r.calcId, roomId: r.roomId };
    const kind = terminalKind(r.type, side);
    if (kind === "stc" && stcValve && spiro125) {
      const valve = component("terminal", null, r.name, { ...room, cover: stcValve.key });
      return { node: duct(spiro125, labels.roomDuct, 10, 2, { children: [valve] }), outlets: 1 };
    }
    const count = tubeCount(r[side]);
    const bilamina = kind === "bilamina";
    const casing = bilamina ? (count > 1 ? csbp600 : csbp400) : count > 1 ? cld : cldP;
    const group = bilamina ? `ComfoGrid Bilamina ${count > 1 ? 600 : 400}` : casing === cld ? "ComfoGrid Genua breit" : "ComfoGrid Genua";
    const terminal = component("terminal", casing, r.name, { ...room, ...measuredCover(casing, group, side, count > 1 ? /2x DN90/ : /1x DN90/) });
    // ComfoTubes are laid without bends (flexible tube).
    return { node: duct(tube, labels.roomDuct, 10, 0, { count, children: [terminal] }), outlets: count };
  };

  const tree = (side: "supply" | "extract") => {
    const served = rooms.filter((r) => r[side] > 0);
    const floors = [...new Set(served.map((r) => r.floor.trim()))].sort((a, b) => floorOrder(a) - floorOrder(b));
    const several = floors.length > 1;
    const distributorOf = (floor: string) => {
      const branches = served.filter((r) => r.floor.trim() === floor).map((r) => branchFor(r, side));
      const outlets = branches.reduce((s, b) => s + b.outlets, 0);
      return component("distributor", distributorFor(outlets), several && floor ? `${labels.distributor} ${floor}` : labels.distributor, {
        children: branches.map((b) => b.node),
      });
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
