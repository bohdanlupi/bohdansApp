// Layout of the Prinzipschema of a ventilation system (symbols after SIA 410; LUPI colours: outdoor air green,
// supply air red, extract air amber, exhaust air blue).
//
//   [AUL terminal] ── outdoor chain ──┐          ┌── supply tree ──► terminals (rooms, by storey)
//                                      [ device ]
//   [FOL terminal] ◄─ exhaust chain ──┘          └── extract tree ◄── terminals (rooms, by storey)

import type { NetNode, RoomFlow, SystemData } from "./network";

export type AirKind = "outdoor" | "supply" | "extract" | "exhaust";

export const airColors: Record<AirKind, string> = {
  outdoor: "#00ff00", // rgb(0, 255, 0)
  supply: "#ff0000", // rgb(255, 0, 0)
  extract: "#ffc000", // rgb(255, 192, 0)
  exhaust: "#0000ff", // rgb(0, 0, 255)
};

export type LayoutNode = { node: NetNode; air: AirKind; x: number; y: number; depth: number };
export type LayoutEdge = { from: { x: number; y: number }; to: { x: number; y: number }; air: AirKind; nodeId: string };
export type LayoutLeafLabel = { x: number; y: number; text: string; floor: string; air: AirKind; nodeId: string };

export type SchemaLayout = {
  width: number;
  height: number;
  device: { x: number; y: number; w: number; h: number };
  /** Height of the supply / extract main line at the device (for the air type labels). */
  airY: { supply: number; extract: number };
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  labels: LayoutLeafLabel[];
  floors: { air: AirKind; floor: string; y0: number; y1: number }[];
};

// Spacing so that the labels above the symbols («150 m³/h · 8.8 Pa») and the room labels never overlap.
const DX = 112;
const DY = 46;
/** Gap between the unit and the first element on each side (room for the ComfoFond / ComfoClime coils). */
const GAP = 70;
const floorOrder = (floor: string) => {
  const f = floor.trim().toUpperCase();
  const known = ["DG", "OG3", "3.OG", "OG2", "2.OG", "OG", "1.OG", "OG1", "EG", "UG", "KG", "UG2"];
  const i = known.indexOf(f);
  return i >= 0 ? i : 5;
};

/** Leaves of a tree with their storey, ordered top floor first. */
function orderedTree(roots: NetNode[], rooms: RoomFlow[]) {
  const floorOf = (n: NetNode): string => {
    if (n.type === "terminal") return rooms.find((r) => r.calcId === n.calcId && r.roomId === n.roomId)?.floor ?? "";
    return n.children.length ? floorOf(n.children[0]) : "";
  };
  const sortChildren = (n: NetNode): NetNode => ({
    ...n,
    children: [...n.children].map(sortChildren).sort((a, b) => floorOrder(floorOf(a)) - floorOrder(floorOf(b))),
  });
  return { roots: roots.map(sortChildren), floorOf };
}

export function layoutSystem(data: SystemData, rooms: RoomFlow[], roomLabel: (n: NetNode) => string): SchemaLayout {
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  const labels: LayoutLeafLabel[] = [];
  const floors: SchemaLayout["floors"] = [];

  const chainWidth = Math.max(data.outdoor.length, data.exhaust.length, 1) * DX + GAP;
  const deviceX = chainWidth;
  const deviceW = 110;
  const treeX0 = deviceX + deviceW + GAP;

  // Trees: tidy layout, x by depth, y by leaf order.
  const placeTree = (roots: NetNode[], air: AirKind, top: number) => {
    const { roots: sorted, floorOf } = orderedTree(roots, rooms);
    let leaf = 0;
    let lastFloor: string | null = null;
    let floorStart = top;
    const place = (n: NetNode, depth: number): number => {
      const x = treeX0 + depth * DX;
      let y: number;
      if (n.children.length === 0) {
        const floor = floorOf(n);
        if (lastFloor !== null && floor !== lastFloor) {
          floors.push({ air, floor: lastFloor, y0: floorStart, y1: top + leaf * DY - DY / 2 });
          floorStart = top + leaf * DY - DY / 2;
          leaf += 0.4;
        }
        if (lastFloor === null) floorStart = top - DY / 2;
        lastFloor = floor;
        y = top + leaf * DY;
        leaf++;
        labels.push({ x: x + 34, y, text: roomLabel(n), floor, air, nodeId: n.id });
      } else {
        const ys = n.children.map((c) => place(c, depth + 1));
        y = ys.length === 1 ? ys[0] : (ys[0] + ys[ys.length - 1]) / 2;
        for (let i = 0; i < n.children.length; i++) {
          const cx = treeX0 + (depth + 1) * DX;
          edges.push({ from: { x, y }, to: { x: cx, y: ys[i] }, air, nodeId: n.children[i].id });
        }
      }
      nodes.push({ node: n, air, x, y, depth });
      return y;
    };
    const rootYs = sorted.map((r) => place(r, 0));
    if (lastFloor !== null) floors.push({ air, floor: lastFloor, y0: floorStart, y1: top + leaf * DY - DY / 2 });
    return { rootYs, height: Math.max(leaf, 1) * DY };
  };

  const supplyTop = 48;
  const supply = placeTree(data.supply, "supply", supplyTop);
  const extractTop = supplyTop + supply.height + 50;
  const extract = placeTree(data.extract, "extract", extractTop);

  const deviceY = supplyTop - 10;
  const deviceH = extractTop + extract.height - deviceY - 10;
  const supplyY = supply.rootYs[0] ?? supplyTop;
  const extractY = extract.rootYs[0] ?? extractTop;

  // Device → tree roots.
  for (const [ys, air] of [
    [supply.rootYs, "supply"],
    [extract.rootYs, "extract"],
  ] as const) {
    ys.forEach((y, i) => {
      const root = (air === "supply" ? data.supply : data.extract)[i];
      edges.push({ from: { x: deviceX + deviceW, y }, to: { x: treeX0, y }, air, nodeId: root.id });
    });
  }

  // Chains to the left of the device, device side first.
  const placeChain = (chain: NetNode[], air: AirKind, y: number) => {
    let prevX = deviceX;
    chain.forEach((n, i) => {
      const x = deviceX - GAP - i * DX;
      edges.push({ from: { x: prevX, y }, to: { x, y }, air, nodeId: n.id });
      nodes.push({ node: n, air, x, y, depth: i });
      prevX = x;
    });
  };
  placeChain(data.outdoor, "outdoor", supplyY);
  placeChain(data.exhaust, "exhaust", extractY);

  const maxDepth = Math.max(0, ...nodes.filter((n) => n.air === "supply" || n.air === "extract").map((n) => n.depth));
  // Right of the last terminals: room name and «Auslass + cover · flow · Δp», then the storey bands.
  const width = treeX0 + maxDepth * DX + 34 + 250 + 70;
  const height = extractTop + extract.height + 60; // room below the device for the attachment labels
  return { width, height, device: { x: deviceX, y: deviceY, w: deviceW, h: Math.max(deviceH, 80) }, airY: { supply: supplyY, extract: extractY }, nodes, edges, labels, floors };
}
