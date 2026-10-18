import type { L10n } from "@/lib/planning";
import type { AppLanguage } from "@/lib/supabase/types";

import type { FeePhase, FeeTrade } from "./sia108";

export const feeOfferStatuses = ["draft", "sent", "accepted", "declined"] as const;
export type FeeOfferStatus = (typeof feeOfferStatuses)[number];

/** Names of the trades and phases in the offer language (UI and PDF). */
export const tradeNames: Record<FeeTrade, L10n> = {
  heating: { de: "Heizung", fr: "Chauffage", it: "Riscaldamento" },
  cooling: { de: "Kälte", fr: "Froid", it: "Refrigerazione" },
  ventilation: { de: "Lüftung / Klima", fr: "Ventilation / climatisation", it: "Ventilazione / climatizzazione" },
  sanitary: { de: "Sanitär", fr: "Sanitaire", it: "Sanitario" },
};

export const phaseNames: Record<FeePhase, L10n> = {
  "31": { de: "Vorprojekt", fr: "Avant-projet", it: "Progetto di massima" },
  "32": { de: "Bauprojekt", fr: "Projet de l’ouvrage", it: "Progetto definitivo" },
  "33": { de: "Bewilligungsverfahren", fr: "Procédure de demande d’autorisation", it: "Procedura di autorizzazione" },
  "41": { de: "Ausschreibung, Offertvergleich, Vergabeantrag", fr: "Appel d’offres, comparaison des offres, proposition d’adjudication", it: "Appalto, confronto delle offerte, proposta di aggiudicazione" },
  "51": { de: "Ausführungsprojekt", fr: "Projet d’exécution", it: "Progetto esecutivo" },
  "52": { de: "Ausführung (Fachbauleitung)", fr: "Exécution de l’ouvrage (direction des travaux spécialisée)", it: "Esecuzione dell’opera (direzione lavori specialistica)" },
  "53": { de: "Inbetriebnahme, Abschluss", fr: "Mise en service, achèvement", it: "Messa in esercizio, chiusura" },
};

export const phaseLabel = (phase: FeePhase, language: AppLanguage) => `${phase} ${phaseNames[phase][language]}`;
