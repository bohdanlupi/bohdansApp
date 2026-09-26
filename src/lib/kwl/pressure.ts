// Pressure drop of the duct networks of a dwelling ventilation system (star network):
//   supply side  AUL terminal → AUL duct → [device] → main duct / silencer / distributor → branch per room → terminal
//   extract side terminal → branch per room → distributor / main duct → [device] → FOL duct → FOL terminal
// The path with the largest pressure drop is the external pressure drop of the device on that side
// (SIA 382/5 Table 7 limits the sum of both sides). Air flows in m³/h, lengths in m, diameters in mm, pressures in Pa.

import { type KwlRoom, roomDistribution } from "./calc";

/** Air at about 20 °C. */
export const airDensity = 1.2;
const kinematicViscosity = 15.1e-6;

/**
 * Absolute roughness [mm] – textbook values (e.g. Recknagel), not from SIA 382/5 / EN-105; check manufacturer
 * data (pressure-loss diagrams) where available.
 */
export const ductMaterials = {
  plastic: 0.02,
  steel: 0.15,
  flex: 1.5,
} as const;
export type DuctMaterial = keyof typeof ductMaterials;

/** Typical loss coefficient of a 90° bend (round, r/d ≈ 1 … 1.5). */
export const bendZeta = 0.3;

/** Duct presets: [label, inner diameter mm, material]. */
export const ductPresets: { key: string; label: string; inner: number; material: DuctMaterial }[] = [
  { key: "comfoTube-75", label: "ComfoTube 75", inner: 61, material: "plastic" },
  { key: "comfoTube-90", label: "ComfoTube 90", inner: 74, material: "plastic" },
  { key: "comfoTube-110", label: "ComfoTube 110", inner: 93, material: "plastic" },
  { key: "comfoPipe-180", label: "ComfoPipe 180", inner: 150, material: "plastic" },
  { key: "comfoPipe-210", label: "ComfoPipe 210", inner: 180, material: "plastic" },
  ...[80, 100, 125, 150, 160, 180, 200, 250].map((d) => ({ key: `spiro-${d}`, label: `Spiro ø ${d}`, inner: d, material: "steel" as const })),
];

export type Segment = {
  id: string;
  name: string;
  kind: "duct" | "component";
  preset: string;
  shape: "round" | "rect";
  /** Inner diameter [mm] (round). */
  diameter: number | null;
  /** Inner width / height [mm] (rectangular). */
  width: number | null;
  height: number | null;
  length: number | null;
  /** Parallel ducts sharing the flow (e.g. 2× ComfoTube 90). */
  count: number;
  material: DuctMaterial;
  /** Roughness override [mm]. */
  roughness: number | null;
  bends: number | null;
  /** Further loss coefficients (T-pieces, transitions, inlet/outlet). */
  zeta: number | null;
  /** Component: pressure drop from the datasheet at the reference flow; scaled with (q / q_ref)². */
  dpRef: number | null;
  qRef: number | null;
  /** Flow override (m³/h) for main segments that do not carry the full side flow. */
  flow: number | null;
};

export type NetworkSide = { outer: Segment[]; main: Segment[]; branches: Record<string, Segment[]> };
export type Network = { supply: NetworkSide; extract: NetworkSide; applyToDevice: boolean };

export type SegmentResult = { flow: number; dp: number; velocity: number | null; r: number | null };

/** Darcy friction factor (laminar 64/Re, turbulent Swamee–Jain, linear in between). */
export function frictionFactor(re: number, relativeRoughness: number): number {
  if (re <= 0) return 0;
  const turbulent = (r: number) => 0.25 / Math.log10(relativeRoughness / 3.7 + 5.74 / r ** 0.9) ** 2;
  if (re < 2300) return 64 / re;
  if (re < 4000) return 64 / 2300 + ((turbulent(4000) - 64 / 2300) * (re - 2300)) / 1700;
  return turbulent(re);
}

/** Pressure drop of one segment at the given flow (for the whole segment, parallel ducts share the flow). */
export function segmentResult(segment: Segment, flow: number): SegmentResult {
  if (segment.kind === "component") {
    const dp = segment.dpRef == null ? 0 : segment.qRef ? segment.dpRef * (flow / segment.qRef) ** 2 : segment.dpRef;
    return { flow, dp, velocity: null, r: null };
  }
  const count = Math.max(1, segment.count);
  const q = flow / count / 3600;
  let area: number;
  let dh: number;
  if (segment.shape === "rect") {
    const w = (segment.width ?? 0) / 1000;
    const h = (segment.height ?? 0) / 1000;
    area = w * h;
    dh = w + h > 0 ? (2 * w * h) / (w + h) : 0;
  } else {
    const d = (segment.diameter ?? 0) / 1000;
    area = (Math.PI * d * d) / 4;
    dh = d;
  }
  if (!(area > 0) || !(dh > 0)) return { flow, dp: 0, velocity: null, r: null };
  const v = q / area;
  const dynamic = (airDensity * v * v) / 2;
  const roughness = (segment.roughness ?? ductMaterials[segment.material]) / 1000;
  const lambda = frictionFactor((v * dh) / kinematicViscosity, roughness / dh);
  const r = (lambda / dh) * dynamic;
  const zeta = (segment.bends ?? 0) * bendZeta + (segment.zeta ?? 0);
  return { flow, dp: r * (segment.length ?? 0) + zeta * dynamic, velocity: v, r };
}

export type BranchResult = {
  roomId: string;
  flow: number;
  segments: SegmentResult[];
  branch: number;
  path: number;
  /** Pressure to be throttled at this branch so it gets its flow (critical path − own path). */
  throttle: number;
  missing: boolean;
};

export type SideResult = {
  flow: number;
  outer: SegmentResult[];
  main: SegmentResult[];
  common: number;
  branches: BranchResult[];
  /** External pressure drop of the device on this side (largest path), null without any segment. */
  critical: number | null;
  criticalRoom: string | null;
};

const sideFlow = (room: KwlRoom, side: "supply" | "extract") => (side === "supply" ? room.supply : room.extract) ?? 0;

export function evaluateSide(network: NetworkSide, rooms: KwlRoom[], side: "supply" | "extract"): SideResult {
  const served = rooms.filter((r) => sideFlow(r, side) > 0);
  const flow = served.reduce((s, r) => s + sideFlow(r, side), 0);
  const outer = network.outer.map((seg) => segmentResult(seg, seg.flow ?? flow));
  const main = network.main.map((seg) => segmentResult(seg, seg.flow ?? flow));
  const common = [...outer, ...main].reduce((s, x) => s + x.dp, 0);
  const branches = served.map((room): BranchResult => {
    const segments = (network.branches[room.id] ?? []).map((seg) => segmentResult(seg, sideFlow(room, side)));
    const branch = segments.reduce((s, x) => s + x.dp, 0);
    return { roomId: room.id, flow: sideFlow(room, side), segments, branch, path: common + branch, throttle: 0, missing: segments.length === 0 };
  });
  const hasSegments = network.outer.length + network.main.length + branches.filter((b) => !b.missing).length > 0;
  const worst = branches.reduce<BranchResult | null>((m, b) => (!m || b.path > m.path ? b : m), null);
  const critical = hasSegments ? (worst?.path ?? common) : null;
  for (const b of branches) b.throttle = critical !== null ? critical - b.path : 0;
  return { flow, outer, main, common, branches, critical, criticalRoom: worst?.roomId ?? null };
}

export function evaluateNetwork(network: Network, rooms: KwlRoom[]) {
  return { supply: evaluateSide(network.supply, rooms, "supply"), extract: evaluateSide(network.extract, rooms, "extract") };
}

export type NetworkResult = ReturnType<typeof evaluateNetwork>;

// ---------------------------------------------------------------------------
// Default network (star network with ComfoTube branches) as a starting point
// ---------------------------------------------------------------------------

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

export const emptySegment = (patch: Partial<Segment> = {}): Segment => ({
  id: newId(),
  name: "",
  kind: "duct",
  preset: "",
  shape: "round",
  diameter: null,
  width: null,
  height: null,
  length: null,
  count: 1,
  material: "plastic",
  roughness: null,
  bends: null,
  zeta: null,
  dpRef: null,
  qRef: null,
  flow: null,
  ...patch,
});

export const presetSegment = (presetKey: string, patch: Partial<Segment> = {}): Segment => {
  const preset = ductPresets.find((p) => p.key === presetKey)!;
  return emptySegment({ preset: preset.key, name: preset.label, diameter: preset.inner, material: preset.material, ...patch });
};

export type DefaultNames = {
  intake: string;
  intakeDuct: string;
  exhaust: string;
  exhaustDuct: string;
  mainSupply: string;
  mainExtract: string;
  silencer: string;
  distributor: string;
  supplyTerminal: string;
  extractTerminal: string;
};

/**
 * Star network: outer duct ComfoPipe 180, main duct + silencer + distributor, per room 1–3 ComfoTube 90 (as in the
 * workbook's distribution sketch) with 10 m and 2 bends, terminals. Component pressure drops are left empty – take
 * them from the datasheets.
 */
export function defaultNetwork(rooms: KwlRoom[], names: DefaultNames): Network {
  const tubes = (flow: number | null) => (!flow ? 1 : flow < 38 ? 1 : flow <= 60 ? 2 : Math.ceil(flow / 30));
  const branches = (side: "supply" | "extract", terminal: string) =>
    Object.fromEntries(
      rooms
        .filter((r) => sideFlow(r, side) > 0)
        .map((r) => {
          const flow = sideFlow(r, side);
          const hint = roomDistribution(flow, side);
          return [
            r.id,
            [
              presetSegment("comfoTube-90", { count: tubes(flow), length: 10, bends: 2 }),
              emptySegment({ kind: "component", name: hint ? `${terminal} (${hint.terminal})` : terminal, qRef: flow }),
            ],
          ];
        }),
    );
  return {
    applyToDevice: true,
    supply: {
      outer: [emptySegment({ kind: "component", name: names.intake }), presetSegment("comfoPipe-180", { name: names.intakeDuct, length: 3, bends: 2 })],
      main: [
        presetSegment("comfoPipe-180", { name: names.mainSupply, length: 2, bends: 1 }),
        emptySegment({ kind: "component", name: names.silencer }),
        emptySegment({ kind: "component", name: names.distributor }),
      ],
      branches: branches("supply", names.supplyTerminal),
    },
    extract: {
      outer: [presetSegment("comfoPipe-180", { name: names.exhaustDuct, length: 3, bends: 2 }), emptySegment({ kind: "component", name: names.exhaust })],
      main: [
        presetSegment("comfoPipe-180", { name: names.mainExtract, length: 2, bends: 1 }),
        emptySegment({ kind: "component", name: names.silencer }),
        emptySegment({ kind: "component", name: names.distributor }),
      ],
      branches: branches("extract", names.extractTerminal),
    },
  };
}

/** Rooms of the dwelling that belong to a network side but have no branch yet. */
export const roomsWithoutBranch = (side: NetworkSide, rooms: KwlRoom[], which: "supply" | "extract") =>
  rooms.filter((r) => sideFlow(r, which) > 0 && !side.branches[r.id]?.length);
