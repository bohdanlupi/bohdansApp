// KWL planning workflow structured by the SIA 108:2014 phases. Checklist items paraphrase the requirements
// of SIA 382/5:2021, the EnDK aids EN-105 / EN-110 (2018) and the SIA 108 basic services; `ref` names the
// clause to look up (bare numbers are SIA 382/5).

import type { L10n, PlanChecklistItem } from "@/lib/planning";

import type { PlanParams } from "./plan-schema";

export type { L10n };

export type ChecklistItem = PlanChecklistItem<PlanParams>;

/** Calculation / diagram widgets that phase pages can show. */
export type WidgetKey =
  | "concept"
  | "rough"
  | "energy"
  | "cascade"
  | "dwellings"
  | "co2"
  | "frost"
  | "doorGap"
  | "acoustics"
  | "intake"
  | "extract"
  | "lv"
  | "targets"
  | "commissioning"
  | "operation";

export type PhaseSection =
  | { kind: "checklist"; key: string; title: L10n; items: ChecklistItem[] }
  | { kind: "widget"; widget: WidgetKey; when?: (p: PlanParams) => boolean };

export type Phase = { code: string; sia108: string; title: L10n; goal: L10n; sections: PhaseSection[] };

const i = (id: string, ref: string, de: string, fr: string, it: string, when?: (p: PlanParams) => boolean): ChecklistItem => ({
  id,
  ref,
  text: { de, fr, it },
  when,
});
const list = (key: string, title: L10n, items: ChecklistItem[]): PhaseSection => ({ kind: "checklist", key, title, items });
const widget = (w: WidgetKey, when?: (p: PlanParams) => boolean): PhaseSection => ({ kind: "widget", widget: w, when });
const t = (de: string, fr: string, it: string): L10n => ({ de, fr, it });

const multi = (p: PlanParams) => p.unit === "multi";
const extract = (p: PlanParams) => p.system === "extract";
const demand = (p: PlanParams) => p.operation === "demand";
const fireplace = (p: PlanParams) => p.fireplace !== "none";

export const phases: Phase[] = [
  {
    code: "31",
    sia108: "4.31",
    title: t("Vorprojekt", "Avant-projet", "Progetto di massima"),
    goal: t(
      "Konzeption und Wirtschaftlichkeit optimiert. Lüftungskonzept, Grobdimensionierung, Kostenschätzung ±15 %.",
      "Conception et rentabilité optimisées. Concept de ventilation, prédimensionnement, estimation des coûts ±15 %.",
      "Concezione ed economicità ottimizzate. Concetto di ventilazione, predimensionamento, stima dei costi ±15 %.",
    ),
    sections: [
      list("basics", t("Grundlagen und Nutzungsvereinbarung", "Bases et convention d’utilisation", "Basi e convenzione d’utilizzazione"), [
        i("p31.agreement", "0.1.5, 3.1.2", "Nutzungsvereinbarung mit der Bauherrschaft: Raumnutzungen, Anforderungen und Abweichungen von der Norm schriftlich festgehalten.", "Convention d’utilisation avec le maître d’ouvrage : utilisations des locaux, exigences et dérogations à la norme consignées par écrit.", "Convenzione d’utilizzazione con il committente: utilizzazioni dei locali, esigenze e deroghe alla norma fissate per iscritto."),
        i("p31.usage", "3.4", "Nutzungsdaten geklärt: Nutzungsdauer (z. B. Ferienwohnung), Personenbelegung, Feuchte-, Schadstoff- und Lärmquellen; sonst Standardwerte SIA 2024.", "Données d’utilisation clarifiées : durée d’utilisation (p. ex. résidence secondaire), occupation, sources d’humidité, de polluants et de bruit ; sinon valeurs standard SIA 2024.", "Dati d’utilizzazione chiariti: durata d’uso (p. es. casa di vacanza), occupazione, fonti di umidità, inquinanti e rumore; altrimenti valori standard SIA 2024."),
        i("p31.comfort", "3.5", "Behaglichkeit festgelegt: Aufenthaltsbereiche, Raumlufttemperaturen Winter/Sommer, Zugluftrisiko, Raumluftfeuchte, akustische Anforderungen, Druckverhältnisse.", "Confort défini : zones d’occupation, températures hiver/été, risque de courant d’air, humidité, exigences acoustiques, conditions de pression.", "Comfort definito: zone di permanenza, temperature inverno/estate, rischio di correnti d’aria, umidità, esigenze acustiche, condizioni di pressione."),
        i("p31.rooms", "3.3.2", "Raumprogramm ausgewertet: Wohnungsgrössen, Schaltzimmer, innenliegende Nassräume, Zimmer, Durchströmbereiche, Platz für Lüftungsinstallationen.", "Programme des locaux évalué : tailles des logements, pièces modulables, locaux humides intérieurs, chambres, zones de transfert, place pour les installations.", "Programma dei locali valutato: dimensioni degli appartamenti, locali commutabili, locali umidi interni, camere, zone di transito, spazio per le installazioni."),
        i("p31.outdoor", "3.2", "Aussenbedingungen erhoben: Klimadaten SIA 2028, Aussenlärm (LSV), Luftbelastung NO₂/PM10/PM2.5 am geplanten Aussenluft-Durchlass, Gerüche.", "Conditions extérieures relevées : données climatiques SIA 2028, bruit extérieur (OPB), pollution NO₂/PM10/PM2.5 à la prise d’air prévue, odeurs.", "Condizioni esterne rilevate: dati climatici SIA 2028, rumore esterno (OIF), inquinamento NO₂/PM10/PM2.5 alla presa d’aria prevista, odori."),
        i("p31.energy", "3.3.5", "Anforderungen aus Energiekonzept bzw. Energienachweis übernommen (thermisch wirksamer Aussenluft-Volumenstrom, Elektrizitätsbedarf).", "Exigences du concept énergétique ou du justificatif énergétique reprises (débit d’air extérieur thermiquement actif, besoins en électricité).", "Esigenze del concetto energetico o della prova energetica riprese (portata d’aria esterna termicamente attiva, fabbisogno di elettricità)."),
      ]),
      widget("concept"),
      list("concept", t("Lüftungskonzept (SIA 180, Ziffer 3.2.1)", "Concept de ventilation (SIA 180, ch. 3.2.1)", "Concetto di ventilazione (SIA 180, cifra 3.2.1)"), [
        i("p31.concept", "4.1.6", "Lüftungskonzept im Vorprojekt erstellt (natürliche Lüftung, einfache Abluftanlage oder Zu-/Abluftanlage).", "Concept de ventilation établi dans l’avant-projet (ventilation naturelle, simple extraction ou double flux).", "Concetto di ventilazione allestito nel progetto di massima (naturale, semplice estrazione o immissione/estrazione)."),
        i("p31.kitchen", "4.1.11", "Prinzip der Kochstellenlüftung im Konzept festgelegt.", "Principe de ventilation de la cuisson défini dans le concept.", "Principio di ventilazione della zona cottura definito nel concetto."),
        i("p31.windows", "4.1.7, 4.1.10", "In Räumen mit Fenstern kann mindestens ein Fenster jederzeit geöffnet werden; Fensterlüftung für Spitzenlasten und Nachtauskühlung möglich.", "Dans les pièces avec fenêtres, au moins une fenêtre peut être ouverte en tout temps ; aération par fenêtre possible pour les pointes et le refroidissement nocturne.", "Nei locali con finestre almeno una finestra è apribile in ogni momento; aerazione dalle finestre possibile per i picchi e il raffreddamento notturno."),
        i("p31.ancillary", "4.1.8", "Fensterlose Nebenräume über 10 m² mechanisch belüftet; kleinere mit der Bauherrschaft geklärt.", "Locaux annexes sans fenêtre de plus de 10 m² ventilés mécaniquement ; plus petits clarifiés avec le maître d’ouvrage.", "Locali accessori senza finestre oltre 10 m² ventilati meccanicamente; quelli più piccoli chiariti con il committente."),
        i("p31.envelope", "4.1.9, 0.1.2", "Nur Räume innerhalb der thermischen Gebäudehülle angeschlossen; Kellerräume unabhängig belüftet.", "Seuls les locaux à l’intérieur de l’enveloppe thermique sont raccordés ; caves ventilées séparément.", "Collegati solo locali all’interno dell’involucro termico; cantine ventilate separatamente."),
        i("p31.summer", "2.1.3.2", "Sommerlicher Wärmeschutz mit anderen Massnahmen sichergestellt (die Lüftungsanlage ist dafür ungeeignet).", "Protection thermique estivale assurée par d’autres mesures (l’installation de ventilation n’y convient pas).", "Protezione termica estiva garantita con altre misure (l’impianto di ventilazione non è adatto)."),
        i("p31.cooling", "EN-110 Tabelle 1", "Notwendigkeit einer Kühlung anhand der internen Wärmeeinträge beurteilt (mit/ohne Fensterlüftung); die KWL ist keine Kühlung.", "Nécessité d’un refroidissement évaluée selon les apports internes (avec/sans aération par fenêtre) ; la VMC ne refroidit pas.", "Necessità di raffrescamento valutata in base agli apporti interni (con/senza aerazione dalle finestre); la VMC non raffresca."),
        i("p31.flow", "5.2.1.2, 4.4.1", "Luftführung von Räumen niedriger zu Räumen höherer Belastung (Kaskadenlüftung).", "Circulation de l’air des pièces peu chargées vers les pièces plus chargées (ventilation en cascade).", "Flusso d’aria dai locali poco carichi a quelli più carichi (ventilazione a cascata)."),
        i("p31.fireplace", "2.4.2, 4.4.5.7", "Feuerstätte in der Wohnung: Unterdruckbegrenzung bzw. Überwachung vorgesehen (4 Pa raumluftabhängig, 8 Pa raumluftunabhängig).", "Foyer dans le logement : limitation ou surveillance de la dépression prévue (4 Pa dépendant, 8 Pa indépendant de l’air ambiant).", "Focolare nell’appartamento: limitazione o sorveglianza della depressione prevista (4 Pa dipendente, 8 Pa indipendente dall’aria ambiente).", fireplace),
        i("p31.radon", "2.1.4.2", "Radon: erdberührende Räume mit Personenbelegung dicht; präventive bauliche Massnahmen zur nachträglichen Radonsenkung.", "Radon : locaux occupés en contact avec le terrain étanches ; mesures préventives permettant de réduire le radon ultérieurement.", "Radon: locali occupati a contatto con il terreno stagni; misure preventive per ridurre il radon in seguito."),
        i("p31.separation", "2.1.4.3", "Trennbauteile zu Garagen, Kellern usw. möglichst luftdicht (< 2 m³/h pro m² bei 50 Pa).", "Éléments de séparation vers garages, caves etc. aussi étanches que possible (< 2 m³/h par m² à 50 Pa).", "Elementi di separazione verso autorimesse, cantine ecc. il più possibile ermetici (< 2 m³/h per m² a 50 Pa)."),
        i("p31.emissions", "2.1.4.1, Anhang B", "Emissionsarme Baumaterialien eingeplant.", "Matériaux de construction à faibles émissions prévus.", "Materiali da costruzione a basse emissioni previsti."),
        i("p31.airtight", "2.1.2", "Anforderungen an die Luftdichtheit der Gebäudehülle nach SIA 180 festgelegt (bei Abluftanlagen Zielwert).", "Exigences d’étanchéité à l’air de l’enveloppe selon SIA 180 fixées (valeur cible pour les installations d’extraction).", "Esigenze di ermeticità dell’involucro secondo SIA 180 fissate (valore obiettivo per impianti di estrazione)."),
        i("p31.unoccupied", "4.2.7", "Längere Nichtbelegung im Winter (Ferienwohnung, Leerstand): Reduktion des Volumenstroms vorgesehen.", "Inoccupation prolongée en hiver (résidence secondaire, vacance) : réduction du débit prévue.", "Non occupazione prolungata in inverno (casa di vacanza, sfitto): riduzione della portata prevista."),
        i("p31.disposal", "8", "Rückbau und Entsorgung berücksichtigt; kurzlebige Komponenten ohne grössere bauliche Eingriffe ersetzbar.", "Déconstruction et élimination prises en compte ; composants à courte durée de vie remplaçables sans travaux importants.", "Smantellamento e smaltimento considerati; componenti di breve durata sostituibili senza grandi interventi."),
      ]),
      widget("rough"),
      widget("energy"),
      widget("cascade"),
      list("close31", t("Kosten, Termine, Phasenabschluss (SIA 108)", "Coûts, délais, clôture de phase (SIA 108)", "Costi, scadenze, chiusura di fase (SIA 108)"), [
        i("p31.variants", "SIA 108 4.31", "Varianten erarbeitet und bewertet (besonders zu vereinbarende Leistung).", "Variantes élaborées et évaluées (prestation à convenir spécialement).", "Varianti elaborate e valutate (prestazione da convenire)."),
        i("p31.coordination", "SIA 108 4.31", "Konzepte mit Architektur und Fachplanern abgestimmt (Gerätestandort, Steigzonen, Grobkoordination).", "Concepts coordonnés avec l’architecte et les ingénieurs (emplacement de l’appareil, gaines, coordination sommaire).", "Concetti coordinati con architetto e specialisti (ubicazione apparecchio, cavedi, coordinamento generale)."),
        i("p31.cost", "SIA 108 4.31", "Kostenschätzung ±15 % im Fachbereich erstellt (Kostenplan).", "Estimation des coûts ±15 % établie (plan des coûts).", "Stima dei costi ±15 % allestita (piano dei costi)."),
        i("p31.operating", "SIA 108 4.31", "Betriebs- und Instandhaltungskosten geschätzt.", "Coûts d’exploitation et d’entretien estimés.", "Costi d’esercizio e di manutenzione stimati."),
        i("p31.permit", "SIA 108 4.31", "Bewilligungstauglichkeit abgeklärt (Fortluftführung, Brandschutz, Gebühren).", "Aptitude à l’autorisation clarifiée (air rejeté, protection incendie, taxes).", "Idoneità all’autorizzazione chiarita (aria espulsa, protezione antincendio, tasse)."),
        i("p31.approval", "SIA 108 4.31", "Vorprojekt mit Kostenschätzung genehmigt; Entscheid über die weiterzuverfolgende Variante.", "Avant-projet avec estimation approuvé ; décision sur la variante à poursuivre.", "Progetto di massima con stima approvato; decisione sulla variante da seguire."),
      ]),
    ],
  },
  {
    code: "32",
    sia108: "4.32",
    title: t("Bauprojekt", "Projet de l’ouvrage", "Progetto definitivo"),
    goal: t(
      "Projekt und Kosten optimiert, Termine definiert. Bemessung aller Wohnungen, Gerätewahl, Kostenvoranschlag ±10 %.",
      "Projet et coûts optimisés, délais définis. Dimensionnement de tous les logements, choix des appareils, devis ±10 %.",
      "Progetto e costi ottimizzati, scadenze definite. Dimensionamento di tutti gli appartamenti, scelta degli apparecchi, preventivo ±10 %.",
    ),
    sections: [
      widget("dwellings"),
      list("sizing", t("Bemessung der Luftvolumenströme", "Dimensionnement des débits d’air", "Dimensionamento delle portate d’aria"), [
        i("p32.flows", "5.2, 5.4.3", "Volumenströme je Raum nach Tabellen 2 und 3 bestimmt; massgebend ist der grössere Wert, Zu- und Abluft ausgeglichen.", "Débits par pièce selon tableaux 2 et 3 ; la plus grande valeur est déterminante, air fourni et repris équilibrés.", "Portate per locale secondo tabelle 2 e 3; determinante il valore maggiore, immissione e ripresa bilanciate."),
        i("p32.base", "5.2.3.1", "Grundlüftung mindestens 0.1 h⁻¹ in jedem Raum mit Zuluft und im Mittel der Wohnung.", "Ventilation de base d’au moins 0.1 h⁻¹ dans chaque pièce avec air fourni et en moyenne du logement.", "Ventilazione di base almeno 0.1 h⁻¹ in ogni locale con immissione e in media dell’appartamento."),
        i("p32.newbuilding", "5.2.3.2", "Neubau: in den ersten drei Monaten mindestens 0.3 h⁻¹ möglich.", "Construction neuve : au moins 0.3 h⁻¹ possible pendant les trois premiers mois.", "Nuova costruzione: almeno 0.3 h⁻¹ possibile nei primi tre mesi."),
        i("p32.co2", "2.2.5.6, 5.2.4.3", "CO₂-Pegel bei Normalbelegung 1’000 bis 1’400 ppm.", "Teneur en CO₂ en occupation normale de 1’000 à 1’400 ppm.", "Livello di CO₂ con occupazione normale da 1’000 a 1’400 ppm."),
        i("p32.humidity", "2.2.6", "Untere Feuchtegrenze ohne aktive Befeuchtung eingehalten (bedarfsgerechte Lüftung, WRG mit Feuchteübertragung).", "Limite inférieure d’humidité respectée sans humidification active (ventilation selon les besoins, récupération d’humidité).", "Limite inferiore di umidità rispettato senza umidificazione attiva (ventilazione secondo il fabbisogno, recupero dell’umidità)."),
        i("p32.stages", "5.3.8.2", "Mindestens zwei Betriebsstufen (Grundlüftung, Normallüftung) durch die Bewohner einstellbar.", "Au moins deux niveaux de fonctionnement (ventilation de base, normale) réglables par les habitants.", "Almeno due livelli di funzionamento (base, normale) regolabili dagli abitanti."),
        i("p32.runon", "5.2.5.2", "Bedarfsgesteuert: Nachlaufzeit mindestens einfaches Raumvolumen.", "Commandé selon les besoins : temporisation d’au moins un volume de la pièce.", "Comandato secondo il fabbisogno: tempo di post-funzionamento almeno un volume del locale.", demand),
        i("p32.simultaneity", "5.4.1.5", "Gleichzeitigkeit 0.7 bis 1.0 für das Gerät schriftlich mit der Bauherrschaft vereinbart.", "Simultanéité de 0.7 à 1.0 pour l’appareil convenue par écrit avec le maître d’ouvrage.", "Contemporaneità da 0.7 a 1.0 per l’apparecchio convenuta per iscritto con il committente.", multi),
        i("p32.balancing", "5.3.8.6", "Leitungsnetz verteilt ohne wesentliche Einregulierung, sonst automatischer Abgleich (Volumenstromregler).", "Réseau distribue sans réglage important, sinon équilibrage automatique (régulateurs de débit).", "Rete distribuisce senza taratura importante, altrimenti bilanciamento automatico (regolatori di portata).", multi),
      ]),
      widget("co2"),
      widget("extract", extract),
      list("device", t("Lüftungsgerät und Komponenten", "Appareil de ventilation et composants", "Apparecchio di ventilazione e componenti"), [
        i("p32.device", "5.4.1", "Gerät gewählt; Betriebspunkte auf der Kennlinie geprüft (Nennbetrieb nicht auf höchster Stufe).", "Appareil choisi ; points de fonctionnement vérifiés (service nominal pas au niveau maximal).", "Apparecchio scelto; punti di funzionamento verificati (esercizio nominale non al livello massimo)."),
        i("p32.energyclass", "5.5.1, Tabelle 7", "Energieklasse mindestens A (Zu-/Abluft, Einzelraumgerät) bzw. C (Abluftanlage).", "Classe énergétique au moins A (double flux, appareil individuel) ou C (extraction).", "Classe energetica almeno A (immissione/estrazione, apparecchio singolo) o C (estrazione)."),
        i("p32.pressureCalc", "Tabelle 7, SIA 108 4.32", "Druckverlust im Lüftungsnetz der Anlage berechnet (AUL → Räume und Räume → FOL, massgebender Strang, Drosselbedarf der übrigen Stränge) und für die Gerätewahl verwendet.", "Pertes de charge du réseau de l’installation calculées (AEX → pièces et pièces → AEJ, branche déterminante, étranglement des autres branches) et utilisées pour le choix de l’appareil.", "Perdite di carico della rete dell’impianto calcolate (AES → locali e locali → espulsione, ramo determinante, strozzamento degli altri rami) e usate per la scelta dell’apparecchio."),
        i("p32.external", "Tabelle 7", "Externer Druckverlust eingehalten (Zu-/Abluft: Grenzwert 150 Pa, Zielwert 100 Pa).", "Perte de charge externe respectée (double flux : limite 150 Pa, cible 100 Pa).", "Perdita di carico esterna rispettata (immissione/estrazione: limite 150 Pa, obiettivo 100 Pa)."),
        i("p32.hr", "2.3.6, EN-105 2", "Wärmerückgewinnung vorhanden (Pflicht bei Aussen- und Fortluft); Temperaturänderungsgrad nach EnEV (VO (EU) 1253/2014) bzw. SIA 382/1 Ziffer 5.10.", "Récupération de chaleur présente (obligatoire avec air extérieur et rejeté) ; rendement selon l’OEEE (règl. (UE) 1253/2014) ou SIA 382/1 ch. 5.10.", "Recupero di calore presente (obbligatorio con aria esterna ed espulsa); rendimento secondo OEEne (reg. (UE) 1253/2014) o SIA 382/1 cifra 5.10."),
        i("p32.frost", "4.3, Anhang D", "Vereisungsschutz gewählt; keine unzulässige Disbalance, keine elektrische Zusatzheizung.", "Protection antigel choisie ; pas de déséquilibre inadmissible ni de chauffage électrique d’appoint.", "Protezione antigelo scelta; nessuno squilibrio inammissibile né riscaldamento elettrico supplementare."),
        i("p32.leakage", "5.5.5.2", "Dichte Geräte bzw. WRG eingesetzt (Undichtheit Klasse A1, B1 oder C1).", "Appareils ou échangeurs étanches (classe d’inétanchéité A1, B1 ou C1).", "Apparecchi o scambiatori ermetici (classe di non ermeticità A1, B1 o C1).", multi),
        i("p32.tested", "5.3.1", "Komponenten nach SN EN 13141 geprüft und nach SN EN 13142 deklariert.", "Composants testés selon SN EN 13141 et déclarés selon SN EN 13142.", "Componenti testati secondo SN EN 13141 e dichiarati secondo SN EN 13142."),
      ]),
      widget("frost"),
      list("transfer", t("Luftführung und Überströmung", "Circulation de l’air et transfert", "Flusso d’aria e transito"), [
        i("p32.transfer", "5.3.5.1, 4.4.1.2", "Druckabfall der Überström-Luftdurchlässe nach Tabelle 4; Funktion bei offenen und geschlossenen Türen gleich.", "Perte de charge des bouches de transfert selon tableau 4 ; fonctionnement identique portes ouvertes ou fermées.", "Perdita di carico delle bocchette di transito secondo tabella 4; funzionamento uguale con porte aperte o chiuse."),
        i("p32.series", "4.4.1.3", "Höchstens zwei Überström-Luftdurchlässe in Serie.", "Au plus deux bouches de transfert en série.", "Al massimo due bocchette di transito in serie."),
        i("p32.gap", "5.3.5.2", "Türspalt höchstens 10 mm und 1.5 m/s; keine Absenkdichtungen ohne Überström-Luftdurchlass.", "Fente de porte au plus 10 mm et 1.5 m/s ; pas de joints abaissables sans bouche de transfert.", "Fessura della porta al massimo 10 mm e 1.5 m/s; nessuna guarnizione a ghigliottina senza bocchetta di transito."),
        i("p32.terminals", "2.2.2.3", "Luftdurchlässe schränken den Aufenthaltsbereich nicht ein; Komfortkriterien eingehalten.", "Les bouches ne restreignent pas la zone d’occupation ; critères de confort respectés.", "Le bocchette non limitano la zona di permanenza; criteri di comfort rispettati."),
      ]),
      widget("doorGap"),
      list("acoustics", t("Schallschutz", "Protection contre le bruit", "Protezione dal rumore"), [
        i("p32.noise", "2.2.7.2–4", "Anforderungen L_H nach Tabelle 1 eingehalten (erhöhte Anforderungen innerhalb und zwischen Nutzungseinheiten).", "Exigences L_H selon tableau 1 respectées (exigences accrues dans et entre les unités).", "Esigenze L_H secondo tabella 1 rispettate (esigenze elevate all’interno e tra le unità)."),
        i("p32.crosstalk", "2.2.7.8", "Luftschallschutz zwischen Räumen durch die Lüftung nicht geschwächt (Telefonie-Schalldämpfer, Richtwert 40 dB).", "Isolation aux bruits aériens entre pièces non affaiblie par la ventilation (silencieux anti-téléphonie, valeur indicative 40 dB).", "Isolamento acustico tra locali non indebolito dalla ventilazione (silenziatori anti-telefonia, valore indicativo 40 dB)."),
        i("p32.facade", "2.2.7.7", "Schwächung der Aussenbauteile durch ALD bzw. Einzelraumgeräte im Schallschutznachweis berücksichtigt.", "Affaiblissement des éléments extérieurs par entrées d’air ou appareils individuels pris en compte dans le justificatif acoustique.", "Indebolimento degli elementi esterni dovuto a prese d’aria o apparecchi singoli considerato nella prova acustica."),
      ]),
      widget("acoustics"),
      list("terminals", t("Aussen- und Fortluft", "Air extérieur et air rejeté", "Aria esterna ed espulsa"), [
        i("p32.intakePos", "5.3.2.2–3", "Aussenluft-Durchlass ohne Störquellen (Fortluft, Parkplätze, Strassen), nicht direkt über Terrain oder im Lichtschacht.", "Prise d’air extérieur sans sources de nuisance (air rejeté, parkings, routes), pas juste au-dessus du terrain ni dans un saut-de-loup.", "Presa d’aria esterna senza fonti di disturbo (aria espulsa, parcheggi, strade), non direttamente sopra il terreno né in bocca di lupo."),
        i("p32.intakeHeight", "5.3.2.4–5", "Höhe Aussenluft-Durchlass: mind. 3.0 m (öffentlich zugänglich) bzw. 1.5 m (Mehrwohnungsanlage); Schneehöhe berücksichtigt.", "Hauteur de la prise d’air : au moins 3.0 m (accessible au public) ou 1.5 m (installation collective) ; hauteur de neige prise en compte.", "Altezza della presa d’aria: almeno 3.0 m (accessibile al pubblico) o 1.5 m (impianto plurifamiliare); altezza della neve considerata."),
        i("p32.grille", "5.3.2.6", "Schutzgitter 5–10 mm; Luftgeschwindigkeit höchstens 2 m/s (Nebelgebiete 1.5 m/s).", "Grille de protection 5–10 mm ; vitesse au plus 2 m/s (zones de brouillard 1.5 m/s).", "Griglia di protezione 5–10 mm; velocità al massimo 2 m/s (zone di nebbia 1.5 m/s)."),
        i("p32.exhaust", "5.3.2.8–9", "Fortluft ohne Geruchsbelästigung, vorzugsweise über Dach; Fassade nur ohne Küchenfortluft.", "Air rejeté sans nuisance olfactive, de préférence en toiture ; en façade seulement sans air de cuisine.", "Aria espulsa senza molestie olfattive, preferibilmente sul tetto; in facciata solo senza aria della cucina."),
        i("p32.distance", "5.3.2.10, Anhang E", "Abstand Aussenluft- zu Fortluft-Durchlass nach Anhang E eingehalten.", "Distance entre prise d’air et rejet selon l’annexe E respectée.", "Distanza tra presa d’aria ed espulsione secondo l’allegato E rispettata."),
        i("p32.dampers", "5.3.2.13", "Anlagen ohne Dauerbetrieb: dichtschliessende Aussen- und Fortluftklappen.", "Installations sans fonctionnement continu : clapets d’air extérieur et rejeté étanches.", "Impianti senza funzionamento continuo: serrande d’aria esterna ed espulsa ermetiche.", demand),
        i("p32.sharedDampers", "5.3.2.14", "Gemeinsame Aussen-/Fortluftleitungen: dichte Klappen (mind. Klasse 3 bzw. C) bei jedem Gerät.", "Conduits d’air extérieur/rejeté communs : clapets étanches (au moins classe 3 ou C) à chaque appareil.", "Condotte d’aria esterna/espulsa comuni: serrande ermetiche (almeno classe 3 o C) per ogni apparecchio.", multi),
      ]),
      widget("intake"),
      list("kitchen", t("Kochstellenlüftung", "Ventilation de la cuisson", "Ventilazione della zona cottura"), [
        i("p32.hoodWindow", "4.4.4.2", "Ohne Dunstabzugshaube: Küche durch Tür abtrennbar und Emissionen wirksam über Fenster abführbar.", "Sans hotte : cuisine séparable par une porte et émissions évacuées efficacement par la fenêtre.", "Senza cappa: cucina separabile con porta ed emissioni evacuate efficacemente dalla finestra.", (p) => p.kitchen === "window"),
        i("p32.hoodRecirc", "4.4.4.3", "Umluft-Dunstabzugshaube filtert wirksam; Wasserdampf wird über Abluft in der Küche abgeführt (sofern nicht im Durchströmbereich).", "Hotte à recyclage efficace ; vapeur évacuée par l’air repris de la cuisine (sauf zone de transfert).", "Cappa a ricircolo efficace; vapore evacuato tramite ripresa in cucina (salvo zona di transito).", (p) => p.kitchen === "recirculationHood"),
        i("p32.hoodMakeup", "4.4.4.4", "Fortluft-Haube: Ersatzluft ohne unzulässigen Unterdruck; Nachströmklappe schliesst automatisch; dichte Rückstauklappe in der Ebene der Gebäudehülle.", "Hotte à évacuation : air de compensation sans dépression inadmissible ; clapet se fermant automatiquement ; clapet antiretour étanche dans le plan de l’enveloppe.", "Cappa a espulsione: aria di compensazione senza depressione inammissibile; serranda a chiusura automatica; valvola antiritorno ermetica nel piano dell’involucro.", (p) => p.kitchen === "exhaustHood"),
        i("p32.hoodClass", "4.4.4.5.1", "Dunstabzugshaube an der Lüftungsanlage: Fettabscheidegrad mindestens Klasse B.", "Hotte raccordée à l’installation : efficacité de filtration des graisses au moins classe B.", "Cappa collegata all’impianto: efficienza di filtrazione dei grassi almeno classe B.", (p) => p.kitchen === "connectedHood"),
        i("p32.hoodReduction", "4.4.4.5.2–4", "Übrige Abluft während des Kochens um höchstens 70 % reduziert; kein unzulässiger Druck; Brandschutz VKF 25-15 Ziffer 4.2.2.", "Air repris des autres bouches réduit d’au plus 70 % pendant la cuisson ; pas de pression inadmissible ; protection incendie AEAI 25-15 ch. 4.2.2.", "Ripresa dalle altre bocchette ridotta al massimo del 70 % durante la cottura; nessuna pressione inammissibile; antincendio AICAA 25-15 cifra 4.2.2.", (p) => p.kitchen === "connectedHood"),
      ]),
      list("filters", t("Filterung", "Filtration", "Filtrazione"), [
        i("p32.filterSupply", "5.3.6.2", "Zuluft mindestens ISO ePM1 50 %; bei einer Filterstufe Filter vor der WRG.", "Air fourni au moins ISO ePM1 50 % ; avec un seul étage, filtre avant la récupération.", "Aria immessa almeno ISO ePM1 50 %; con un solo stadio, filtro prima del recupero."),
        i("p32.filterExtract", "5.3.6.5", "Abluft mindestens ISO coarse 80 % zum Schutz der WRG; rotierende WRG mindestens ISO ePM10 50 %.", "Air repris au moins ISO coarse 80 % pour protéger l’échangeur ; échangeur rotatif au moins ISO ePM10 50 %.", "Aria ripresa almeno ISO coarse 80 % a protezione dello scambiatore; rotativo almeno ISO ePM10 50 %."),
        i("p32.filterMonitor", "5.3.6.6", "Filterüberwachung: optische Kontrolle, Differenzdruck- oder Zeitintervall-Überwachung.", "Surveillance des filtres : contrôle visuel, surveillance par pression différentielle ou intervalle.", "Sorveglianza dei filtri: controllo visivo, pressione differenziale o intervallo di tempo."),
        i("p32.filterFog", "5.3.6.1.3", "Nebelgebiet: häufigere Kontrollen der Filter (Feuchte > 80 %) vorgesehen.", "Zone de brouillard : contrôles plus fréquents des filtres (humidité > 80 %) prévus.", "Zona di nebbia: controlli più frequenti dei filtri (umidità > 80 %) previsti.", (p) => p.fog),
      ]),
      list("extractSystem", t("Einfache Abluftanlage", "Installation d’extraction simple", "Impianto di semplice estrazione"), [
        i("p32.ald", "5.4.2.2.1", "Aussenbauteil-Luftdurchlässe auf 4 Pa (eingeschossig) bzw. 3 Pa oben / 6 Pa unten (zweigeschossig) inkl. Filter bemessen.", "Entrées d’air dimensionnées pour 4 Pa (un niveau) ou 3 Pa en haut / 6 Pa en bas (deux niveaux), filtre compris.", "Prese d’aria dimensionate per 4 Pa (un piano) o 3 Pa sopra / 6 Pa sotto (due piani), filtro compreso.", extract),
        i("p32.infiltration", "5.4.2.1", "Abluft-Volumenstrom = f × Summe ALD (f = 1.3 / 1.5 / 1.7 je nach Luftdichtheit).", "Débit d’air repris = f × somme des entrées d’air (f = 1.3 / 1.5 / 1.7 selon l’étanchéité).", "Portata ripresa = f × somma prese d’aria (f = 1.3 / 1.5 / 1.7 secondo l’ermeticità).", extract),
        i("p32.radonExtract", "5.4.2.2.3", "Keine Nachströmung aus dem Keller (Radon); Kellerdecke und Kellertüren geprüft.", "Pas de compensation depuis la cave (radon) ; dalle et portes de cave vérifiées.", "Nessuna compensazione dalla cantina (radon); soletta e porte della cantina verificate.", extract),
        i("p32.extractHeat", "EN-105 3", "Abluftanlagen über 1’000 m³/h und 500 h/a (alle Abluftanlagen des Gebäudes zusammen, ohne Hauben und kurzzeitige WC-Ventilatoren): Wärmerückgewinnung oder Abwärmenutzung, ausser bei wohnungs- bzw. raumweiser Bedarfssteuerung nach CO₂ oder Feuchte.", "Installations d’extraction de plus de 1’000 m³/h et 500 h/an (toutes ensemble, sans hottes ni ventilateurs de WC temporaires) : récupération ou utilisation des rejets thermiques, sauf commande selon les besoins (CO₂ ou humidité) par logement ou par pièce.", "Impianti di estrazione oltre 1’000 m³/h e 500 h/a (tutti insieme, senza cappe né ventilatori WC temporanei): recupero o utilizzo del calore residuo, salvo comando secondo il fabbisogno (CO₂ o umidità) per appartamento o locale.", extract),
        i("p32.storm", "5.4.2.2.4", "Starkwindgebiet bzw. Hochhaus: ALD mit Sturmsicherung.", "Zone de vents forts ou immeuble tour : entrées d’air avec protection contre la tempête.", "Zona di vento forte o grattacielo: prese d’aria con protezione antitempesta.", (p) => extract(p) && p.strongWind),
      ]),
      list("install", t("Installation, Bedienung, Brandschutz, Abschluss", "Installation, commande, protection incendie, clôture", "Installazione, comando, antincendio, chiusura"), [
        i("p32.access", "2.4.4.1", "Gerät und Leitungen zugänglich und reinigbar (Revisionsöffnungen); keine feuchten Stellen im Leitungssystem.", "Appareil et conduits accessibles et nettoyables (trappes) ; pas de points humides dans le réseau.", "Apparecchio e condotte accessibili e pulibili (aperture d’ispezione); nessun punto umido nella rete."),
        i("p32.flex", "2.4.4.3", "Flexible Leitungen auf das Minimum beschränkt (Längen nach VKF-BSR 25-15 Ziffer 3.7.2).", "Conduits flexibles limités au minimum (longueurs selon AEAI 25-15 ch. 3.7.2).", "Condotte flessibili limitate al minimo (lunghezze secondo AICAA 25-15 cifra 3.7.2)."),
        i("p32.insulation", "5.5.4, EN-105 4", "Wärmedämmung nach EN-105 Tabelle 1: AUL/FOL innerhalb der Hülle 100 mm (60 mm mit Erdreich-WT bzw. Vorwärmung), ZUL/ABL je nach Temperaturdifferenz; Reduktion für Kleinanlagen mit Leitungen unter 6 m nach Figur 1.", "Isolation selon EN-105 tableau 1 : AEX/AEJ dans l’enveloppe 100 mm (60 mm avec échangeur géothermique ou préchauffage), AIN/ARE selon la différence de température ; réduction pour petites installations avec conduits de moins de 6 m selon figure 1.", "Isolamento secondo EN-105 tabella 1: aria esterna/espulsa nell’involucro 100 mm (60 mm con scambiatore geotermico o preriscaldamento), immessa/ripresa secondo la differenza di temperatura; riduzione per piccoli impianti con condotte sotto 6 m secondo figura 1."),
        i("p32.velocity", "EN-105 5", "Luftgeschwindigkeiten eingehalten: im Strang mit dem grössten Druckverlust höchstens 3 m/s bis 1’000 m³/h (4 / 5 / 6 / 7 m/s bis 2’000 / 4’000 / 10’000 / über 10’000 m³/h), in Apparaten höchstens 2 m/s auf die Nettofläche.", "Vitesses respectées : dans le tronçon déterminant au plus 3 m/s jusqu’à 1’000 m³/h (4 / 5 / 6 / 7 m/s jusqu’à 2’000 / 4’000 / 10’000 / plus de 10’000 m³/h), dans les appareils au plus 2 m/s sur la surface nette.", "Velocità rispettate: nel tratto determinante al massimo 3 m/s fino a 1’000 m³/h (4 / 5 / 6 / 7 m/s fino a 2’000 / 4’000 / 10’000 / oltre 10’000 m³/h), negli apparecchi al massimo 2 m/s sulla superficie netta."),
        i("p32.individual", "EN-105 6", "Räume bzw. Raumgruppen mit wesentlich abweichender Nutzung oder Betriebszeit individuell betreibbar (nicht nötig bei Luftwechsel bis 2 h⁻¹).", "Pièces ou groupes de pièces à utilisation ou horaires très différents exploitables individuellement (pas nécessaire jusqu’à 2 h⁻¹).", "Locali o gruppi di locali con uso o orari molto diversi gestibili individualmente (non necessario fino a 2 h⁻¹)."),
        i("p32.tightness", "5.5.6.2", "Luftverteilung in Dichtheitsklasse C.", "Distribution d’air en classe d’étanchéité C.", "Distribuzione dell’aria in classe di tenuta C."),
        i("p32.controls", "5.3.7", "Bedienelemente offen und gut zugänglich in der Wohnung; Hauptschalter bzw. Netzstecker für Schadensfälle.", "Commandes visibles et accessibles dans le logement ; interrupteur principal ou fiche pour les sinistres.", "Comandi visibili e accessibili nell’appartamento; interruttore principale o spina per i sinistri."),
        i("p32.fire", "2.4.3", "Brandschutz nach VKF-BSR 25-15 (bei MFH Brandabschnittsplan beachten).", "Protection incendie selon AEAI 25-15 (compartiments coupe-feu dans les immeubles collectifs).", "Antincendio secondo AICAA 25-15 (compartimenti tagliafuoco negli edifici plurifamiliari)."),
        i("p32.space", "SIA 108 4.32", "Raumbedarf, Lage der Zentralen, Geräte und Hauptleitungstrassen definitiv festgelegt.", "Besoins en locaux, emplacement des centrales, appareils et tracés principaux définitivement fixés.", "Fabbisogno di spazio, ubicazione delle centrali, apparecchi e tracciati principali fissati definitivamente."),
        i("p32.schema", "SIA 108 4.32", "Übersichts- und Dispositionspläne, Prinzipschema, Anlage-, Funktions- und Regelbeschrieb, Messkonzept erstellt.", "Plans d’ensemble et de disposition, schéma de principe, descriptifs d’installation, de fonctionnement et de régulation, concept de mesure établis.", "Piani generali e di disposizione, schema di principio, descrizioni d’impianto, di funzionamento e di regolazione, concetto di misura allestiti."),
        i("p32.kv", "SIA 108 4.32", "Kostenvoranschlag ±10 % mit Beschreibung der Arbeiten und Lieferungen (Kostenplan).", "Devis ±10 % avec description des travaux et fournitures (plan des coûts).", "Preventivo ±10 % con descrizione dei lavori e delle forniture (piano dei costi)."),
        i("p32.approval", "SIA 108 4.32", "Bauprojekt, Kostenvoranschlag und Terminplan durch die Bauherrschaft genehmigt.", "Projet, devis et calendrier approuvés par le maître d’ouvrage.", "Progetto, preventivo e programma approvati dal committente."),
      ]),
    ],
  },
  {
    code: "33",
    sia108: "4.33",
    title: t("Bewilligungsverfahren", "Procédure d’autorisation", "Procedura di autorizzazione"),
    goal: t(
      "Projekt bewilligt, Kosten und Termine verifiziert, Baukredit genehmigt.",
      "Projet autorisé, coûts et délais vérifiés, crédit de construction approuvé.",
      "Progetto autorizzato, costi e scadenze verificati, credito di costruzione approvato.",
    ),
    sections: [
      list("permit", t("Baugesuch und Nachweise", "Demande de permis et justificatifs", "Domanda di costruzione e prove"), [
        i("p33.application", "SIA 108 4.33", "Unterlagen Lüftung für das Baugesuch bereitgestellt (Lüftungskonzept, Aussen- und Fortluftführung, Geräte).", "Documents de ventilation pour la demande de permis fournis (concept, air extérieur et rejeté, appareils).", "Documenti di ventilazione per la domanda di costruzione forniti (concetto, aria esterna ed espulsa, apparecchi)."),
        i("p33.energy", "3.3.5, EN-105, EN-110", "Energienachweis mit Formular EN-105 «Lüftungstechnische Anlagen» erstellt; bei Kühlung oder Befeuchtung zusätzlich EN-110 (kantonale Abweichungen beachten).", "Justificatif énergétique avec le formulaire EN-105 « Installations de ventilation » établi ; en cas de refroidissement ou d’humidification aussi EN-110 (exceptions cantonales).", "Prova energetica con il modulo EN-105 «Impianti di ventilazione» allestita; con raffrescamento o umidificazione anche EN-110 (eccezioni cantonali)."),
        i("p33.minergie", "SIA 108 4.33", "Minergie-Nachweis erstellt (besonders zu vereinbarende Leistung).", "Justificatif Minergie établi (prestation à convenir).", "Prova Minergie allestita (prestazione da convenire).", (p) => p.standard === "minergie"),
        i("p33.fire", "2.4.3", "Brandschutz nach VKF-BSR 25-15 nachgewiesen bzw. mit der Brandschutzbehörde abgestimmt.", "Protection incendie selon AEAI 25-15 justifiée ou coordonnée avec l’autorité.", "Antincendio secondo AICAA 25-15 comprovato o coordinato con l’autorità."),
        i("p33.noise", "2.2.7.7", "Schallschutznachweis SIA 181 (Aussenlärm inkl. ALD bzw. Einzelraumgeräte, gebäudetechnische Anlagen).", "Justificatif acoustique SIA 181 (bruit extérieur y c. entrées d’air ou appareils individuels, installations techniques).", "Prova acustica SIA 181 (rumore esterno incl. prese d’aria o apparecchi singoli, impianti tecnici)."),
        i("p33.subsidy", "SIA 108 4.33", "Subventions- bzw. Fördergesuche erarbeitet (besonders zu vereinbarende Leistung).", "Demandes de subventions élaborées (prestation à convenir).", "Domande di sussidi elaborate (prestazione da convenire)."),
        i("p33.conditions", "SIA 108 4.33", "Behördliche Auflagen ins Projekt eingearbeitet und Kosten angepasst.", "Conditions des autorités intégrées au projet et coûts adaptés.", "Condizioni delle autorità integrate nel progetto e costi adeguati."),
        i("p33.approved", "SIA 108 4.33", "Projekt bewilligt.", "Projet autorisé.", "Progetto autorizzato."),
      ]),
    ],
  },
  {
    code: "41",
    sia108: "4.41",
    title: t("Ausschreibung", "Appel d’offres", "Appalto"),
    goal: t(
      "Vergabereife erreicht: Leistungsverzeichnis, Offertvergleich, Vergabeantrag.",
      "Maturité d’adjudication atteinte : descriptif, comparaison des offres, proposition d’adjudication.",
      "Maturità di aggiudicazione raggiunta: elenco prestazioni, confronto offerte, proposta di aggiudicazione.",
    ),
    sections: [
      widget("lv"),
      list("tender", t("Ausschreibungsunterlagen", "Documents d’appel d’offres", "Documenti d’appalto"), [
        i("p41.strategy", "SIA 108 4.41", "Ausschreibungsstrategie mit Gesamtleitung abgestimmt; Unternehmerliste erstellt.", "Stratégie d’appel d’offres coordonnée avec la direction générale ; liste des entreprises établie.", "Strategia d’appalto coordinata con la direzione generale; elenco delle imprese allestito."),
        i("p41.structure", "SIA 108 4.41", "Unterlagen gegliedert gemäss Kostenvoranschlag; Ausschreibungspläne in geeigneten Massstäben.", "Documents structurés selon le devis ; plans d’appel d’offres à l’échelle appropriée.", "Documenti strutturati secondo il preventivo; piani d’appalto in scala adeguata."),
        i("p41.specs", "5.4, 5.5", "Leistungsdaten je Gerät ausgeschrieben: Volumenströme, externer Druck, SPI, Energieklasse, WRG, Schall, Vereisungsschutz.", "Données de performance par appareil : débits, pression externe, SPI, classe énergétique, récupération, acoustique, antigel.", "Dati di prestazione per apparecchio: portate, pressione esterna, SPI, classe energetica, recupero, acustica, antigelo."),
        i("p41.tested", "5.3.1", "Geprüfte Produkte nach SN EN 13141 gefordert; Kategorien nach SN EN 13142 deklariert.", "Produits testés selon SN EN 13141 exigés ; catégories selon SN EN 13142 déclarées.", "Prodotti testati secondo SN EN 13141 richiesti; categorie secondo SN EN 13142 dichiarate."),
        i("p41.filters", "5.3.6", "Filterklassen, Ersatzfilter und Filterüberwachung ausgeschrieben.", "Classes de filtres, filtres de rechange et surveillance décrits.", "Classi di filtri, filtri di ricambio e sorveglianza descritti."),
        i("p41.tightness", "5.5.6.2, 5.3.2.13", "Dichtheitsklasse C der Luftverteilung und Dichtheit der Klappen gefordert.", "Classe d’étanchéité C de la distribution et étanchéité des clapets exigées.", "Classe di tenuta C della distribuzione e tenuta delle serrande richieste."),
        i("p41.measure", "6", "Einregulierung, Funktionsmessungen, Abnahmeprotokoll, Hygiene-Erstinspektion (SWKI VA104-01), Instruktion und Dokumentation ausgeschrieben.", "Réglage, mesures, procès-verbal de réception, première inspection d’hygiène (SICC VA104-01), instruction et documentation décrits.", "Taratura, misure, verbale di collaudo, prima ispezione igienica (SITC VA104-01), istruzione e documentazione descritte."),
        i("p41.cleaning", "6.2.2", "Schutz offener Leitungen während der Bauzeit und Reinigung vor der Abnahme ausgeschrieben.", "Protection des conduits ouverts pendant les travaux et nettoyage avant réception décrits.", "Protezione delle condotte aperte durante i lavori e pulizia prima del collaudo descritte."),
        i("p41.maintenance", "7.2", "Wartungsangebot eingeholt (optional).", "Offre d’entretien demandée (facultatif).", "Offerta di manutenzione richiesta (facoltativo)."),
      ]),
      list("award", t("Offertvergleich und Vergabe", "Comparaison des offres et adjudication", "Confronto offerte e aggiudicazione"), [
        i("p41.compare", "SIA 108 4.41", "Angebote technisch, ökologisch und finanziell verglichen; Unternehmervarianten geprüft.", "Offres comparées techniquement, écologiquement et financièrement ; variantes d’entreprise vérifiées.", "Offerte confrontate tecnicamente, ecologicamente e finanziariamente; varianti delle imprese verificate."),
        i("p41.deviation", "SIA 108 4.41", "Kostenermittlung aufgrund der Angebote revidiert; Abweichungen zum Kostenvoranschlag begründet.", "Coûts révisés sur la base des offres ; écarts par rapport au devis justifiés.", "Costi rivisti sulla base delle offerte; scostamenti dal preventivo motivati."),
        i("p41.award", "SIA 108 4.41", "Vergabeantrag mit der Gesamtleitung formuliert.", "Proposition d’adjudication formulée avec la direction générale.", "Proposta di aggiudicazione formulata con la direzione generale."),
      ]),
    ],
  },
  {
    code: "51",
    sia108: "4.51",
    title: t("Ausführungsprojekt", "Projet d’exécution", "Progetto esecutivo"),
    goal: t(
      "Ausführungsreife erreicht: definitive Berechnungen, Ausführungspläne, Werkverträge.",
      "Maturité d’exécution atteinte : calculs définitifs, plans d’exécution, contrats d’entreprise.",
      "Maturità esecutiva raggiunta: calcoli definitivi, piani esecutivi, contratti d’appalto.",
    ),
    sections: [
      widget("targets"),
      list("execution", t("Ausführungsunterlagen", "Documents d’exécution", "Documenti esecutivi"), [
        i("p51.final", "SIA 108 4.51", "Definitive Berechnungen mit den vergebenen Produkten (Volumenströme, Druckverlust, Schall).", "Calculs définitifs avec les produits adjugés (débits, pertes de charge, acoustique).", "Calcoli definitivi con i prodotti aggiudicati (portate, perdite di carico, acustica)."),
        i("p51.pressure", "SIA 108 4.51", "Druckverlustberechnung mit den definitiven Leitungsführungen und den Datenblättern der vergebenen Produkte nachgeführt.", "Calcul des pertes de charge mis à jour avec les tracés définitifs et les fiches techniques des produits adjugés.", "Calcolo delle perdite di carico aggiornato con i tracciati definitivi e le schede tecniche dei prodotti aggiudicati."),
        i("p51.openings", "SIA 108 4.51", "Aussparungen und Durchbrüche angegeben.", "Réservations et percements indiqués.", "Riservazioni e aperture indicate."),
        i("p51.plans", "SIA 108 4.51", "Ausführungspläne, Prinzipschemata und Stromlaufangaben (Koordination Elektro) erstellt.", "Plans d’exécution, schémas de principe et indications électriques (coordination) établis.", "Piani esecutivi, schemi di principio e indicazioni elettriche (coordinamento) allestiti."),
        i("p51.coordination", "SIA 108 4.51", "Koordination mit den übrigen Installationen (Kollisionen) erfolgt.", "Coordination avec les autres installations (collisions) effectuée.", "Coordinamento con le altre installazioni (collisioni) effettuato."),
        i("p51.shop", "SIA 108 4.51", "Werkstatt- und Montagepläne der Unternehmer geprüft.", "Plans d’atelier et de montage des entreprises vérifiés.", "Piani d’officina e di montaggio delle imprese verificati."),
        i("p51.measurepoints", "6.2.3", "Messstellen und Einregulierorgane für die Volumenströme vorgesehen.", "Points de mesure et organes de réglage des débits prévus.", "Punti di misura e organi di taratura delle portate previsti."),
        i("p51.condensate", "5.4.4.3", "Kondensatableitung von Gerät bzw. Einzelraumgeräten fachgerecht geplant (SN 592000).", "Évacuation des condensats de l’appareil ou des appareils individuels planifiée (SN 592000).", "Scarico della condensa dell’apparecchio o degli apparecchi singoli pianificato (SN 592000)."),
        i("p51.accessibility", "2.4.4.1", "Revisions- und Reinigungsöffnungen in den Plänen eingetragen.", "Trappes de visite et de nettoyage reportées sur les plans.", "Aperture d’ispezione e di pulizia riportate sui piani."),
        i("p51.contracts", "SIA 108 4.51", "Werkverträge mit Unternehmern und Lieferanten aufgestellt.", "Contrats d’entreprise et de fourniture établis.", "Contratti con imprese e fornitori allestiti."),
        i("p51.release", "SIA 108 4.51", "Ausführungsunterlagen und Terminplan genehmigt; Freigabe zur Ausführung.", "Documents d’exécution et calendrier approuvés ; libération pour l’exécution.", "Documenti esecutivi e programma approvati; via libera all’esecuzione."),
      ]),
    ],
  },
  {
    code: "52",
    sia108: "4.52",
    title: t("Ausführung", "Exécution", "Esecuzione"),
    goal: t(
      "Bauwerk gemäss Pflichtenheft und Vertrag erstellt (Fachbauleitung).",
      "Ouvrage réalisé selon le cahier des charges et le contrat (direction des travaux spécialisée).",
      "Opera realizzata secondo capitolato e contratto (direzione lavori specialistica).",
    ),
    sections: [
      list("site", t("Fachbauleitung", "Direction des travaux spécialisée", "Direzione lavori specialistica"), [
        i("p52.quality", "SIA 108 4.52", "Qualität der Ausführung und der Lieferungen überwacht.", "Qualité de l’exécution et des fournitures surveillée.", "Qualità dell’esecuzione e delle forniture sorvegliata."),
        i("p52.embedded", "SIA 108 4.52", "Einlagen im Beton (Rohre, Kanäle) vor dem Betonieren kontrolliert.", "Éléments noyés dans le béton (tubes, gaines) contrôlés avant bétonnage.", "Elementi annegati nel calcestruzzo (tubi, canali) controllati prima del getto."),
        i("p52.clean", "2.4.4.2", "Leitungen während der Bauzeit verschlossen und sauber (Hygiene SWKI VA104-01).", "Conduits fermés et propres pendant les travaux (hygiène SICC VA104-01).", "Condotte chiuse e pulite durante i lavori (igiene SITC VA104-01)."),
        i("p52.flex", "2.4.4.3", "Flexible Leitungen und Schalldämpfer wie geplant, ohne Quetschungen.", "Conduits flexibles et silencieux selon plan, sans écrasement.", "Condotte flessibili e silenziatori secondo piano, senza schiacciamenti."),
        i("p52.insulation", "5.5.4", "Dämmung der Aussen- und Fortluftleitungen dampfdicht ausgeführt.", "Isolation des conduits d’air extérieur et rejeté étanche à la vapeur.", "Isolamento delle condotte d’aria esterna ed espulsa a tenuta di vapore."),
        i("p52.terminals", "5.3.2", "Aussen- und Fortluft-Durchlässe (Lage, Höhe, Gitter, Abstand) wie geplant.", "Prises d’air et rejets (position, hauteur, grille, distance) selon plan.", "Prese e espulsioni (posizione, altezza, griglia, distanza) secondo piano."),
        i("p52.gaps", "5.3.5.2", "Türspalten und Überström-Luftdurchlässe wie geplant (Bodenbelag beachten).", "Fentes de porte et bouches de transfert selon plan (revêtement de sol).", "Fessure delle porte e bocchette di transito secondo piano (pavimento)."),
        i("p52.fire", "2.4.3", "Brandschutzmassnahmen (Abschottungen, Klappen) ausgeführt.", "Mesures de protection incendie (obturations, clapets) exécutées.", "Misure antincendio (chiusure, serrande) eseguite."),
        i("p52.partial", "SIA 108 4.52", "Teilabnahmen geplant, durchgeführt und protokolliert.", "Réceptions partielles planifiées, effectuées et protocolées.", "Collaudi parziali pianificati, eseguiti e verbalizzati."),
        i("p52.changes", "SIA 108 4.52", "Regiearbeiten und Nachträge geprüft; Änderungen in die Ausführungsunterlagen aufgenommen.", "Travaux en régie et avenants vérifiés ; modifications reportées dans les documents.", "Lavori a regia e supplementi verificati; modifiche riportate nei documenti."),
        i("p52.cost", "SIA 108 4.52", "Kostenkontrolle geführt, Rechnungen geprüft.", "Contrôle des coûts tenu, factures vérifiées.", "Controllo dei costi tenuto, fatture verificate."),
        i("p52.meetings", "SIA 108 4.52", "Bausitzungen protokolliert, Baujournal geführt.", "Séances de chantier protocolées, journal de chantier tenu.", "Riunioni di cantiere verbalizzate, giornale dei lavori tenuto."),
        i("p52.warranty", "SIA 108 4.52", "Liste der Garantieverfalldaten erstellt.", "Liste des échéances de garantie établie.", "Elenco delle scadenze di garanzia allestito."),
      ]),
    ],
  },
  {
    code: "53",
    sia108: "4.53",
    title: t("Inbetriebnahme, Abschluss", "Mise en service, clôture", "Messa in servizio, chiusura"),
    goal: t(
      "Anlage übernommen und in Betrieb genommen, Schlussabrechnung abgenommen, Mängel behoben.",
      "Installation réceptionnée et mise en service, décompte final accepté, défauts éliminés.",
      "Impianto collaudato e messo in servizio, conteggio finale accettato, difetti eliminati.",
    ),
    sections: [
      widget("commissioning"),
      list("acceptance", t("Abnahme (SIA 382/1 Anhang F)", "Réception (SIA 382/1 annexe F)", "Collaudo (SIA 382/1 allegato F)"), [
        i("p53.clean", "6.2.2", "Anlage sauber und betriebsbereit (gegebenenfalls gereinigt).", "Installation propre et prête à fonctionner (nettoyée si nécessaire).", "Impianto pulito e pronto all’esercizio (pulito se necessario)."),
        i("p53.complete", "6.2.1", "Vollständigkeitsprüfung durchgeführt.", "Contrôle d’exhaustivité effectué.", "Verifica di completezza eseguita."),
        i("p53.function", "6.2.1", "Funktionsprüfungen: Betriebsstufen, Bypass, Vereisungsschutz, Filterüberwachung, Brandfallsteuerung.", "Contrôles de fonctionnement : niveaux, bypass, antigel, surveillance des filtres, commande incendie.", "Controlli di funzionamento: livelli, bypass, antigelo, sorveglianza filtri, comando incendio."),
        i("p53.measure", "6.2.3–5, 6.3.2", "Funktionsmessungen: Zu- und Abluft je Raum; Differenz Total Zu-/Abluft höchstens 10 %.", "Mesures : air fourni et repris par pièce ; écart total au plus 10 %.", "Misure: immissione e ripresa per locale; differenza totale al massimo 10 %."),
        i("p53.pressure", "6.3.3", "Druckdifferenz innen–aussen je Wohneinheit gemessen.", "Différence de pression intérieur–extérieur mesurée par logement.", "Differenza di pressione interno–esterno misurata per unità.", (p) => extract(p) || p.kitchen === "exhaustHood"),
        i("p53.acoustic", "6.2.5, 2.2.7", "Akustische Situation bewertet (Anforderungen in allen Räumen eingehalten).", "Situation acoustique évaluée (exigences respectées dans toutes les pièces).", "Situazione acustica valutata (esigenze rispettate in tutti i locali)."),
        i("p53.power", "6.2.8", "Elektrische Leistung bei Normallüftung gemessen, plausibilisiert und protokolliert.", "Puissance électrique en ventilation normale mesurée, vérifiée et protocolée.", "Potenza elettrica in ventilazione normale misurata, verificata e verbalizzata."),
        i("p53.hygiene", "6.2.1", "Hygiene-Erstinspektion nach SWKI VA104-01.", "Première inspection d’hygiène selon SICC VA104-01.", "Prima ispezione igienica secondo SITC VA104-01."),
        i("p53.protocol", "6.2.6–7", "Abnahmeprotokoll mit Soll-/Ist-Werten (Leistungsgarantie Komfortlüftung bzw. SWKI 96-5).", "Procès-verbal de réception avec valeurs de consigne/mesurées (garantie de performance, SICC 96-5).", "Verbale di collaudo con valori nominali/misurati (garanzia di prestazione, SITC 96-5)."),
        i("p53.defects", "SIA 108 4.53", "Mängel festgestellt, Fristen gesetzt und Behebung kontrolliert.", "Défauts constatés, délais fixés et élimination contrôlée.", "Difetti constatati, termini fissati ed eliminazione controllata."),
      ]),
      list("instruction", t("Instruktion der Bewohner (6.4.2)", "Instruction des habitants (6.4.2)", "Istruzione degli abitanti (6.4.2)"), [
        i("p53.i.stages", "6.4.2", "Betriebsstufen: Zweck und Bedienung.", "Niveaux de fonctionnement : but et commande.", "Livelli di funzionamento: scopo e comando."),
        i("p53.i.window", "6.4.2", "Zusätzliche Fensteröffnung im Winter, Schlafen bei offenem Fenster.", "Ouverture supplémentaire des fenêtres en hiver, dormir fenêtre ouverte.", "Apertura supplementare delle finestre in inverno, dormire con finestra aperta."),
        i("p53.i.dry", "6.4.2", "Trockenheit im Winter: Luftwechsel reduzieren, Raumtemperatur, Verhalten bei Abwesenheit.", "Sécheresse en hiver : réduire le renouvellement, température, comportement en cas d’absence.", "Secchezza in inverno: ridurre il ricambio, temperatura, comportamento in caso di assenza."),
        i("p53.i.limits", "6.4.2", "Grenzen der Anlage: Aussengerüche, Rauchen, Räucherstäbchen, «Party-Lüftung».", "Limites de l’installation : odeurs extérieures, fumée, encens, « ventilation party ».", "Limiti dell’impianto: odori esterni, fumo, incenso, «ventilazione party»."),
        i("p53.i.summer", "6.4.2", "Sommerbetrieb: Ausschalten, Sommer-Bypass, Nachtauskühlung über Fenster, Beschattung.", "Été : arrêt, bypass estival, refroidissement nocturne par fenêtres, ombrage.", "Estate: spegnimento, bypass estivo, raffreddamento notturno dalle finestre, ombreggiamento."),
        i("p53.i.gaps", "6.4.2", "Türspalten als Überströmung freihalten (keine Teppiche).", "Laisser libres les fentes de porte servant au transfert (pas de tapis).", "Lasciare libere le fessure delle porte (niente tappeti)."),
        i("p53.i.filters", "6.4.2", "Funktion der Filter und regelmässiger Austausch.", "Fonction des filtres et remplacement régulier.", "Funzione dei filtri e sostituzione regolare."),
        i("p53.i.maintenance", "6.4.2", "Zuständigkeiten der Instandhaltung und Instandhaltungsjournal.", "Responsabilités d’entretien et journal d’entretien.", "Responsabilità di manutenzione e giornale di manutenzione."),
        i("p53.i.faults", "6.4.2", "Verhalten bei Störungen und Störfällen (z. B. Chemieunfall).", "Comportement en cas de pannes et d’incidents (p. ex. accident chimique).", "Comportamento in caso di guasti e incidenti (p. es. incidente chimico)."),
        i("p53.i.kitchen", "6.4.2", "Küchenabluft: Betrieb, Nachströmeinrichtungen, Gefährdung bei Feuerstätten, Filterwartung.", "Air de cuisine : fonctionnement, dispositifs de compensation, danger avec foyers, entretien des filtres.", "Aria della cucina: funzionamento, dispositivi di compensazione, pericolo con focolari, manutenzione filtri."),
        i("p53.i.written", "6.4.2", "Einfache schriftliche Anleitung abgegeben.", "Mode d’emploi écrit simple remis.", "Istruzioni scritte semplici consegnate."),
      ]),
      list("handover", t("Dokumentation und Abschluss", "Documentation et clôture", "Documentazione e chiusura"), [
        i("p53.docs", "SIA 108 4.53", "Betriebsanleitungen, revidierte Pläne und Einregulierprotokolle geprüft und übergeben.", "Instructions d’exploitation, plans révisés et protocoles de réglage vérifiés et remis.", "Istruzioni d’esercizio, piani aggiornati e protocolli di taratura verificati e consegnati."),
        i("p53.responsibility", "7.2.3", "Zuständigkeiten für Wartung und Filterwechsel festgelegt (Eigentümer, Hausdienst, Wartungsfirma).", "Responsabilités d’entretien et de changement des filtres fixées (propriétaire, conciergerie, entreprise).", "Responsabilità di manutenzione e cambio filtri fissate (proprietario, custode, ditta)."),
        i("p53.maintenancePlan", "SIA 108 4.53", "Instandhaltungsplan erstellt, Wartungsverträge eingeholt (besonders zu vereinbarende Leistung).", "Plan d’entretien établi, contrats d’entretien obtenus (prestation à convenir).", "Piano di manutenzione allestito, contratti di manutenzione ottenuti (prestazione da convenire)."),
        i("p53.final", "SIA 108 4.53", "Schlussabrechnung geprüft und dem Kostenvoranschlag gegenübergestellt.", "Décompte final vérifié et comparé au devis.", "Conteggio finale verificato e confrontato con il preventivo."),
      ]),
    ],
  },
  {
    code: "61",
    sia108: "4.61",
    title: t("Betrieb", "Exploitation", "Esercizio"),
    goal: t(
      "Betrieb sichergestellt und optimiert: Wartung, Filterwechsel, Hygiene, Energie.",
      "Exploitation assurée et optimisée : entretien, filtres, hygiène, énergie.",
      "Esercizio garantito e ottimizzato: manutenzione, filtri, igiene, energia.",
    ),
    sections: [
      widget("operation"),
      list("operation", t("Betrieb und Instandhaltung (Kapitel 7)", "Exploitation et maintenance (chapitre 7)", "Esercizio e manutenzione (capitolo 7)"), [
        i("p61.newbuilding", "5.2.3.2", "Neubau: in den ersten drei Monaten erhöhter Luftwechsel (mind. 0.3 h⁻¹).", "Construction neuve : renouvellement accru pendant les trois premiers mois (au moins 0.3 h⁻¹).", "Nuova costruzione: ricambio aumentato nei primi tre mesi (almeno 0.3 h⁻¹).", (p) => p.construction === "new"),
        i("p61.filters", "5.3.6.6", "Filterwechsel: 1. Stufe höchstens 1 Jahr, 2. Stufe höchstens 2 Jahre; Filter nicht waschen.", "Changement des filtres : 1er étage au plus 1 an, 2e étage au plus 2 ans ; ne pas laver.", "Cambio filtri: 1° stadio al massimo 1 anno, 2° stadio al massimo 2 anni; non lavare."),
        i("p61.maintenance", "7.2.2", "Wartung und Inspektion nach SWKI BT104-01/-02 und SN EN 16798-17.", "Entretien et inspection selon SICC BT104-01/-02 et SN EN 16798-17.", "Manutenzione e ispezione secondo SITC BT104-01/-02 e SN EN 16798-17."),
        i("p61.hygiene", "7.2.2", "Periodische Hygieneinspektionen nach SWKI VA104-01.", "Inspections d’hygiène périodiques selon SICC VA104-01.", "Ispezioni igieniche periodiche secondo SITC VA104-01."),
        i("p61.laymen", "7.2.5", "Laien durch Fachperson mit Hygieneschulung Kategorie B instruiert.", "Personnes non spécialisées instruites par un spécialiste formé en hygiène catégorie B.", "Non specialisti istruiti da uno specialista con formazione igienica categoria B."),
        i("p61.journal", "7.1.7", "Instandhaltungsarbeiten dokumentiert (Instandhaltungsjournal).", "Travaux d’entretien documentés (journal d’entretien).", "Lavori di manutenzione documentati (giornale di manutenzione)."),
        i("p61.contract", "SIA 108 4.61", "Wartungs- und Serviceverträge betreut.", "Contrats d’entretien et de service suivis.", "Contratti di manutenzione e servizio seguiti."),
        i("p61.optimize", "5.3.8.1", "Betrieb optimiert (Betriebsstufen, Zeitprogramm, Winterfeuchte, Energieverbrauch).", "Exploitation optimisée (niveaux, programme horaire, humidité hivernale, consommation).", "Esercizio ottimizzato (livelli, programma orario, umidità invernale, consumo)."),
        i("p61.vacancy", "4.2.7", "Leerstand oder Ferien im Winter: Volumenstrom reduziert.", "Vacance ou vacances en hiver : débit réduit.", "Sfitto o vacanze in inverno: portata ridotta."),
      ]),
    ],
  },
];

export const findPhase = (code: string) => phases.find((p) => p.code === code) ?? null;

export { isHandled, phaseItems, phaseProgress } from "@/lib/planning";
