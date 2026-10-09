// Fittings of the Sanitär material list (group «Rohre»), per line (PWC, PWH, PWH-C) in its system and size:
//   Bogen 90° / 45°      as entered on the Leitung (Flowpress 45° only from Pex 25; smaller Pex is bent by hand)
//   T-Stücke             one less than the lines leaving the end of a Leitung; reduced where Nussbaum has the T, else an
//                        equal T and Reduktionen; also where the PWH-C joins the PWH at the end of a circuit
//   Reduktionen          where the size changes without a branch (Aquaplus Reduktion, Flowpress Kupplung)
//   Übergänge            Optipress-Aquaplus → Optiflex-Flowpress (84234 «Pex x NW»)
//   Muffen               Optipress comes in bars of 6 m: one per joint
//   Flowpress-Verteiler  per Apparategruppe for PWC and PWH, 2- / 3- / 4-fach, with the connection of the feed pipe
// Only for the material list: the Zirkulation keeps its allowance for fittings on the pipe length.

import { type NussbaumFamily, nussbaumArticles } from "./catalog-data";
import { consumerLu, type Medium, type SanitaryData, type SanNode, type SystemResult } from "./network";
import { type PipeSize, sizeText } from "./pipes";
import { appliances } from "./w3";

export type FittingLine = { key: string; article: string | null; label: string; count: number };

const BAR = 6;

/** Articles of a family with their dimensions (entries for the 1-LU pipe «16x3.8» left out). */
const dimsOf = (family: NussbaumFamily) =>
  (nussbaumArticles[family] ?? [])
    .filter((a) => a.size && !/3\.8/.test(a.size))
    .map((a) => ({ article: a, dims: a.size!.split(/\s*x\s*/).map((v) => Number.parseFloat(v.replace(",", "."))) }));

const same = (a: number, b: number) => Math.abs(a - b) < 0.05;

/** Article of a family with exactly these dimensions; a single size stands for all equal dimensions (equal T). */
function find(families: NussbaumFamily[], dims: number[]) {
  for (const f of families) {
    const hit = dimsOf(f).find((e) => (e.dims.length === dims.length ? e.dims.every((d, i) => same(d, dims[i])) : e.dims.length === 1 && dims.every((d) => same(d, e.dims[0]))));
    if (hit) return hit.article;
  }
  return null;
}

const families = {
  optipress: { bend90: ["80000"], bend45: ["80003"], tee: ["80010", "81010"], reducer: ["80021", "81021"], coupling: ["80020"] },
  optiflex: { bend90: ["84240"], bend45: ["84241"], tee: ["84242"], reducer: ["84236"], coupling: ["84236"] },
} as const satisfies Record<string, Record<string, NussbaumFamily[]>>;

const names = { bend90: "Bogen 90°", bend45: "Bogen 45°", tee: "T-Stück", reducer: "Reduktion", coupling: "Muffe", transition: "Übergang", manifold: "Verteiler" };

export function systemFittings(data: SanitaryData, result: SystemResult): FittingLine[] {
  const map = new Map<string, FittingLine>();
  const addArticle = (article: { number: string; text: string } | null, fallback: string, count = 1) => {
    if (count <= 0) return;
    const key = article ? `fit|${article.number}` : `fit|${fallback}`;
    const current = map.get(key);
    if (current) current.count += count;
    else map.set(key, { key, article: article?.number ?? null, label: article?.text ?? fallback, count });
  };
  const sizeOf = (n: SanNode, m: Medium): PipeSize | null => {
    const r = result.pipes.get(n.id);
    return (m === "pwc" ? r?.pwc?.size : m === "pwh" ? r?.pwh?.size : r?.pwhc?.size) ?? null;
  };

  /** Reduktion between two sizes of one system; steps through intermediate sizes when Nussbaum has no direct one. */
  const reduce = (big: PipeSize, small: PipeSize) => {
    if (same(big.od, small.od)) return;
    const [a, b] = big.od > small.od ? [big, small] : [small, big];
    const direct = find([...families[a.system].reducer], [a.od, b.od]);
    if (direct) return addArticle(direct, "");
    const step = dimsOf(families[a.system].reducer[0])
      .filter((e) => same(e.dims[0], a.od) && e.dims[1] > b.od)
      .sort((x, y) => x.dims[1] - y.dims[1])[0];
    if (step) {
      addArticle(step.article, "");
      return reduce({ ...a, od: step.dims[1] }, b);
    }
    addArticle(null, `${names.reducer} ${sizeText(a)} / ${sizeText(b)}`);
  };

  /** Übergang Optipress-Aquaplus → Optiflex-Flowpress; returns the Aquaplus size it connects to. */
  const transition = (pex: PipeSize, steel: PipeSize): PipeSize => {
    const options = dimsOf("84234").filter((e) => same(e.dims[0], pex.od)).sort((x, y) => x.dims[1] - y.dims[1]);
    const pick = options.find((e) => same(e.dims[1], steel.od)) ?? [...options].reverse().find((e) => e.dims[1] <= steel.od) ?? options[0];
    if (!pick) {
      addArticle(null, `${names.transition} ${sizeText(steel)} / ${sizeText(pex)}`);
      return steel;
    }
    addArticle(pick.article, "");
    return { ...steel, od: pick.dims[1] };
  };

  /** Join from a parent line into a child line of the same or the other system (size change / transition). */
  const join = (from: PipeSize, to: PipeSize) => {
    if (from.system === to.system) return reduce(from, to);
    if (from.system === "optipress" && to.system === "optiflex") return reduce(from, transition(to, from));
    // Pex feeding steel (unusual): the transition the other way round.
    reduce(to, transition(from, to));
  };

  /** T-Stück on a run of size `run` with a branch `branch` and outlet `out` (same system as the run). */
  const tee = (run: PipeSize, branch: PipeSize, out: PipeSize) => {
    const sys = run.system;
    const b = branch.system === sys ? branch : sys === "optipress" ? transition(branch, run) : branch;
    const o = out.system === sys ? out : sys === "optipress" ? transition(out, run) : out;
    const exact = find([...families[sys].tee], [run.od, b.od, o.od]);
    if (exact) return addArticle(exact, "");
    const equal = find([...families[sys].tee], [run.od, run.od, run.od]);
    addArticle(equal, `${names.tee} ${sizeText(run)}`);
    if (!same(b.od, run.od)) reduce(run, b);
    if (!same(o.od, run.od)) reduce(run, o);
  };

  const carries = (n: SanNode, m: Medium) => {
    if (n.type === "consumer") {
      const lu = consumerLu(n.outlets);
      return m === "pwc" ? lu.cold > 0 : m === "pwh" ? lu.warm > 0 : false;
    }
    return !!sizeOf(n, m);
  };

  const manifold = (feed: PipeSize, outlets: number) => {
    if (outlets < 2) return;
    // Combinations of the 2-, 3- and 4-fach Verteiler (never a single outlet left).
    const parts: number[] = [];
    let n = outlets;
    while (n > 4) {
      parts.push(4);
      n -= 4;
    }
    if (n === 1) {
      parts[parts.length - 1] = 3;
      n = 2;
    }
    parts.push(n);
    // Sizes «16 x ¾ x n»: the last number is the count of outlets.
    for (const k of parts) addArticle(dimsOf(k === 2 ? "84260" : "84261").find((e) => e.dims.at(-1) === k)?.article ?? null, `${names.manifold} ${k}-fach`);
    // Connection of the feed pipe to the Verteiler (¾).
    if (feed.system === "optiflex") addArticle(dimsOf("84250").find((e) => same(e.dims[1], feed.od))?.article ?? null, `Verteileranschluss ¾ / ${sizeText(feed)}`);
    else addArticle((nussbaumArticles["80033"] ?? []).find((a) => a.size === `${feed.od} x ¾`) ?? null, `${names.transition} ${sizeText(feed)} / ¾`);
  };

  const walk = (n: SanNode) => {
    if (n.type !== "pipe") return;
    const length = n.length ?? 0;
    for (const m of ["pwc", "pwh", "pwhc"] as const) {
      const size = sizeOf(n, m);
      if (!size) continue;
      const fam = families[size.system];
      // Bogen as entered (Flowpress 45° only from Pex 25).
      if (n.bends90) addArticle(find([...fam.bend90], [size.od]), `${names.bend90} ${sizeText(size)}`, n.bends90);
      if (n.bends45) {
        const bend = find([...fam.bend45], [size.od]);
        if (bend || size.system === "optipress") addArticle(bend, `${names.bend45} ${sizeText(size)}`, n.bends45);
      }
      // Muffen at the joints of the 6 m bars.
      if (size.system === "optipress" && length > BAR) addArticle(find([...fam.coupling], [size.od]), `${names.coupling} ${sizeText(size)}`, Math.ceil(length / BAR - 1e-9) - 1);
      // Lines leaving the end of this Leitung: T-Stücke, Reduktionen and Übergänge.
      const kids = n.children.filter((c) => carries(c, m));
      const kidSize = (c: SanNode) => (c.type === "consumer" ? size : (sizeOf(c, m) ?? size));
      if (kids.length === 1) join(size, kidSize(kids[0]));
      else if (kids.length > 1) {
        const ordered = [...kids].sort((a, b) => kidSize(b).od - kidSize(a).od);
        const [main, ...branches] = ordered;
        branches.forEach((b, i) => tee(size, kidSize(b), i === branches.length - 1 ? kidSize(main) : size));
      }
    }
    // End of a circuit: the PWH-C joins the PWH with a T-Stück.
    if (result.circuits.some((c) => c.endId === n.id)) {
      const pwh = sizeOf(n, "pwh");
      const pwhc = sizeOf(n, "pwhc");
      if (pwh && pwhc) tee(pwh, pwhc, pwh);
    }
    // Apparategruppen at the end of this Leitung: Flowpress-Verteiler for PWC and PWH.
    for (const c of n.children) {
      if (c.type !== "consumer") continue;
      for (const m of ["pwc", "pwh"] as const) {
        const feed = sizeOf(n, m);
        if (!feed) continue;
        const outlets = c.outlets.filter((o) => (m === "pwc" ? appliances[o.type].cold : appliances[o.type].warm) > 0).length;
        manifold(feed, outlets);
      }
    }
    n.children.forEach(walk);
  };
  data.network.forEach(walk);
  return [...map.values()];
}
