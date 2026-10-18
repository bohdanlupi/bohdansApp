import type { L10n } from "@/lib/planning";

// Honorarberechnung nach SIA 108:2014 Art. 7 (Gebäudetechnik):
//   p  = Z1 + Z2 / ∛Bp                          Grundfaktor (Art. 7.2.2), Bp = faktorbestimmende Baukosten
//   Tm = B · p/100 · n · q/100 · r · U           durchschnittlicher Zeitaufwand in h (Art. 7.2.1)
//   Tp = Tm · i                                  prognostizierter Zeitaufwand (Art. 7.3)
//   H  = Tp · s · h                              Honorar exkl. MwSt. (Art. 7.4)

export const feeTrades = ["heating", "cooling", "ventilation", "sanitary"] as const;
export type FeeTrade = (typeof feeTrades)[number];

/** Fachgebiete of SIA 108 Art. 7.5.21 / 7.7.3: Heizung and Kälte share one (H/K). */
export const siaColumns = ["hk", "lk", "s"] as const;
export type SiaColumn = (typeof siaColumns)[number];

export const tradeColumn: Record<FeeTrade, SiaColumn> = { heating: "hk", cooling: "hk", ventilation: "lk", sanitary: "s" };

/** Teilphasen with Grundleistungen (SIA 108 Art. 7.7.3); phases 1, 2 and 6 are besonders zu vereinbarende Leistungen. */
export const feePhases = ["31", "32", "33", "41", "51", "52", "53"] as const;
export type FeePhase = (typeof feePhases)[number];

export type PhaseShares = Record<FeePhase, number>;

/**
 * Leistungsanteile q in % (SIA 108 Art. 7.7.3). The norm gives 32 + 33 together (H/K 20 %, L/K 18 %, S 20 %);
 * the split 33 = 2 % is our own default and can be changed in the settings.
 */
export const defaultShares: Record<SiaColumn, PhaseShares> = {
  hk: { "31": 10, "32": 18, "33": 2, "41": 23, "51": 23, "52": 14, "53": 10 },
  lk: { "31": 12, "32": 16, "33": 2, "41": 23, "51": 23, "52": 14, "53": 10 },
  s: { "31": 6, "32": 18, "33": 2, "41": 23, "51": 23, "52": 18, "53": 10 },
};

/** Limits of the factors (Art. 7.8.3, 7.9, 7.10.3, 7.14.1). */
export const factorLimits = {
  n: [0.5, 1.5],
  r: [0.75, 1.25],
  i: [0.5, 1.5],
  s: [1, 1.5],
  u: [1, 1.4],
} as const;

type BuildingType = { id: string; group: L10n; text: L10n; n: Record<SiaColumn, number> };

const g = {
  living: { de: "Wohnen", fr: "Habitation", it: "Abitazione" },
  education: { de: "Unterricht, Bildung, Forschung", fr: "Enseignement, formation, recherche", it: "Insegnamento, formazione, ricerca" },
  industry: { de: "Industrie und Gewerbe", fr: "Industrie et artisanat", it: "Industria e artigianato" },
  commerce: { de: "Handel und Verwaltung", fr: "Commerce et administration", it: "Commercio e amministrazione" },
  health: { de: "Fürsorge und Gesundheit", fr: "Prévoyance et santé", it: "Assistenza e sanità" },
  hospitality: { de: "Gastgewerbe", fr: "Hôtellerie et restauration", it: "Settore alberghiero" },
  leisure: { de: "Freizeit, Sport, Erholung", fr: "Loisirs, sport, détente", it: "Tempo libero, sport, svago" },
  traffic: { de: "Verkehrsanlagen", fr: "Installations de transport", it: "Impianti di trasporto" },
} satisfies Record<string, L10n>;

const bt = (id: string, group: L10n, text: L10n, hk: number, lk: number, s: number): BuildingType => ({ id, group, text, n: { hk, lk, s } });

/** Schwierigkeitsgrad n für den Normalfall (SIA 108 Art. 7.6.5), the building types relevant for our work. */
export const buildingTypes: BuildingType[] = [
  bt("mfh-same", g.living, { de: "Mehrfamilienhaus, gleichartige Wohnungstypen", fr: "Immeuble locatif, logements similaires", it: "Casa plurifamiliare, appartamenti uguali" }, 0.7, 0.7, 0.7),
  bt("mfh-mixed", g.living, { de: "Mehrfamilienhaus, verschiedenartige Wohnungstypen", fr: "Immeuble locatif, logements différents", it: "Casa plurifamiliare, appartamenti diversi" }, 0.8, 0.8, 0.8),
  bt("terrace-rep", g.living, { de: "Terrassenhaus mit Geschosswiederholung", fr: "Maison en terrasses, étages répétitifs", it: "Casa a terrazze, piani ripetuti" }, 0.7, 0.7, 0.8),
  bt("terrace", g.living, { de: "Terrassenhaus ohne Geschosswiederholung", fr: "Maison en terrasses, sans répétition", it: "Casa a terrazze, senza ripetizione" }, 0.8, 0.8, 0.9),
  bt("efh", g.living, { de: "Einfamilienhaus, einfach resp. durchschnittlich", fr: "Maison individuelle, simple ou moyenne", it: "Casa unifamiliare, semplice o media" }, 0.8, 0.8, 0.8),
  bt("efh-custom", g.living, { de: "Einfamilienhaus mit individuellen Ansprüchen", fr: "Maison individuelle, exigences individuelles", it: "Casa unifamiliare con esigenze individuali" }, 0.9, 0.9, 0.9),
  bt("senior-flats", g.living, { de: "Alterswohnungen, Alterssiedlungen", fr: "Logements pour personnes âgées", it: "Appartamenti per anziani" }, 0.8, 0.8, 0.8),
  bt("care-home", g.living, { de: "Altersheime", fr: "Homes pour personnes âgées", it: "Case per anziani" }, 1.0, 1.0, 1.0),
  bt("youth-home", g.living, { de: "Heimstätten, Kinder- und Jugendheime", fr: "Foyers pour enfants et jeunes", it: "Istituti per bambini e giovani" }, 0.9, 0.9, 0.9),
  bt("student-home", g.living, { de: "Studenten- und Lehrlingswohnheime", fr: "Foyers d’étudiants et d’apprentis", it: "Case per studenti e apprendisti" }, 0.8, 0.8, 0.8),
  bt("school", g.education, { de: "Kindergärten, Primar- und Sekundarschulen", fr: "Jardins d’enfants, écoles primaires et secondaires", it: "Scuole dell’infanzia, elementari e medie" }, 0.8, 0.8, 0.8),
  bt("vocational", g.education, { de: "Berufsschulen, höhere Fachschulen", fr: "Écoles professionnelles, écoles supérieures", it: "Scuole professionali, scuole specializzate superiori" }, 0.8, 0.8, 0.9),
  bt("gymnasium", g.education, { de: "Mittelschulen, Gymnasien", fr: "Écoles moyennes, gymnases", it: "Scuole medie superiori, licei" }, 0.8, 0.8, 0.9),
  bt("university", g.education, { de: "Hochschulen, Universitäten", fr: "Hautes écoles, universités", it: "Scuole universitarie, università" }, 1.0, 1.0, 1.0),
  bt("lab-research", g.education, { de: "Forschungsinstitute mit Laboratorien", fr: "Instituts de recherche avec laboratoires", it: "Istituti di ricerca con laboratori" }, 1.0, 1.2, 1.2),
  bt("warehouse", g.industry, { de: "Lagerhallen", fr: "Halles d’entreposage", it: "Capannoni di deposito" }, 0.6, 0.6, 0.6),
  bt("industrial-hall", g.industry, { de: "Industriehallen", fr: "Halles industrielles", it: "Capannoni industriali" }, 1.0, 1.0, 0.9),
  bt("workshop", g.industry, { de: "Betriebsgebäude, Gewerbebauten, Werkstätten", fr: "Bâtiments d’exploitation, artisanat, ateliers", it: "Edifici aziendali, artigianali, officine" }, 1.0, 1.0, 0.9),
  bt("lab", g.industry, { de: "Laborgebäude", fr: "Bâtiments de laboratoires", it: "Edifici di laboratorio" }, 1.1, 1.2, 1.2),
  bt("shop-simple", g.commerce, { de: "Ladenbauten, einfache Grundausstattung", fr: "Magasins, équipement simple", it: "Negozi, dotazione semplice" }, 0.8, 0.8, 0.8),
  bt("shop-complex", g.commerce, { de: "Ladenbauten, komplexe Grundausstattung", fr: "Magasins, équipement complexe", it: "Negozi, dotazione complessa" }, 0.9, 1.2, 0.9),
  bt("office-simple", g.commerce, { de: "Einfache Bürobauten", fr: "Bâtiments administratifs simples", it: "Edifici amministrativi semplici" }, 0.9, 0.8, 0.8),
  bt("office", g.commerce, { de: "Bürobauten mit erhöhten Anforderungen", fr: "Bâtiments administratifs à exigences accrues", it: "Edifici amministrativi con esigenze elevate" }, 1.0, 1.0, 0.9),
  bt("bank", g.commerce, { de: "Banken, Rechenzentren", fr: "Banques, centres de calcul", it: "Banche, centri di calcolo" }, 1.1, 1.2, 1.0),
  bt("doctor", g.health, { de: "Arztpraxen, Ärztehäuser", fr: "Cabinets médicaux", it: "Studi medici" }, 1.0, 1.1, 1.1),
  bt("hospital-beds", g.health, { de: "Krankenhäuser, Bettenhäuser", fr: "Hôpitaux, unités de soins", it: "Ospedali, reparti di degenza" }, 1.0, 1.0, 1.1),
  bt("nursing", g.health, { de: "Pflegeheime, Rehabilitationszentren", fr: "Établissements médico-sociaux, centres de réadaptation", it: "Case di cura, centri di riabilitazione" }, 1.0, 1.0, 1.1),
  bt("restaurant", g.hospitality, { de: "Restaurationsbetriebe", fr: "Restaurants", it: "Ristoranti" }, 1.0, 1.1, 1.1),
  bt("hotel", g.hospitality, { de: "Hotel- und Motelbauten", fr: "Hôtels et motels", it: "Alberghi e motel" }, 1.0, 1.2, 1.1),
  bt("hotel-simple", g.hospitality, { de: "Hotels mit einfachem Ausbau, Motels garnis", fr: "Hôtels simples, motels garnis", it: "Alberghi semplici, motel garni" }, 1.0, 1.0, 0.9),
  bt("sports-hall", g.leisure, { de: "Turn- und Sporthallen, Mehrzweckhallen", fr: "Salles de gymnastique et de sport", it: "Palestre e sale polivalenti" }, 0.9, 0.9, 0.9),
  bt("pool", g.leisure, { de: "Kunsteishallen, Hallenbäder", fr: "Patinoires couvertes, piscines couvertes", it: "Piste di ghiaccio coperte, piscine coperte" }, 1.1, 1.2, 1.1),
  bt("garage-single", g.traffic, { de: "Eingeschossige Einstellgaragen", fr: "Garages couverts à un niveau", it: "Autorimesse a un piano" }, 0.6, 0.8, 0.6),
  bt("garage-under", g.traffic, { de: "Tiefgaragen", fr: "Parkings souterrains", it: "Autorimesse sotterranee" }, 0.8, 0.8, 0.8),
];

/** Grundfaktor p (Art. 7.2.2); null without Z values or costs. */
export function baseFactor(z1: number | null, z2: number | null, bp: number | null): number | null {
  if (z1 === null || z2 === null || !bp || bp <= 0) return null;
  return z1 + z2 / Math.cbrt(bp);
}

export type SiaFactors = { b: number; bp: number; z1: number | null; z2: number | null; n: number; r: number; i: number; s: number; u: number };

/** Prognostizierter Zeitaufwand Tp in hours for the Leistungsanteil q (in %); null when p is unknown. */
export function predictedHours(f: SiaFactors, q: number): number | null {
  const p = baseFactor(f.z1, f.z2, f.bp);
  if (p === null || f.b <= 0) return null;
  const tm = ((f.b * p) / 100) * f.n * (q / 100) * f.r * f.u;
  return tm * f.i;
}
