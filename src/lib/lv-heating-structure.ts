// LV chapter structure «Heizung» after the LUPI template (Berechnungsvorlagen/Heizung/Vorlage Leistungsverzeichniss
// Struktur Heizung.xlsx): BKP 24 with 241 Zulieferung Energieträger, 242 Wärmeerzeugung and 243 Wärmeverteilung, each
// with the chapters 0–6, without subdivision, per Los (L01 › 241.01 › 241.01.0) or per Haus (H01 › 241.01 › 241.01.0).

import type { StructureNode } from "@/lib/lv-ventilation-structure";
import type { AppLanguage } from "@/lib/supabase/types";

export type HeatingStructureMode = "flat" | "lose" | "houses";
export const heatingBkps = ["241", "242", "243"] as const;
export type HeatingBkp = (typeof heatingBkps)[number];

export const heatingRoot = "24";

const rootTitle: Record<AppLanguage, string> = {
  de: "Heizungs-, Lüftungs-, Klima- und Kälteanlagen",
  fr: "Installations de chauffage, ventilation, climatisation et froid",
  it: "Impianti di riscaldamento, ventilazione, climatizzazione e refrigerazione",
};

export const heatingBkpTitle: Record<AppLanguage, Record<HeatingBkp, string>> = {
  de: { "241": "Zulieferung Energieträger", "242": "Wärmeerzeugung", "243": "Wärmeverteilung" },
  fr: { "241": "Approvisionnement en agents énergétiques", "242": "Production de chaleur", "243": "Distribution de chaleur" },
  it: { "241": "Fornitura di vettori energetici", "242": "Produzione di calore", "243": "Distribuzione del calore" },
};

/** Chapter names; the index is the last digit of the chapter number. Chapter 4 differs per BKP. */
const chapters: Record<AppLanguage, { common: string[]; fourth: Record<HeatingBkp, string> }> = {
  de: {
    common: ["Apparate", "Leitungen", "Armaturen", "Regel- und Sicherheitsorgane", "", "Transport & Montage", "Dämmung"],
    fourth: { "241": "Gartenbauarbeiten", "242": "Warmwasserspeicher", "243": "Abgabesystem" },
  },
  fr: {
    common: ["Appareils", "Conduites", "Robinetterie", "Organes de réglage et de sécurité", "", "Transport & montage", "Isolation"],
    fourth: { "241": "Travaux de jardinage", "242": "Accumulateur d'eau chaude", "243": "Système d'émission" },
  },
  it: {
    common: ["Apparecchi", "Condotte", "Rubinetteria", "Organi di regolazione e sicurezza", "", "Trasporto e montaggio", "Isolamento"],
    fourth: { "241": "Lavori di giardinaggio", "242": "Accumulatore di acqua calda", "243": "Sistema di emissione" },
  },
};

/** Default name of the n-th Los / Haus («Los 01», «Haus 01»). */
export const heatingGroupName: Record<"lose" | "houses", Record<AppLanguage, string>> = {
  lose: { de: "Los", fr: "Lot", it: "Lotto" },
  houses: { de: "Haus", fr: "Bâtiment", it: "Edificio" },
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Nodes of the structure in document order; `groups` are the names of the Lose / Häuser (ignored when flat). */
export function heatingStructure(mode: HeatingStructureMode, groups: string[], bkps: readonly HeatingBkp[], language: AppLanguage): StructureNode[] {
  const out: StructureNode[] = [{ key: "root", parentKey: null, number: heatingRoot, text: rootTitle[language] }];
  const names = chapters[language];
  const addBkp = (parentKey: string, bkp: HeatingBkp, number: string) => {
    const key = `${parentKey}.${bkp}`;
    out.push({ key, parentKey, number, text: heatingBkpTitle[language][bkp] });
    names.common.forEach((text, i) => out.push({ key: `${key}.${i}`, parentKey: key, number: `${number}.${i}`, text: i === 4 ? names.fourth[bkp] : text }));
  };
  const chosen = heatingBkps.filter((b) => bkps.includes(b));
  if (mode === "flat") {
    for (const bkp of chosen) addBkp("root", bkp, bkp);
    return out;
  }
  const prefix = mode === "lose" ? "L" : "H";
  groups.forEach((name, i) => {
    const key = `g${i}`;
    out.push({ key, parentKey: "root", number: `${prefix}${pad2(i + 1)}`, text: name });
    for (const bkp of chosen) addBkp(key, bkp, `${bkp}.${pad2(i + 1)}`);
  });
  return out;
}

/** Name of the chapter `bkp`.`chapter` (0–6) in the LV language. */
export const heatingChapterName = (bkp: HeatingBkp, chapter: number, language: AppLanguage) =>
  chapter === 4 ? chapters[language].fourth[bkp] : chapters[language].common[chapter];

type LvGroup = { id: string; parentId: string | null; number: string | null; text: string };

/**
 * Groups of an LV that hold the BKPs 241–243 of the structure «Heizung»: the chapter 24 itself (no subdivision) or its
 * Lose / Häuser. Without a chapter 24, the LV itself when it has the BKPs on top level (id null).
 */
export function heatingBases(groups: LvGroup[]): { id: string | null; label: string }[] {
  const isBkp = (g: LvGroup) => heatingBkps.some((b) => g.number === b || g.number?.startsWith(`${b}.`));
  const top = groups.find((g) => !g.parentId && g.number === heatingRoot);
  if (!top) return groups.some((g) => !g.parentId && isBkp(g)) ? [{ id: null, label: "" }] : [];
  const children = groups.filter((g) => g.parentId === top.id);
  if (children.some(isBkp)) return [{ id: top.id, label: `${top.number} ${top.text}` }];
  return children.map((g) => ({ id: g.id, label: `${g.number ?? ""} ${g.text}`.trim() }));
}

/** The base whose name matches the Anlage (one contains the other), else the first. */
export function defaultHeatingBase(bases: { id: string | null; label: string }[], plantName: string) {
  const name = plantName.trim().toLowerCase();
  return (name ? bases.find((b) => b.label.toLowerCase().includes(name) || name.includes(b.label.replace(/^\S+\s/, "").toLowerCase())) : undefined) ?? bases[0];
}

/** Chapter `bkp`.x.`chapter` below a base (see heatingBases), null when the LV lacks it. */
export function heatingChapterId(groups: LvGroup[], baseId: string | null, bkp: HeatingBkp, chapter: number): string | null {
  const bkpGroup = groups.find((g) => g.parentId === baseId && (g.number === bkp || g.number?.startsWith(`${bkp}.`)));
  if (!bkpGroup) return null;
  return groups.find((g) => g.parentId === bkpGroup.id && g.number?.split(".").at(-1) === String(chapter))?.id ?? null;
}
