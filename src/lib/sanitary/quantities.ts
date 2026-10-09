// Material list of a Sanitäranlage: Nussbaum pipes [m], valves [Stk] by size, the Biral pump, the neutral parts
// (Wasserzähler of the utility, Wassererwärmer, thermischer Mischer) and the insulation as Meier Tobler pipe shells –
// Mineralwolle: ROHHE r.Heat A Alu kaschiert, PIR: swisspor Kisodur PIR Alu (glatt) – with 20 % for the fittings.

import { type NussbaumFamily, nussbaumArticles } from "./catalog-data";
import { distributorPlan } from "./distributor";
import { systemFittings } from "./fittings";
import { type InsulationShell, insulationShells } from "./insulation-data";
import type { PipeResult, SanitaryData, SanNode, SystemResult } from "./network";
import { articleFor, type InsulationMaterial, type PipeSize, pipeArticle } from "./pipes";

export type QuantityLine = {
  key: string;
  group: "pipes" | "valves" | "central" | "insulation";
  manufacturer: "Nussbaum" | "Biral" | "Meier Tobler" | null;
  article: string | null;
  label: string;
  unit: "m" | "Stk";
  quantity: number;
};

/** Valves of each Strang (Steigstrang foot) and of the Zentrale, by what they are. */
export const strangValves = {
  shutoffDrain: "82202",
  shutoff: "82200",
  check: "81163",
  thermal: "36030",
  manual: "24026",
} as const satisfies Record<string, NussbaumFamily>;

/**
 * Valves by the pipe system of the line: Optipress-Aquaplus, or on Optiflex lines only Optiflex-Flowpress (its
 * Schrägsitzventil; Flowpress has none with Entleerung and no Rückflussverhinderer, so the threaded 15101 EA with
 * Flowpress transitions).
 */
const valveFor = (kind: "shutoffDrain" | "shutoff" | "check", size: PipeSize): NussbaumFamily =>
  size.system === "optiflex" ? (kind === "check" ? "15101" : "86510") : strangValves[kind];

export function systemQuantities(data: SanitaryData, result: SystemResult): QuantityLine[] {
  const map = new Map<string, QuantityLine>();
  const add = (line: Omit<QuantityLine, "quantity">, amount: number) => {
    if (amount <= 0) return;
    const current = map.get(line.key);
    if (current) current.quantity += amount;
    else map.set(line.key, { ...line, quantity: amount });
  };
  const nussbaum = (group: QuantityLine["group"], family: NussbaumFamily, size: PipeSize | null, amount: number) => {
    const a = articleFor(family, size);
    if (a) add({ key: `nb|${a.number}`, group, manufacturer: "Nussbaum", article: a.number, label: a.text, unit: "Stk" }, amount);
  };
  const pipe = (size: PipeSize, metres: number) => {
    const a = pipeArticle(size);
    add({ key: `pipe|${size.key}`, group: "pipes", manufacturer: "Nussbaum", article: a?.number ?? null, label: a?.text ?? size.label, unit: "m" }, metres);
  };
  // Insulation: the shell of the material for the pipe (Rohr an Rohr: the fictive pipe one size larger) and thickness,
  // +20 % for bends, T-pieces and valves; without a fitting shell an R-position naming the insulation.
  const material = data.settings.insulationMaterial;
  const insulation = (mm: number, size: PipeSize, metres: number, shared: boolean) => {
    const shell = insulationShell(material, size.od, mm);
    const amount = metres * (1 + INSULATION_ALLOWANCE);
    if (shell) add({ key: `ins|${shell.number}`, group: "insulation", manufacturer: "Meier Tobler", article: shell.number, label: shell.text, unit: "m" }, amount);
    else add({ key: `ins|${mm}|${size.key}|${shared}`, group: "insulation", manufacturer: null, article: null, label: `Dämmung ${mm} mm – ${size.label}${shared ? " (Rohr an Rohr)" : ""}`, unit: "m" }, amount);
  };

  // Wohnungsverteiler of an Apparategruppe (distributor.ts): the Unterputz box behind the Waschtisch with its
  // Messkapseln / Reduzierpatronen, or the single parts per line sized by the Leitung feeding it; the Verteilerkasten.
  const distributor = (c: SanNode, feed: PipeResult) => {
    const plan = distributorPlan(c.distributor, c.outlets);
    if (plan.box) nussbaum("valves", plan.box, null, 1);
    const cabinet = plan.cabinet ? nussbaumArticles["86044"].find((a) => a.number === plan.cabinet) : null;
    if (cabinet) add({ key: `nb|${cabinet.number}`, group: "valves", manufacturer: "Nussbaum", article: cabinet.number, label: cabinet.text, unit: "Stk" }, 1);
    for (const m of plan.lines) {
      const parts = c.distributor[m];
      const size = feed[m]?.size ?? null;
      if (plan.box === "70120") {
        if (parts.meter === "meter") nussbaum("valves", "67016", null, 1);
        continue;
      }
      if (plan.box === "70112") {
        if (parts.reducer) nussbaum("valves", "11050", null, 1);
        continue;
      }
      if (parts.shutoff && size) nussbaum("valves", valveFor("shutoff", size), size, 1);
      if (parts.reducer) nussbaum("valves", "11000", size, 1);
      if (parts.meter !== "none") nussbaum("valves", "67100", size, 1);
      if (parts.meter === "meter") nussbaum("valves", "67016", null, 1);
    }
  };

  const walk = (n: SanNode) => {
    // Ausstossleitungen of the Apparate: Pex PWC / PWH with their lengths (none for the Waschtisch at its box).
    for (const o of n.outlets) {
      const r = result.outlets.get(o.id);
      if (!r || r.fromBox) continue;
      if (r?.pwc) pipe(r.pwc.size, o.lengthPwc ?? 0);
      if (r?.pwh) pipe(r.pwh.size, o.lengthPwh ?? 0);
    }
    const r = result.pipes.get(n.id);
    if (n.type === "pipe" && r) {
      const length = n.length ?? 0;
      if (r.pwc) pipe(r.pwc.size, length);
      if (r.pwh) pipe(r.pwh.size, length);
      if (r.pwhc) pipe(r.pwhc.size, length);
      if (r.insulation.pwc && r.pwc) insulation(r.insulation.pwc, r.pwc.size, length, false);
      if (r.insulation.pwh && r.pwh) insulation(r.insulation.pwh, r.pwh.size, length, false);
      if (r.insulation.pwhc && r.pwhc) insulation(r.insulation.pwhc, r.pwhc.size, length, false);
      if (r.insulation.shared) insulation(r.insulation.shared.mm, r.insulation.shared.size, length, true);
      if (r.strang !== null) {
        // Foot of a Strang: Absperrventil mit Entleerung on PWC / PWH / PWH-C, Rückflussverhinderer and Regulierventil.
        if (r.pwc) nussbaum("valves", valveFor("shutoffDrain", r.pwc.size), r.pwc.size, 1);
        if (r.pwh) nussbaum("valves", valveFor("shutoffDrain", r.pwh.size), r.pwh.size, 1);
        if (r.pwhc) {
          nussbaum("valves", valveFor("shutoffDrain", r.pwhc.size), r.pwhc.size, 1);
          nussbaum("valves", valveFor("check", r.pwhc.size), r.pwhc.size, 1);
          nussbaum("valves", n.regValve === "manual" ? strangValves.manual : strangValves.thermal, r.pwhc.size, 1);
        }
      } else if (n.shutoff) {
        if (r.pwc) nussbaum("valves", valveFor("shutoff", r.pwc.size), r.pwc.size, 1);
        if (r.pwh) nussbaum("valves", valveFor("shutoff", r.pwh.size), r.pwh.size, 1);
      }
      for (const c of n.children) if (c.type === "consumer") distributor(c, r);
    }
    n.children.forEach(walk);
  };
  data.network.forEach(walk);

  // Fittings of the Leitungen (Bogen, T-Stücke, Reduktionen, Übergänge, Muffen, Verteiler) under «Rohre».
  for (const f of systemFittings(data, result)) {
    add({ key: f.key, group: "pipes", manufacturer: f.article ? "Nussbaum" : null, article: f.article, label: f.label, unit: "Stk" }, f.count);
  }

  // Circuits that end outside a Strang get their own Regulierventil, Rückflussverhinderer and Absperrung.
  for (const c of result.circuits) {
    if (c.footId) continue;
    const r = result.pipes.get(c.endId);
    const node = findIn(data.network, c.endId);
    if (!r?.pwhc || !node) continue;
    nussbaum("valves", valveFor("shutoff", r.pwhc.size), r.pwhc.size, 1);
    nussbaum("valves", valveFor("check", r.pwhc.size), r.pwhc.size, 1);
    nussbaum("valves", node.regValve === "manual" ? strangValves.manual : strangValves.thermal, r.pwhc.size, 1);
  }

  // Zentrale.
  const { central } = data;
  const trunk = result.central.trunk?.size ?? null;
  // Lines of the Zentrale with their lengths: pipe and insulation like the Verteilung.
  const ci = result.central.insulation;
  const line = (size: PipeSize | null | undefined, metres: number | null, mm: number | null) => {
    if (!size || !metres) return;
    pipe(size, metres);
    if (mm) insulation(mm, size, metres, false);
  };
  line(trunk, central.trunkLength, ci.trunk);
  line(result.central.supply?.size, central.centralLength, ci.supply);
  if (result.lu.warm > 0) {
    line(result.central.feed?.size, central.heaterLength, ci.feed);
    line(result.central.hot?.size, central.heaterLength, ci.hot);
    if (result.pump) line(result.central.ret, central.heaterLength, ci.ret);
  }
  if (trunk) {
    if (central.meter) {
      add({ key: "meter", group: "central", manufacturer: null, article: null, label: "Wasserzähler (Netzbetreiberin)", unit: "Stk" }, 1);
      nussbaum("central", "82200", trunk, 2);
    }
    if (central.filter === "fine") nussbaum("central", "18102", trunk, 1);
    if (central.filter === "redfil") nussbaum("central", "12102", trunk, 1);
    if (central.reducer && central.filter !== "redfil") nussbaum("central", "11002", trunk, 1);
    if (central.softener !== "none") nussbaum("central", "19053", null, 1);
  }
  // Batterieventil per outlet of the Verteilbatterie («trunk x outlet»).
  const battery = (outlet: PipeSize | null | undefined) => {
    const a = trunk && outlet ? batteryValve(trunk.od, outlet.od) : null;
    if (a) add({ key: `nb|${a.number}`, group: "central", manufacturer: "Nussbaum", article: a.number, label: a.text, unit: "Stk" }, 1);
  };
  battery(result.central.supply?.size);
  battery(result.central.feed?.size);
  if (result.central.feed && central.safetyGroup) nussbaum("central", "81168", result.central.feed.size, 1);
  if (result.lu.warm > 0) add({ key: "heater", group: "central", manufacturer: null, article: null, label: `Wassererwärmer${central.heaterVolume ? ` ${central.heaterVolume} l` : ""}`, unit: "Stk" }, 1);
  if (central.mixer) add({ key: "mixer", group: "central", manufacturer: null, article: null, label: "Thermischer Mischer", unit: "Stk" }, 1);
  if (result.pump?.chosen) {
    const p = result.pump.chosen;
    add({ key: `pump|${p.number}`, group: "central", manufacturer: "Biral", article: p.number, label: `Biral ${p.name}`, unit: "Stk" }, 1);
    const ret = result.central.ret;
    if (ret) {
      nussbaum("central", "82200", ret, 2);
      nussbaum("central", "81163", ret, 1);
    }
  }
  return [...map.values()].map((q) => ({ ...q, quantity: q.unit === "m" ? Math.ceil(q.quantity * 10) / 10 : q.quantity }));
}

function findIn(roots: SanNode[], id: string): SanNode | null {
  for (const n of roots) {
    if (n.id === id) return n;
    const f = findIn(n.children, id);
    if (f) return f;
  }
  return null;
}

/** Batterieventile (82232) by the sizes in their text, e.g. «35 x 22». */
const batteryValves = nussbaumArticles["82232"]
  .map((article) => {
    const m = /^(\d+) x (\d+)/.exec(article.size ?? "");
    return m ? { trunk: Number(m[1]), outlet: Number(m[2]), article } : null;
  })
  .filter((x): x is NonNullable<typeof x> => !!x)
  .sort((a, b) => a.trunk - b.trunk || a.outlet - b.outlet);

/** Allowance on the insulation lengths for the fittings (bends, T-pieces, valves). */
export const INSULATION_ALLOWANCE = 0.2;

/**
 * Meier Tobler shell for a pipe outer diameter and thickness: the smallest inner diameter that fits the pipe (76 / 89
 * for 76.1 / 88.9); where the thickness does not come in that size, the next larger size of that thickness.
 */
export function insulationShell(material: InsulationMaterial, od: number, mm: number): InsulationShell | null {
  return insulationShells.filter((s) => s.material === material && s.mm === mm && s.od >= od - 0.6).sort((a, b) => a.od - b.od)[0] ?? null;
}

/** Batterieventil for a trunk and outlet size: the smallest trunk ≥ the size with that outlet, else the closest. */
function batteryValve(trunk: number, outlet: number) {
  const fits = batteryValves.filter((b) => b.trunk >= trunk);
  return (fits.find((b) => b.outlet === outlet) ?? fits.find((b) => b.outlet >= outlet) ?? fits[0] ?? batteryValves[batteryValves.length - 1])?.article ?? null;
}
