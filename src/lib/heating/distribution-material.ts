// Materialauszug of 243 Wärmeverteilung (Strangschema), by chapter of the LV structure «Heizung» (243.x):
//   .1 Leitungen   pipes (VL + RL), Bögen 90° / 45° and T-Stücke at the branches – Optipress-Therm (Nussbaum, in
//                  material-data.ts) or Optiflex-Flowpress (Nussbaum, from the Sanitär catalogue data)
//   .2 Armaturen   Kugelhähne at the Strang feet and where Absperrungen are set, Rücklaufverschraubungen (neutral)
//   .3 Regel- und Sicherheitsorgane  Strangregulierventile (IMI STAD), Heizkörperventile with Thermostatkopf (neutral,
//                  the type depends on the Heizkörper)
//   .4 Abgabesystem Heizkörper and Verbraucher (neutral, with their power)
//   .6 Dämmung     Meier Tobler pipe shells by size and SIA 384/1 thickness (PIR for λ ≤ 0.03, else Mineralwolle),
//                  +20 % for fittings and valves
// The Fussbodenheizungs-Verteiler are not listed here (they belong to the Fussbodenheizung).

import { nussbaumArticles } from "@/lib/sanitary/catalog-data";
import { insulationShells } from "@/lib/sanitary/insulation-data";

import type { DistributionData, DistributionResult, HeatNode, HeatPipe } from "./distribution";
import { heatPipeText } from "./distribution";
import * as A from "./material-data";

export type DistChapter = 1 | 2 | 3 | 4 | 6;

export type DistMaterialLine = {
  key: string;
  chapter: DistChapter;
  manufacturer: "Nussbaum" | "Meier Tobler" | null;
  article: string | null;
  label: string;
  unit: "Stk" | "m";
  quantity: number;
};

export type DistMaterialSection = { key: string; bkp: "243"; chapter: DistChapter; lines: DistMaterialLine[] };

const INSULATION_ALLOWANCE = 0.2;
const fmt = (v: number, d = 0) => v.toLocaleString("de-CH", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Optiflex-Flowpress article of a family (Sanitär catalogue data) for a pipe diameter. */
const flowpress = (family: "87153" | "84240" | "84241" | "84242", od: number) => nussbaumArticles[family].find((a) => a.size !== null && Number.parseFloat(a.size) === od && !a.size.includes("x")) ?? null;

export function distributionMaterial(data: DistributionData, result: DistributionResult): DistMaterialLine[] {
  const map = new Map<string, DistMaterialLine>();
  const add = (line: Omit<DistMaterialLine, "quantity">, amount: number) => {
    if (amount <= 0) return;
    const current = map.get(line.key);
    // Metres to 0.1, so sums stay clean.
    if (current) current.quantity = Math.round((current.quantity + amount) * 10) / 10;
    else map.set(line.key, { ...line, quantity: Math.round(amount * 10) / 10 });
  };
  const article = (chapter: DistChapter, manufacturer: "Nussbaum" | "Meier Tobler", a: { number: string; text: string } | null | undefined, amount: number, fallback: string, unit: "Stk" | "m" = "Stk") =>
    a ? add({ key: `${chapter}|${a.number}`, chapter, manufacturer, article: a.number, label: a.text, unit }, amount) : neutral(chapter, fallback, amount, unit);
  const neutral = (chapter: DistChapter, label: string, amount: number, unit: "Stk" | "m" = "Stk") => add({ key: `${chapter}|${label}`, chapter, manufacturer: null, article: null, label, unit }, amount);
  const material = data.settings.lambda <= 0.03 + 1e-9 ? "pir" : "mineralwool";

  const pipeArticle = (p: HeatPipe) => (p.system === "therm" ? A.thermPipes.find((x) => x.d === p.od) : flowpress("87153", p.od));
  const bend = (p: HeatPipe, angle: 90 | 45) =>
    p.system === "therm" ? (angle === 90 ? A.thermBends90 : A.thermBends45).find((x) => x.d === p.od) : flowpress(angle === 90 ? "84240" : "84241", p.od);
  const tee = (p: HeatPipe) => (p.system === "therm" ? A.thermTees.find((x) => x.d === p.od) : flowpress("84242", p.od));
  const ball = (p: HeatPipe, amount: number) =>
    article(2, "Nussbaum", p.system === "therm" ? A.ballValves.find((v) => v.d === p.od) : null, amount, `Absperrarmatur ${heatPipeText(p)}`);
  const insulation = (p: HeatPipe, mm: number, metres: number) => {
    if (mm <= 0 || metres <= 0) return;
    const shell = insulationShells.filter((s) => s.material === material && s.mm === mm && s.od >= p.od - 0.6).sort((a, b) => a.od - b.od)[0];
    const amount = Math.ceil(metres * (1 + INSULATION_ALLOWANCE) * 10) / 10;
    if (shell) add({ key: `6|${shell.number}`, chapter: 6, manufacturer: "Meier Tobler", article: shell.number, label: shell.text, unit: "m" }, amount);
    else neutral(6, `Rohrdämmung ${mm} mm für ${heatPipeText(p)} (${material === "pir" ? "PIR" : "Mineralwolle"})`, amount, "m");
  };

  const visit = (n: HeatNode, parentRiser: boolean) => {
    const s = result.sections.get(n.id);
    const term = result.terminals.get(n.id);
    if (term) {
      if (n.type === "radiator") {
        neutral(4, `Heizkörper «${term.name || "–"}», Φ ${fmt(term.power)} W`, 1);
        neutral(3, "Heizkörperventil mit voreinstellbarem Ventileinsatz und Thermostatkopf", 1);
        neutral(2, "Rücklaufverschraubung absperrbar", 1);
      } else if (n.type === "consumer") neutral(4, `Verbraucher «${term.name || "–"}», Φ ${fmt(term.power)} W`, 1);
      return;
    }
    if (n.type !== "pipe" || !s) return;
    const p = s.pipe;
    const length = n.length ?? 0;
    // Pipes VL + RL in whole metres.
    article(1, "Nussbaum", pipeArticle(p), Math.ceil(2 * length - 1e-9), `Rohr ${heatPipeText(p)}`, "m");
    article(1, "Nussbaum", bend(p, 90), 2 * n.bends90, `Bogen 90° ${heatPipeText(p)}`);
    article(1, "Nussbaum", bend(p, 45), 2 * n.bends45, `Bogen 45° ${heatPipeText(p)}`);
    // T-Stücke where the section branches (VL and RL each).
    if (n.children.length > 1) article(1, "Nussbaum", tee(p), 2 * (n.children.length - 1), `T-Stück ${heatPipeText(p)}`);
    // Kugelhähne: at the foot of each Strang and where Absperrungen are set (VL and RL).
    const foot = n.riser && !parentRiser;
    if (foot || n.shutoff) ball(p, 2);
    if (foot && n.regValve) {
      const dn = p.dn;
      article(3, "Meier Tobler", A.balancingValves.find((v) => v.dn === dn) ?? A.balancingValves.find((v) => v.dn >= dn), 1, `Strangregulierventil DN ${dn}`);
    }
    insulation(p, s.insVl, length);
    insulation(p, s.insRl, length);
    n.children.forEach((c) => visit(c, n.riser));
  };
  for (const roots of Object.values(data.networks)) roots.forEach((n) => visit(n, false));
  return [...map.values()];
}

/** The lines by LV chapter (243.1 … 243.6), pipes before the pieces. */
export function distributionSections(lines: DistMaterialLine[]): DistMaterialSection[] {
  const out = new Map<string, DistMaterialSection>();
  for (const l of lines) {
    const key = `243.${l.chapter}`;
    const section = out.get(key) ?? { key, bkp: "243" as const, chapter: l.chapter, lines: [] };
    out.set(key, section);
    section.lines.push(l);
  }
  for (const section of out.values()) section.lines.sort((a, b) => (a.unit === "m" ? 0 : 1) - (b.unit === "m" ? 0 : 1));
  return [...out.values()].sort((a, b) => a.key.localeCompare(b.key));
}
