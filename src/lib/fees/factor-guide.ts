import type { L10n } from "@/lib/planning";

// Guidance for the SIA 108:2014 factors in the offer editor: choosable values with their meaning, the influences
// the norm lists, and the decision matrix for a Fachkoordinator (Art. 9.2). `norm: false` marks our own
// Richtwerte where the norm gives no values (Teamfaktor i).

export type FactorKey = "r" | "i" | "s" | "u" | "k";
export type FactorPreset = { value: number; text: L10n };
export type FactorGuide = { ref: string; presets: FactorPreset[]; examples?: L10n[]; norm: boolean };

const t3 = (de: string, fr: string, it: string): L10n => ({ de, fr, it });

export const factorGuides: Record<FactorKey, FactorGuide> = {
  r: {
    ref: "SIA 108 Art. 7.8",
    norm: true,
    presets: [
      { value: 0.85, text: t3("Deutlich vereinfacht", "Nettement simplifié", "Nettamente semplificato") },
      { value: 0.95, text: t3("Leicht vereinfacht", "Légèrement simplifié", "Leggermente semplificato") },
      { value: 1, text: t3("Normaler Verlauf von Planung und Ausführung", "Déroulement normal des études et de l’exécution", "Svolgimento normale di progettazione ed esecuzione") },
      { value: 1.05, text: t3("Leicht erschwert", "Légèrement difficile", "Leggermente difficile") },
      { value: 1.15, text: t3("Deutlich erschwert (mehrere Einflüsse)", "Nettement difficile (plusieurs influences)", "Nettamente difficile (più influssi)") },
      { value: 1.25, text: t3("Stark erschwert (Obergrenze)", "Fortement difficile (limite supérieure)", "Fortemente difficile (limite superiore)") },
    ],
    examples: [
      t3(
        "Lokale Einflüsse: geografische Lage, Topografie, Klima, Umweltvorschriften, vorhandene Bausubstanz, Transport- und Platzverhältnisse",
        "Influences locales : situation géographique, topographie, climat, prescriptions environnementales, substance bâtie existante, transport et place disponible",
        "Influssi locali: posizione geografica, topografia, clima, prescrizioni ambientali, sostanza edilizia esistente, trasporto e spazio disponibile",
      ),
      t3(
        "Organisatorische Einflüsse: Organisation von Auftraggeber, Behörden und Dritten, Termine, Vorgaben zu Projektorganisation und EDV, Vergabeverfahren, Anzahl und Grösse der Baulose, Ausführung durch den Auftraggeber in Eigenregie",
        "Influences organisationnelles : organisation du mandant, des autorités et de tiers, délais, exigences d’organisation et d’informatique, procédure d’adjudication, nombre et taille des lots, exécution par le mandant en régie",
        "Influssi organizzativi: organizzazione del committente, delle autorità e di terzi, scadenze, requisiti di organizzazione e informatica, procedura di aggiudicazione, numero e dimensione dei lotti, esecuzione in proprio da parte del committente",
      ),
      t3(
        "Bearbeitungsaufwand: Betriebseinrichtungen ausserhalb der Baukosten, vorhandene Einrichtungen, Verhältnis Anlagegrösse zu Kosten, Teilaufträge, Sicherheitsvorschriften, ungewöhnliche Grundrisse und Schnitte, spezielle Baustoffe oder Bauweisen (z. B. Vorfabrikation)",
        "Charge de travail : équipements d’exploitation hors coûts, équipements existants, rapport taille/coûts des installations, mandats partiels, prescriptions de sécurité, plans et coupes inhabituels, matériaux ou modes de construction spéciaux (p. ex. préfabrication)",
        "Onere di lavoro: attrezzature d’esercizio fuori dai costi, attrezzature esistenti, rapporto dimensione/costi degli impianti, mandati parziali, prescrizioni di sicurezza, piante e sezioni insolite, materiali o modi di costruzione speciali (p. es. prefabbricazione)",
      ),
    ],
  },
  i: {
    ref: "SIA 108 Art. 7.9",
    norm: false,
    presets: [
      { value: 0.9, text: t3("Eingespieltes Team mit Erfahrung in vergleichbaren Projekten", "Équipe rodée, expérience de projets comparables", "Team affiatato con esperienza in progetti simili") },
      { value: 1, text: t3("Normalfall (Norm ohne besondere Vereinbarung)", "Cas normal (norme sans convention particulière)", "Caso normale (norma senza accordo particolare)") },
      { value: 1.1, text: t3("Neues oder grosses Team, viele Schnittstellen", "Équipe nouvelle ou importante, nombreuses interfaces", "Team nuovo o numeroso, molte interfacce") },
    ],
  },
  s: {
    ref: "SIA 108 Art. 7.10",
    norm: true,
    presets: [
      { value: 1, text: t3("Keine besonderen Mehrleistungen", "Aucune prestation supplémentaire particulière", "Nessuna prestazione supplementare particolare") },
      { value: 1.1, text: t3("Geringer Mehrwert (besondere Kenntnisse)", "Faible plus-value (connaissances particulières)", "Plusvalore ridotto (conoscenze particolari)") },
      { value: 1.25, text: t3("Mittlerer Mehrwert (grosse Verantwortung)", "Plus-value moyenne (grande responsabilité)", "Plusvalore medio (grande responsabilità)") },
      { value: 1.5, text: t3("Grosser Mehrwert, grosse wirtschaftliche Vorteile für den Auftraggeber", "Grande plus-value, avantages économiques importants pour le mandant", "Grande plusvalore, notevoli vantaggi economici per il committente") },
    ],
  },
  u: {
    ref: "SIA 108 Art. 7.14",
    norm: true,
    presets: [
      { value: 1, text: t3("Neubau (auch selbständige Neubauteile eines Umbaus)", "Construction neuve (aussi parties neuves indépendantes d’une transformation)", "Nuova costruzione (anche parti nuove indipendenti di una trasformazione)") },
      { value: 1.2, text: t3("Umbau, wenig erschwert (+20 %)", "Transformation, peu difficile (+20 %)", "Trasformazione, poco difficile (+20 %)") },
      { value: 1.3, text: t3("Umbau, mittel erschwert (+30 %)", "Transformation, moyennement difficile (+30 %)", "Trasformazione, mediamente difficile (+30 %)") },
      { value: 1.4, text: t3("Umbau, stark erschwert (+40 %)", "Transformation, très difficile (+40 %)", "Trasformazione, molto difficile (+40 %)") },
    ],
  },
  k: {
    ref: "SIA 108 Art. 9.6.1",
    norm: true,
    presets: [
      { value: 0.15, text: t3("Räumliche Fachkoordination, übliche Abhängigkeiten", "Coordination spatiale, dépendances usuelles", "Coordinamento spaziale, dipendenze usuali") },
      { value: 0.175, text: t3("Erhöhte räumliche Abhängigkeiten", "Dépendances spatiales accrues", "Dipendenze spaziali elevate") },
      { value: 0.2, text: t3("Grosse Abhängigkeiten, hoher Vernetzungsgrad", "Grandes dépendances, forte interconnexion", "Grandi dipendenze, alto grado di interconnessione") },
    ],
  },
};

/** Preset matching a value (rounded to the input precision). */
export const presetOf = (key: FactorKey, value: number) => factorGuides[key].presets.find((p) => Math.abs(p.value - value) < 0.0005) ?? null;

/** Criteria of SIA 108 Art. 9.2 for the decision whether a Fachkoordinator is needed; each scored 1–3. */
export type FkCriterion = { id: string; text: L10n; levels: [L10n, L10n, L10n] };

export const fkCriteria: FkCriterion[] = [
  {
    id: "use",
    text: t3("Nutzung", "Affectation", "Destinazione"),
    levels: [
      t3("Wohnen, Lager", "Habitation, dépôt", "Abitazione, deposito"),
      t3("Verwaltung, Schulen, Sport, Hotel, Restaurant, Verkauf, Versammlung", "Administration, écoles, sport, hôtel, restaurant, vente, rassemblement", "Amministrazione, scuole, sport, albergo, ristorante, vendita, riunione"),
      t3("Spital, Industrie", "Hôpital, industrie", "Ospedale, industria"),
    ],
  },
  {
    id: "project",
    text: t3("Bauvorhaben", "Projet", "Progetto"),
    levels: [t3("Neubau", "Construction neuve", "Nuova costruzione"), t3("Erweiterung", "Agrandissement", "Ampliamento"), t3("Umbau", "Transformation", "Trasformazione")],
  },
  {
    id: "operation",
    text: t3("Betrieb", "Exploitation", "Esercizio"),
    levels: [t3("Leer stehend", "Vide", "Vuoto"), t3("Teilbereich in Betrieb", "Partiellement en service", "Parzialmente in esercizio"), t3("Weiterlaufende Nutzung", "Utilisation continue", "Utilizzo continuo")],
  },
  {
    id: "dependencies",
    text: t3("Abhängigkeiten", "Dépendances", "Dipendenze"),
    levels: [
      t3("Einfach, ohne räumliche und technische Abhängigkeiten", "Simple, sans dépendances spatiales ni techniques", "Semplice, senza dipendenze spaziali e tecniche"),
      t3("Erhöhte Abhängigkeiten, mittlerer Vernetzungsgrad", "Dépendances accrues, interconnexion moyenne", "Dipendenze elevate, interconnessione media"),
      t3("Grosse Abhängigkeiten, hoher Vernetzungsgrad", "Grandes dépendances, forte interconnexion", "Grandi dipendenze, alta interconnessione"),
    ],
  },
  {
    id: "installations",
    text: t3("Zusätzliche (Betriebs-)Installationen", "Installations (d’exploitation) supplémentaires", "Installazioni (d’esercizio) supplementari"),
    levels: [
      t3("Keine", "Aucune", "Nessuna"),
      t3("Betriebsinfrastruktur im normalen Rahmen", "Infrastructure d’exploitation dans le cadre usuel", "Infrastruttura d’esercizio nel quadro usuale"),
      t3("Betriebsinfrastruktur stark betroffen", "Infrastructure d’exploitation fortement touchée", "Infrastruttura d’esercizio fortemente toccata"),
    ],
  },
];

export type FkAdvice = "lead" | "check" | "recommended";

/**
 * Sum N of the scores and the advice of Art. 9.2: ≤ 7 Gesamtleiter, 7–11 prüfenswert, ≥ 11 empfohlen (the norm's
 * ranges overlap at 7 and 11; we take the outer advice there).
 */
export function fkAdvice(scores: Record<string, number>): { sum: number; complete: boolean; advice: FkAdvice } {
  const values = fkCriteria.map((c) => scores[c.id]).filter((v): v is number => typeof v === "number");
  const sum = values.reduce((a, b) => a + b, 0);
  return { sum, complete: values.length === fkCriteria.length, advice: sum <= 7 ? "lead" : sum >= 11 ? "recommended" : "check" };
}
