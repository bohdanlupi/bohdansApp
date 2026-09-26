// LV chapter structure «Lüftung» after the LUPI template (Berechnungsvorlagen/Lüftung KWL/Vorlage
// Leistungsverzeichniss Struktur Lüftung.xlsx): BKP 244 Lüftungsinstallationen with the chapters 0–6, in one, two
// (per system «LA01 - …») or three levels (Los › system).

import type { AppLanguage } from "@/lib/supabase/types";

export type StructureLevels = 1 | 2 | 3;

export const ventilationTitle: Record<AppLanguage, string> = {
  de: "Lüftungsinstallationen",
  fr: "Installations de ventilation",
  it: "Impianti di ventilazione",
};

/** Chapter names; the index is the last digit of the chapter number. */
export const ventilationChapters: Record<AppLanguage, string[]> = {
  de: ["Geräte", "Rohre/Kanäle", "Armaturen", "Regulierung", "Auslassgitter / Tellerventile", "Transport & Montage", "Dämmung"],
  fr: ["Appareils", "Tubes/Gaines", "Accessoires", "Régulation", "Grilles / bouches", "Transport & montage", "Isolation"],
  it: ["Apparecchi", "Tubi/Canali", "Accessori", "Regolazione", "Griglie / valvole", "Trasporto e montaggio", "Isolamento"],
};

const losName: Record<AppLanguage, string> = { de: "LOS", fr: "LOT", it: "LOTTO" };

export const ventilationBkp = "244";

export type StructureNode = { key: string; parentKey: string | null; number: string; text: string };

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Nodes of the structure in document order. */
export function ventilationStructure(levels: StructureLevels, systems: { name: string; los: number }[], language: AppLanguage): StructureNode[] {
  const chapters = ventilationChapters[language];
  const out: StructureNode[] = [{ key: "root", parentKey: null, number: ventilationBkp, text: ventilationTitle[language] }];
  const addChapters = (parentKey: string, prefix: string) =>
    chapters.forEach((text, i) => out.push({ key: `${parentKey}.${i}`, parentKey, number: `${prefix}.${i}`, text }));

  if (levels === 1) {
    addChapters("root", ventilationBkp);
    return out;
  }
  const label = (i: number, name: string) => `LA${pad2(i + 1)} - ${name}`;
  if (levels === 2) {
    systems.forEach((s, i) => {
      const key = `la${i}`;
      const number = `${ventilationBkp}.${pad2(i + 1)}`;
      out.push({ key, parentKey: "root", number, text: label(i, s.name) });
      addChapters(key, number);
    });
    return out;
  }
  // Three levels: Los › system (the system number counts on across the Lose, as in the template).
  const lose = [...new Set(systems.map((s) => s.los))].sort((a, b) => a - b);
  for (const los of lose) {
    const losKey = `los${los}`;
    const losNumber = `${ventilationBkp}.${los}`;
    out.push({ key: losKey, parentKey: "root", number: losNumber, text: `${losName[language]} ${los}` });
    systems.forEach((s, i) => {
      if (s.los !== los) return;
      const key = `la${i}`;
      const number = `${losNumber}.${pad2(i + 1)}`;
      out.push({ key, parentKey: losKey, number, text: label(i, s.name) });
      addChapters(key, number);
    });
  }
  return out;
}
