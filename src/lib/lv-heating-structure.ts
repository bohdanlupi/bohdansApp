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
