// Materialauszug of 242 Wärmeerzeugung: every component of the Prinzipschema. Wärmeerzeuger, Speicher, Wassererwärmer,
// Erdwärmesonden and the Brunnen are neutral (no article); valves on Optipress-Therm from Nussbaum (Optipress-Kugelhahn,
// Optipress-Therm-T-Stück with Füll- und Entleerkugelhahn, Rückflussverhinderer), the rest from Meier Tobler:
// Sicherheitsventile Afriso (IMI DG/Hswiss where Afriso lacks the size or pressure) by Tabelle 5 of HE301-01,
// Reflex N with Reflex SU Kappenventil, Biral pumps (by DN and flow only – check with the pump curve), Siemens valves
// (kvs at Δp 10 kPa) with actuators, IMI STAD, GWF Wärmezähler, HakaGerodur Erdsondenverteiler. Texts in German.

import type { EwsResult } from "./ews";
import { type Circuit, evaluateHydraulics, type PipeSize } from "./hydraulics";
import * as A from "./material-data";
import type { GeneratorType } from "./plan-schema";
import { generatorName, type PlantData } from "./plant-schema";
import { evaluateSafety, expansionValveLines } from "./safety";

export const materialGroups = ["source", "brine", "expansion", "hotWater", "storage", "distribution"] as const;
export type MaterialGroup = (typeof materialGroups)[number];

export type MaterialLine = {
  key: string;
  group: MaterialGroup;
  manufacturer: "Nussbaum" | "Meier Tobler" | null;
  article: string | null;
  label: string;
  unit: "Stk";
  quantity: number;
};

const typeNames: Record<GeneratorType, string> = {
  hpAir: "Wärmepumpe Luft/Wasser",
  hpBrine: "Wärmepumpe Sole/Wasser",
  hpWater: "Wärmepumpe Wasser/Wasser",
  pellets: "Pelletkessel",
  logWood: "Stückholzkessel",
  district: "Fernwärme-Übergabestation",
  gasOil: "Heizkessel Öl/Gas",
};

const fmt = (v: number, d = 0) => v.toLocaleString("de-CH", { minimumFractionDigits: d, maximumFractionDigits: d });
const threadName = (t: number) => ({ 0.375: "⅜", 0.5: "½", 0.75: "¾", 1: "1", 1.25: "1¼", 1.5: "1½", 2: "2" })[t] ?? String(t);
/** DN of the inlet of a Sicherheitsventil → thread. */
const dnThread = (dn: number) => ({ 15: 0.5, 20: 0.75, 25: 1, 32: 1.25, 40: 1.5, 50: 2 })[dn] ?? null;

/** Biral pump: PrimAX up to 2.5 m³/h (heating), else ModulA; at least the DN of the line, head class 6 m or the next. */
const MODULA_MAX: [number, number][] = [[25, 6], [32, 10], [40, 18], [50, 30], [65, 50], [80, 80], [100, 120]];
function pumpFor(medium: "heating" | "brine", size: PipeSize | null, flow: number | null) {
  const dn = size?.dn ?? 25;
  const q = flow ?? 0;
  const pick = (list: typeof A.pumps) => [...list].sort((a, b) => a.head - b.head || b.length - a.length).find((p) => p.head >= 6) ?? list.at(-1) ?? null;
  if (medium === "heating" && q <= 2.5 && dn <= 32) {
    const pdn = dn <= 15 ? 15 : dn <= 25 ? 25 : 32;
    const p = pick(A.pumps.filter((x) => x.series === "PrimAX" && x.dn === pdn && (pdn === 15 || x.length >= 180)));
    if (p) return p;
  }
  const pdn = MODULA_MAX.find(([d, max]) => d >= Math.max(dn, 25) && q <= max)?.[0] ?? 100;
  return pick(A.pumps.filter((x) => x.series === "ModulA" && x.medium === medium && x.dn === pdn));
}

/** Valve with the smallest kvs ≥ V̇ / √(Δp 0.1 bar), else the largest. */
function valveFor<T extends { kvs: number }>(list: T[], flow: number | null): T | null {
  const sorted = [...list].sort((a, b) => a.kvs - b.kvs);
  if (flow === null) return null;
  return sorted.find((v) => v.kvs >= flow / Math.sqrt(0.1)) ?? sorted.at(-1) ?? null;
}

/** Sicherheitsventil DN (Tabelle 5) at pSV: Afriso, else IMI DG/Hswiss (null: none in the catalogues). */
function safetyValveFor(power: number | null, pSV: number) {
  const dn = power !== null ? (expansionValveLines(power)?.isv ?? 15) : 15;
  const thread = dnThread(dn) ?? 0.5;
  const afriso = A.afrisoValves.find((v) => v.thread === thread && Math.abs(v.bar - pSV) < 1e-6);
  const imi = A.imiValves.find((v) => v.dn === dn && Math.abs(v.bar - pSV) < 1e-6);
  return { dn, thread, article: afriso ?? imi ?? null, maker: afriso ? "Afriso" : imi ? "IMI DG/H" : null };
}

/** Reflex N: the next size ≥ VN. */
const vesselFor = (vn: number | null) => (vn !== null ? [...A.vessels].sort((a, b) => a.volume - b.volume).find((x) => x.volume >= vn - 1e-9) : undefined);

/** Short type of a Biral pump from its catalogue text, e.g. ["PrimAX", "25-6"]. */
const pumpType = (text: string) => {
  const m = /^Biral (\w+) \S+ (\d+F?-\d+)/.exec(text);
  return m ? [m[1], m[2]] : [text];
};

/**
 * Types of the pumps, Dreiwegventile (with actuator), Sicherheitsventile and Ausdehnungsgefässe for the Prinzipschema,
 * the same picks as in the Materialauszug. Keys: `pump:<circuit>`, `valve3:<circuit>`, `sv:<circuit>`, `vessel:heating`,
 * `vessel:source`; circuits as in hydraulics.ts.
 */
export function componentTypes(data: PlantData, ews: EwsResult | null): Map<string, string[]> {
  const safety = evaluateSafety(data, ews);
  const circuits = evaluateHydraulics(data, ews);
  const out = new Map<string, string[]>();
  const circuitOf = (key: string) => circuits.find((c) => c.key === key);
  const pump = (key: string, medium: "heating" | "brine") => {
    const c = circuitOf(key);
    const p = pumpFor(medium, c?.size ?? null, c?.flow ?? null);
    if (p) out.set(`pump:${key}`, pumpType(p.text));
  };
  const valve3 = (key: string, list: { kvs: number; text: string }[], actuator: string) => {
    const v = valveFor(list, circuitOf(key)?.flow ?? null);
    if (v) out.set(`valve3:${key}`, [v.text.split(" ").at(-1)!, actuator]);
  };
  const sv = (key: string, power: number | null, pSV: number) => {
    const v = safetyValveFor(power, pSV);
    const size = v.maker === "Afriso" ? `${threadName(v.thread)}"` : `DN ${v.dn}`;
    out.set(`sv:${key}`, [`${v.maker ?? "SV"} ${size}`, `${fmt(pSV, 1)} bar`]);
  };
  for (const u of data.generators) {
    sv(`gen:${u.id}`, u.power, data.safety.pSV);
    pump(`gen:${u.id}`, "heating");
    if (u.type === "pellets" || u.type === "logWood") valve3(`gen:${u.id}`, A.mixingValves, "SAS61.03");
    if (u.type === "hpBrine" || u.type === "hpWater") {
      sv(`source:${u.id}`, safety.sourceValves.find((v) => v.id === u.id)?.power ?? null, data.safety.brine.pSV);
      pump(`source:${u.id}`, u.type === "hpBrine" ? "brine" : "heating");
    }
  }
  const vh = vesselFor(safety.vessel.vn);
  if (vh) out.set("vessel:heating", [`Reflex N ${vh.volume}`]);
  const vs = vesselFor(safety.brine?.chosen ?? null);
  if (vs) out.set("vessel:source", [`Reflex N ${vs.volume}`]);
  if (data.hotWater && data.hotWaterConnection === "diverter") valve3("hotWater", A.diverterValves, "GLB161.9E");
  if (data.hotWater && data.hotWaterConnection === "generator") pump("hotWater", "heating");
  if (data.distributor === "pressurized") pump("main", "heating");
  for (const g of data.groups) {
    const key = `group:${g.id}`;
    if (g.circuit === "mixing" || g.circuit === "diverting" || g.circuit === "injection3") valve3(key, A.mixingValves, "SAS61.03");
    if (g.circuit === "mixing" || g.circuit === "injection3" || g.circuit === "injection2") pump(key, "heating");
  }
  return out;
}

export function plantMaterial(data: PlantData, ews: EwsResult | null): MaterialLine[] {
  const safety = evaluateSafety(data, ews);
  const circuits = evaluateHydraulics(data, ews);
  const circuitOf = (key: string): Circuit | undefined => circuits.find((c) => c.key === key);
  const map = new Map<string, MaterialLine>();
  const add = (line: Omit<MaterialLine, "quantity" | "unit">, amount = 1) => {
    if (amount <= 0) return;
    const current = map.get(line.key);
    if (current) current.quantity += amount;
    else map.set(line.key, { ...line, unit: "Stk", quantity: amount });
  };
  const article = (group: MaterialGroup, manufacturer: "Nussbaum" | "Meier Tobler", a: A.Article | null | undefined, amount = 1, fallback?: string) => {
    if (a) add({ key: `${group}|${a.number}`, group, manufacturer, article: a.number, label: a.text }, amount);
    else if (fallback) neutral(group, fallback, amount);
  };
  const neutral = (group: MaterialGroup, label: string, amount = 1) => add({ key: `${group}|${label}`, group, manufacturer: null, article: null, label }, amount);

  // Fittings on Optipress-Therm.
  const ball = (group: MaterialGroup, size: PipeSize | null, amount: number) =>
    size && size.d <= 54 ? article(group, "Nussbaum", A.ballValves.find((v) => v.d === size.d), amount) : neutral(group, `Absperrarmatur ${size ? `DN ${size.dn}` : "(DN offen)"}`, amount);
  const tee = (group: MaterialGroup, size: PipeSize | null, thread: number, amount: number) => {
    const t = size ? (A.teesThreaded.find((x) => x.d === size.d && x.thread === thread) ?? A.teesThreaded.find((x) => x.d === size.d)) : undefined;
    article(group, "Nussbaum", t, amount, `T-Stück mit Innengewinde ${threadName(thread)}" ${size ? `DN ${size.dn}` : "(DN offen)"}`);
  };
  const drain = (group: MaterialGroup, size: PipeSize | null, amount: number) => {
    tee(group, size, 0.5, amount);
    article(group, "Nussbaum", A.drainCocks.find((x) => x.thread === 0.5), amount);
  };
  const thermometer = (group: MaterialGroup, size: PipeSize | null, amount: number) => {
    tee(group, size, 0.5, amount);
    article(group, "Meier Tobler", A.thermometers[0], amount);
  };
  const pump = (group: MaterialGroup, medium: "heating" | "brine", c: Circuit | undefined) => {
    const p = pumpFor(medium, c?.size ?? null, c?.flow ?? null);
    article(group, "Meier Tobler", p, 1, "Umwälzpumpe (nach Auslegung)");
  };
  const actuated = (group: MaterialGroup, list: { kvs: number; number: string; text: string }[], c: Circuit | undefined, actuator: "SAS61.03" | "GLB161.9E") => {
    article(group, "Meier Tobler", valveFor(list, c?.flow ?? null), 1, "Regelventil (kvs nach Auslegung)");
    article(group, "Meier Tobler", A.actuators.find((x) => x.type === actuator));
  };
  /** Sicherheitsventil DN (Tabelle 5) at pSV: Afriso, else IMI DG/Hswiss; Entleerhahn before it, T-Stück on the line. */
  const safetyValve = (group: MaterialGroup, power: number | null, pSV: number, size: PipeSize | null) => {
    const { dn, thread, article: valve } = safetyValveFor(power, pSV);
    article(group, "Meier Tobler", valve, 1, `Sicherheitsventil DN ${dn}, ${fmt(pSV, 1)} bar`);
    tee(group, size, thread, 1);
    article(group, "Meier Tobler", A.drainValves.find((v) => v.thread === 0.5));
  };
  /** Reflex N (next size ≥ VN) with Reflex SU Kappenventil, Wandhalterung up to 25 l, Manometer by pSV. */
  const vessel = (group: MaterialGroup, vn: number | null, pSV: number, label: string) => {
    const v = vesselFor(vn);
    article(group, "Meier Tobler", v, 1, `${label} (Nenninhalt nach Berechnung)`);
    const volume = v?.volume ?? vn ?? 0;
    article(group, "Meier Tobler", A.capValves.find((c) => c.thread === (volume <= 80 ? 0.75 : 1)));
    if (v && A.vesselBrackets.some((b) => volume >= b.min && volume <= b.max)) article(group, "Meier Tobler", A.vesselBrackets.find((b) => volume >= b.min && volume <= b.max));
    const range = [...A.manometers].sort((a, b) => a.range - b.range).find((m) => m.range >= pSV * 1.3);
    article(group, "Meier Tobler", range);
  };

  // --- Wärmequelle: generators with Absperrungen, Entleerungen, Sicherheitsventil, pump ---------------------------
  for (const u of data.generators) {
    const c = circuitOf(`gen:${u.id}`);
    const size = c?.size ?? null;
    const name = generatorName(data.generators, u, (t) => typeNames[t]);
    neutral("source", `${name === typeNames[u.type] ? name : `${typeNames[u.type]} «${name}»`}${u.power !== null ? `, ΦN ${fmt(u.power, 1)} kW` : ""}`);
    ball("source", size, 2);
    drain("source", size, 2);
    safetyValve("source", u.power, data.safety.pSV, size);
    if (u.type === "pellets" || u.type === "logWood") {
      // Rücklaufhochhaltung: Dreiwegventil with actuator.
      actuated("source", A.mixingValves, c, "SAS61.03");
    }
    pump("source", "heating", c);
    if (u.type === "district") neutral("source", "Primärseite Fernwärme (Wärmezähler, Regelventil, Absperrungen) – Lieferung Fernwärmeversorger");

    // Sole- / Zwischenkreis.
    if (u.type === "hpBrine" || u.type === "hpWater") {
      const s = circuitOf(`source:${u.id}`);
      const sSize = s?.size ?? null;
      ball("brine", sSize, 2);
      drain("brine", sSize, 2);
      pump("brine", u.type === "hpBrine" ? "brine" : "heating", s);
      const sv = safety.sourceValves.find((v) => v.id === u.id);
      safetyValve("brine", sv?.power ?? null, data.safety.brine.pSV, sSize);
      if (u.type === "hpBrine") {
        vessel("brine", safety.brine?.chosen ?? null, data.safety.brine.pSV, "Druckausdehnungsgefäss Solekreis");
        const e = data.ews;
        if (e.distributor !== "none") {
          // HakaGerodur SAVE: Sammler with Kugelhähnen (VL from the probes) and Verteiler with Inline-Setter (RL), each
          // with Füll- und Entleerhahn; SAVE 97 up to 6 Abgänge, else SAVE 125.
          const d = e.feedDn <= 40 ? 40 : 50;
          const bar = (kind: "KH+F" | "IS+F") =>
            A.probeManifolds.filter((m) => m.outlets === e.probes && m.d === d && m.kind === kind).sort((a, b) => a.body - b.body)[0];
          article("brine", "Meier Tobler", bar("KH+F"), 1, `Erdsondenverteiler ${e.probes} × ${d} mm mit Kugelhähnen und Entleerung`);
          article("brine", "Meier Tobler", bar("IS+F"), 1, `Erdsondenverteiler ${e.probes} × ${d} mm mit Durchflussreglern und Entleerung`);
        }
        const length = ews?.length ? `, je ${fmt(Math.ceil(ews.length / 5) * 5)} m` : "";
        neutral("brine", `Erdwärmesonde Duplex ${e.diameter} mm${length}`, e.probes);
      } else {
        vessel("brine", safety.brine?.chosen ?? null, data.safety.brine.pSV, "Druckausdehnungsgefäss Zwischenkreis");
        neutral("brine", "Platten-Wärmetauscher Zwischenkreis / Grundwasser");
        neutral("brine", "Förderbrunnen mit Unterwasserpumpe");
        neutral("brine", "Rückgabebrunnen");
        ball("brine", sSize, 2);
      }
    }
  }

  // --- Druckhaltung Heizung ------------------------------------------------------------------------------------------
  vessel("expansion", safety.vessel.vn, data.safety.pSV, "Druckausdehnungsgefäss Heizung");

  // --- Warmwasser ----------------------------------------------------------------------------------------------------
  if (data.hotWater) {
    const electric = data.hotWaterElectric > 0 ? `, Elektroeinsatz ${fmt(data.hotWaterElectric, 1)} kW` : "";
    const coils = { single: "mit innenliegendem Register", lower: "mit 2 Registern (unteres angeschlossen)", upper: "mit 2 Registern (oberes angeschlossen)", series: "mit 2 Registern in Serie" }[data.hotWaterCoils];
    const heater = data.hotWaterHeater === "external" ? "für aussenliegenden Wärmetauscher" : coils;
    neutral("hotWater", `Wassererwärmer${data.hotWaterVolume ? ` ${fmt(data.hotWaterVolume)} l` : ""} ${heater}${electric}`);
    if (data.hotWaterHeater === "external") {
      neutral("hotWater", "Platten-Wärmetauscher Warmwasser");
      neutral("hotWater", "Speicherladepumpe Trinkwasser (Sekundärseite)");
    }
    if (safety.hotWaterValve) {
      const thread = dnThread(safety.hotWaterValve.isv ?? 15) ?? 0.5;
      article("hotWater", "Nussbaum", A.potableSafetyValves.find((v) => v.thread === thread), 1, "Sicherheitsventil Wassererwärmer 6 bar");
    }
    const c = data.hotWaterConnection === "group" ? circuitOf(`group:${data.hotWaterGroup}`) : circuitOf("hotWater");
    ball("hotWater", c?.size ?? null, 2);
    if (data.hotWaterConnection === "diverter") actuated("hotWater", A.diverterValves, c, "GLB161.9E");
    if (data.hotWaterConnection === "generator") {
      pump("hotWater", "heating", c);
      const size = c?.size;
      article("hotWater", "Nussbaum", size ? A.checkValves.find((v) => v.d === size.d) : undefined, 1, "Rückflussverhinderer");
    }
  }

  // --- Energiespeicher -----------------------------------------------------------------------------------------------
  if (data.storage) neutral("storage", `Technischer Speicher${data.storageVolume ? ` ${fmt(data.storageVolume)} l` : ""}`);

  // --- Verteiler und Heizgruppen -------------------------------------------------------------------------------------
  if (data.groups.length) neutral("distribution", `Heizungsverteiler VL/RL für ${data.groups.length} Heizgruppe${data.groups.length > 1 ? "n" : ""}`);
  if (data.distributor === "pressurized") pump("distribution", "heating", circuitOf("main"));
  for (const g of data.groups) {
    const c = circuitOf(`group:${g.id}`);
    const size = c?.size ?? null;
    ball("distribution", size, 4);
    drain("distribution", size, 4);
    thermometer("distribution", size, 2);
    neutral("distribution", "Vorlauffühler (Lieferung MSRL)");
    if (g.heatMeter) {
      const meter = c?.flow != null ? [...A.heatMeters].sort((a, b) => a.qp - b.qp || a.thread - b.thread).find((m) => m.qp >= c.flow! && (size === null || m.thread >= size.thread)) : undefined;
      article("distribution", "Meier Tobler", meter, 1, `Wärmezähler${c?.flow != null ? ` qp ≥ ${fmt(c.flow, 1)} m³/h` : ""}`);
    }
    switch (g.circuit) {
      case "mixing":
        actuated("distribution", A.mixingValves, c, "SAS61.03");
        pump("distribution", "heating", c);
        break;
      case "throttle":
        actuated("distribution", A.throughValves, c, "SAS61.03");
        break;
      case "diverting":
        actuated("distribution", A.mixingValves, c, "SAS61.03");
        break;
      case "injection3":
        actuated("distribution", A.mixingValves, c, "SAS61.03");
        pump("distribution", "heating", c);
        break;
      case "injection2": {
        actuated("distribution", A.throughValves, c, "SAS61.03");
        const dn = size?.dn ?? null;
        article("distribution", "Meier Tobler", dn !== null ? (A.balancingValves.find((v) => v.dn === dn) ?? A.balancingValves.find((v) => v.dn >= dn)) : undefined, 1, "Strangregulierventil");
        pump("distribution", "heating", c);
        break;
      }
    }
  }

  const order = (l: MaterialLine) => materialGroups.indexOf(l.group);
  return [...map.values()].sort((a, b) => order(a) - order(b));
}
