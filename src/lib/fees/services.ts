import type { L10n } from "@/lib/planning";

import { type FeePhase, type FeeTrade, installTrades } from "./sia108";

// Services of the fee offer per SIA 108 phase, from the LUPI Offerte_Anhang template (vorlagen/) and SIA 108:2014
// Art. 4.53 (phase 53 is missing in the template). `state` is the default: "in" = Grundleistung included,
// "out" = listed as not included (besonders zu vereinbarende Leistung, offered on a time basis).
// `trades` limits an item to some trades; without it an item belongs to the installation trades (HLKSE). The
// Gebäudeautomation (Art. 8) and Fachkoordination (Art. 9.3/9.4) have their own items. `unlessOffered`: default
// "no" when that trade is part of the offer (e.g. «Fachkoordination nicht inbegriffen» next to an offered FK).

export type ServiceState = "in" | "out" | "no";

export type FeeService = { id: string; phase: FeePhase; state: Exclude<ServiceState, "no">; text: L10n; trades?: FeeTrade[]; unlessOffered?: FeeTrade };

const hvac: FeeTrade[] = ["heating", "cooling", "ventilation"];
const ga: FeeTrade[] = ["automation"];
const fk: FeeTrade[] = ["coordination"];

const item = (id: string, phase: FeePhase, state: "in" | "out", de: string, fr: string, it: string, trades?: FeeTrade[]): FeeService => ({
  id,
  phase,
  state,
  text: { de, fr, it },
  trades,
});

export const feeServices: FeeService[] = [
  // 31 Vorprojekt
  item("31-project", "31", "in", "Erarbeiten eines Vorprojekts einschliesslich Pläne im Strichkonzept und notwendiger Prinzipschemata", "Élaboration d’un avant-projet, y compris plans de principe et schémas de principe nécessaires", "Elaborazione di un progetto di massima, compresi piani di principio e schemi di principio necessari"),
  item("31-coordination", "31", "in", "Mitwirken bei der Grobkoordination", "Participation à la coordination générale", "Partecipazione al coordinamento generale"),
  item("31-concepts", "31", "in", "Abstimmen der Konzepte", "Harmonisation des concepts", "Armonizzazione dei concetti"),
  item("31-description", "31", "in", "Erstellen eines generellen Anlage- bzw. Installationsbeschriebs", "Établissement d’un descriptif général des installations", "Allestimento di una descrizione generale degli impianti"),
  item("31-permits", "31", "in", "Abklären der Bewilligungstauglichkeit sowie von Werkleitungen und Gebühren", "Clarification de l’aptitude à l’autorisation, des conduites industrielles et des taxes", "Chiarimento dell’idoneità all’autorizzazione, delle condotte industriali e delle tasse"),
  item("31-rough-cost", "31", "in", "Erstellen der Kostengrobschätzung der Lösungsmöglichkeiten im Fachbereich (Detaillierungsgrad der Vorstudien)", "Estimation sommaire des coûts des variantes de solution dans le domaine spécialisé (niveau des études préliminaires)", "Stima sommaria dei costi delle soluzioni nel settore specialistico (livello degli studi preliminari)"),
  item("31-cost-estimate", "31", "in", "Erstellen der Kostenschätzung im Fachbereich unter Berücksichtigung von Kostenkennwerten (Genauigkeit ± 15 %)", "Estimation des coûts dans le domaine spécialisé sur la base de valeurs de référence (précision ± 15 %)", "Stima dei costi nel settore specialistico in base a valori di riferimento (precisione ± 15 %)"),
  item("31-operating-cost", "31", "in", "Ermitteln der voraussichtlichen Betriebs- und Instandhaltungskosten", "Détermination des coûts prévisibles d’exploitation et d’entretien", "Determinazione dei costi presumibili di esercizio e manutenzione"),
  item("31-schedule", "31", "in", "Mitwirken beim Aufstellen des generellen Terminplans", "Participation à l’établissement du calendrier général", "Partecipazione all’allestimento del programma generale"),
  item("31-simulation", "31", "out", "Thermische, raumluftdynamische und Tageslichtsimulationen", "Simulations thermiques, aérauliques et de lumière du jour", "Simulazioni termiche, aerauliche e della luce diurna"),
  item("31-variants", "31", "out", "Erarbeiten und Bewerten von Varianten zum Vorprojekt", "Élaboration et évaluation de variantes de l’avant-projet", "Elaborazione e valutazione di varianti del progetto di massima"),
  { ...item("31-fk", "31", "out", "Fachkoordination gemäss Art. 9", "Coordination spécialisée selon art. 9", "Coordinamento specialistico secondo art. 9"), unlessOffered: "coordination" },
  item("31-utilities", "31", "out", "Planung der Ver- und Entsorgungsleitungen", "Planification des conduites d’approvisionnement et d’évacuation", "Pianificazione delle condotte di approvvigionamento e smaltimento"),
  item("31-safety", "31", "out", "Erstellen eines umfassenden Sicherheitskonzeptes (bauliche, betriebliche und technische Massnahmen)", "Établissement d’un concept de sécurité global (mesures constructives, d’exploitation et techniques)", "Allestimento di un concetto di sicurezza completo (misure edili, d’esercizio e tecniche)"),
  item("31-variant-costs", "31", "out", "Vergleich von Kostenschätzungen von Varianten", "Comparaison des estimations de coûts de variantes", "Confronto delle stime dei costi di varianti"),
  item("31-economy", "31", "out", "Ermitteln der Wirtschaftlichkeit", "Détermination de la rentabilité", "Determinazione della redditività"),
  item("31-lcc", "31", "out", "Ermitteln der Lebenszykluskosten", "Détermination des coûts du cycle de vie", "Determinazione dei costi del ciclo di vita"),

  // 32 Bauprojekt
  item("32-data", "32", "in", "Ermitteln der technischen Daten, des Energie- und Leistungsbedarfs", "Détermination des données techniques, des besoins en énergie et en puissance", "Determinazione dei dati tecnici, del fabbisogno di energia e di potenza"),
  item("32-optimise", "32", "in", "Optimieren des Anlage- und Gebäudetechnikprojektes und Koordinieren mit dem Betriebskonzept", "Optimisation du projet des installations et coordination avec le concept d’exploitation", "Ottimizzazione del progetto degli impianti e coordinamento con il concetto d’esercizio"),
  item("32-metering", "32", "in", "Bereinigen des Messkonzepts", "Mise au point du concept de mesure", "Messa a punto del concetto di misura"),
  item("32-labelling", "32", "in", "Festlegen des Anlage-Kennzeichnungssystems", "Définition du système de repérage des installations", "Definizione del sistema di identificazione degli impianti"),
  item("32-space", "32", "in", "Definitives Festlegen des Raum- und Platzbedarfs sowie der Lage von Zentralen, Apparaten und Hauptleitungstrassen", "Définition définitive des besoins en locaux et en place ainsi que de l’emplacement des centrales, appareils et tracés principaux", "Definizione definitiva del fabbisogno di locali e spazio e della posizione di centrali, apparecchi e tracciati principali"),
  item("32-plans", "32", "in", "Ausarbeiten des Projekts mit Übersichts- und Dispositionsplänen sowie Prinzipschemata", "Élaboration du projet avec plans d’ensemble et de disposition ainsi que schémas de principe", "Elaborazione del progetto con piani d’insieme e di disposizione e schemi di principio"),
  item("32-energy", "32", "in", "Überprüfen der baulichen Massnahmen in Bezug auf rationellen Energieeinsatz", "Vérification des mesures constructives quant à l’utilisation rationnelle de l’énergie", "Verifica delle misure edili riguardo all’uso razionale dell’energia"),
  item("32-coordination", "32", "in", "Mitwirken bei der Koordination der Anlagen und Installationen", "Participation à la coordination des installations", "Partecipazione al coordinamento degli impianti"),
  item("32-description", "32", "in", "Erstellen des Anlage- und Funktionsbeschriebs", "Établissement du descriptif des installations et de leur fonctionnement", "Allestimento della descrizione degli impianti e del loro funzionamento"),
  { ...item("32-control", "32", "in", "Erstellen des Regelbeschriebs, sofern kein Gebäudeautomationsplaner beauftragt ist", "Établissement du descriptif de régulation, si aucun spécialiste en automatisation n’est mandaté", "Allestimento della descrizione della regolazione, se non è incaricato un progettista dell’automazione", hvac), unlessOffered: "automation" },
  item("32-kv", "32", "in", "Erstellen des Kostenvoranschlags mit Ausmass und geschätzten Preisen (Genauigkeit ± 10 %)", "Établissement du devis avec métrés et prix estimés (précision ± 10 %)", "Allestimento del preventivo con quantità e prezzi stimati (precisione ± 10 %)"),
  item("32-operating-cost", "32", "in", "Ermitteln der voraussichtlichen Betriebs- und Instandhaltungskosten (fachspezifisch)", "Détermination des coûts prévisibles d’exploitation et d’entretien (spécifiques)", "Determinazione dei costi presumibili di esercizio e manutenzione (specifici)"),
  item("32-suppliers", "32", "in", "Rücksprache mit Unternehmern und Lieferanten", "Consultation des entrepreneurs et fournisseurs", "Consultazione di imprenditori e fornitori"),
  item("32-schedule", "32", "in", "Mitwirken beim Nachführen des generellen Terminplans", "Participation à la mise à jour du calendrier général", "Partecipazione all’aggiornamento del programma generale"),
  item("32-variants", "32", "out", "Erarbeiten und Bewerten von Varianten zum Bauprojekt", "Élaboration et évaluation de variantes du projet de l’ouvrage", "Elaborazione e valutazione di varianti del progetto definitivo"),
  { ...item("32-fk", "32", "out", "Fachkoordination gemäss Art. 9", "Coordination spécialisée selon art. 9", "Coordinamento specialistico secondo art. 9"), unlessOffered: "coordination" },
  item("32-utilities", "32", "out", "Planen der Ver- und Entsorgungsleitungen", "Planification des conduites d’approvisionnement et d’évacuation", "Pianificazione delle condotte di approvvigionamento e smaltimento"),
  item("32-economy", "32", "out", "Wirtschaftlichkeitsberechnungen (fachspezifisch)", "Calculs de rentabilité (spécifiques)", "Calcoli di redditività (specifici)"),
  item("32-cost-cut", "32", "out", "Projektänderungen zur Kostenreduktion auf Vorgabe des Auftraggebers und Anpassen des Kostenvoranschlags", "Modifications du projet pour réduire les coûts à la demande du mandant et adaptation du devis", "Modifiche del progetto per ridurre i costi su richiesta del committente e adeguamento del preventivo"),
  item("32-lcc", "32", "out", "Ermitteln der Lebenszykluskosten", "Détermination des coûts du cycle de vie", "Determinazione dei costi del ciclo di vita"),

  // 33 Bewilligungsverfahren
  item("33-permit", "33", "in", "Begleiten des Baubewilligungsverfahrens einschliesslich Bereitstellen der Unterlagen", "Accompagnement de la procédure d’autorisation de construire, y compris mise à disposition des documents", "Accompagnamento della procedura di autorizzazione edilizia, compresa la messa a disposizione dei documenti"),
  item("33-costs", "33", "in", "Anpassen der Kosten als Folge behördlicher Auflagen", "Adaptation des coûts suite aux exigences des autorités", "Adeguamento dei costi a seguito di condizioni delle autorità"),
  item("33-objections", "33", "out", "Mitwirken bei der Behandlung von Einsprachen", "Participation au traitement des oppositions", "Partecipazione alla trattazione delle opposizioni"),
  item("33-negotiation", "33", "out", "Verhandlungen mit den Bewilligungsinstanzen", "Négociations avec les autorités compétentes", "Trattative con le autorità competenti"),
  item("33-certification", "33", "out", "Nachweise für eine Zertifizierung (Minergie usw.)", "Justificatifs pour une certification (Minergie, etc.)", "Attestazioni per una certificazione (Minergie ecc.)"),
  item("33-thermal", "33", "out", "Wärmeschutznachweis", "Justificatif thermique", "Attestazione di isolamento termico", ["heating"]),
  item("33-changes", "33", "out", "Projektänderungen als Folge behördlicher Auflagen", "Modifications du projet suite aux exigences des autorités", "Modifiche del progetto a seguito di condizioni delle autorità"),
  item("33-special-docs", "33", "out", "Aussergewöhnliche Bewilligungsunterlagen (Umweltverträglichkeitsbericht usw.)", "Documents d’autorisation particuliers (rapport d’impact sur l’environnement, etc.)", "Documenti d’autorizzazione particolari (rapporto d’impatto ambientale ecc.)"),
  item("33-sewer", "33", "out", "Kanalisationseingabe", "Demande de raccordement aux canalisations", "Domanda di allacciamento alla canalizzazione", ["sanitary"]),
  item("33-kv-update", "33", "out", "Anpassen des Kostenvoranschlags infolge von Projektänderungen", "Adaptation du devis suite à des modifications du projet", "Adeguamento del preventivo a seguito di modifiche del progetto"),

  // 41 Ausschreibung
  item("41-samples", "41", "in", "Durchführen von Bemusterungen", "Organisation des choix d’échantillons", "Esecuzione delle campionature"),
  item("41-plans", "41", "in", "Ausarbeiten der Ausschreibungspläne in geeigneten Massstäben", "Élaboration des plans d’appel d’offres aux échelles appropriées", "Elaborazione dei piani d’appalto in scale adeguate"),
  item("41-documents", "41", "in", "Erstellen der Ausschreibungsunterlagen, Gliederung gemäss Kostenvoranschlag", "Établissement des documents d’appel d’offres, structurés selon le devis", "Allestimento dei documenti d’appalto, suddivisi secondo il preventivo"),
  item("41-invite", "41", "in", "Einladen der mit dem Auftraggeber festgelegten Unternehmer und Lieferanten zur Offertstellung", "Invitation à soumissionner des entrepreneurs et fournisseurs choisis avec le mandant", "Invito a presentare offerte delle imprese e dei fornitori stabiliti con il committente"),
  item("41-inform", "41", "in", "Orientieren der Unternehmer und Lieferanten", "Information des entrepreneurs et fournisseurs", "Informazione delle imprese e dei fornitori"),
  item("41-compare", "41", "in", "Kontrollieren und Vergleichen der Angebote (technisch, ökologisch, finanziell)", "Contrôle et comparaison des offres (technique, écologique, financier)", "Controllo e confronto delle offerte (tecnico, ecologico, finanziario)"),
  item("41-alternatives", "41", "in", "Fachliches und rechnerisches Überprüfen von Unternehmervarianten", "Vérification technique et arithmétique des variantes d’entrepreneurs", "Verifica tecnica e aritmetica delle varianti delle imprese"),
  item("41-negotiate", "41", "in", "Mitwirken bei Verhandlungen mit Unternehmern und Lieferanten", "Participation aux négociations avec les entrepreneurs et fournisseurs", "Partecipazione alle trattative con imprese e fornitori"),
  item("41-clean", "41", "in", "Bereinigen der Angebote", "Mise au net des offres", "Rettifica delle offerte"),
  item("41-proposal", "41", "in", "Ausarbeiten der Vergabevorschläge", "Élaboration des propositions d’adjudication", "Elaborazione delle proposte di aggiudicazione"),
  item("41-costs", "41", "in", "Revidieren der Kostenermittlung aufgrund der Angebote und Vergleich mit dem Kostenvoranschlag", "Révision des coûts sur la base des offres et comparaison avec le devis", "Revisione dei costi in base alle offerte e confronto con il preventivo"),
  item("41-deviations", "41", "in", "Begründen von Abweichungen gegenüber dem Kostenvoranschlag im Fachbereich", "Justification des écarts par rapport au devis dans le domaine spécialisé", "Motivazione degli scostamenti rispetto al preventivo nel settore specialistico"),
  item("41-schedule", "41", "in", "Mitwirken beim Erstellen eines provisorischen Ausführungsterminplans", "Participation à l’établissement d’un calendrier d’exécution provisoire", "Partecipazione all’allestimento di un programma esecutivo provvisorio"),
  item("41-award", "41", "in", "Formulieren der Vergabeanträge mit dem Gesamtleiter", "Formulation des demandes d’adjudication avec le responsable général", "Formulazione delle richieste di aggiudicazione con il direttore generale"),
  item("41-variants", "41", "out", "Ausschreiben von Varianten", "Mise en soumission de variantes", "Messa in appalto di varianti"),
  item("41-many-offers", "41", "out", "Detaillierte Analyse unverhältnismässig zahlreicher Offerten", "Analyse détaillée d’un nombre disproportionné d’offres", "Analisi dettagliata di un numero sproporzionato di offerte"),
  item("41-variant-analysis", "41", "out", "Analyse von Varianten", "Analyse de variantes", "Analisi di varianti"),
  item("41-revised-kv", "41", "out", "Revidierter Kostenvoranschlag auf der Grundlage der eingegangenen Angebote", "Devis révisé sur la base des offres reçues", "Preventivo rivisto sulla base delle offerte ricevute"),
  item("41-payment-plan", "41", "out", "Aufstellen des detaillierten Zahlungsplans", "Établissement du plan de paiement détaillé", "Allestimento del piano dei pagamenti dettagliato"),

  // 51 Ausführungsprojekt
  item("51-calculations", "51", "in", "Durchführen der definitiven Berechnungen", "Exécution des calculs définitifs", "Esecuzione dei calcoli definitivi"),
  item("51-openings", "51", "in", "Angabe der Aussparungen", "Indication des réservations", "Indicazione delle aperture e scanalature"),
  item("51-plans", "51", "in", "Erstellen der Ausführungspläne und Prinzipschemata", "Établissement des plans d’exécution et des schémas de principe", "Allestimento dei piani esecutivi e degli schemi di principio"),
  item("51-metering", "51", "in", "Erstellen der Ausführungsunterlagen für das Messkonzept", "Établissement des documents d’exécution du concept de mesure", "Allestimento dei documenti esecutivi del concetto di misura"),
  item("51-coordination", "51", "in", "Mitwirken bei der Koordination der Anlagen und Installationen", "Participation à la coordination des installations", "Partecipazione al coordinamento degli impianti"),
  item("51-shop-check", "51", "in", "Überprüfen der Fabrikations- und Werkstattpläne von Unternehmern und Lieferanten", "Vérification des plans de fabrication et d’atelier des entrepreneurs et fournisseurs", "Verifica dei piani di fabbricazione e d’officina di imprese e fornitori"),
  item("51-permits", "51", "in", "Bereitstellen von Unterlagen für Ausführungsbewilligungen", "Mise à disposition des documents pour les autorisations d’exécution", "Messa a disposizione dei documenti per le autorizzazioni esecutive"),
  item("51-schedule", "51", "in", "Mitwirken beim Nachführen des definitiven Terminplans", "Participation à la mise à jour du calendrier définitif", "Partecipazione all’aggiornamento del programma definitivo"),
  item("51-shop-drawings", "51", "out", "Erstellen der Werkstattpläne für Unternehmer und Lieferanten", "Établissement des plans d’atelier pour les entrepreneurs et fournisseurs", "Allestimento dei piani d’officina per imprese e fornitori"),
  { ...item("51-fk", "51", "out", "Fachkoordination gemäss Art. 9", "Coordination spécialisée selon art. 9", "Coordinamento specialistico secondo art. 9"), unlessOffered: "coordination" },
  item("51-third-party", "51", "out", "Eintragen der von Dritten projektierten Anlagen und Installationen in eigene Pläne", "Report dans nos plans des installations projetées par des tiers", "Inserimento nei propri piani degli impianti progettati da terzi"),
  item("51-utilities", "51", "out", "Erstellen der Ausführungspläne der Ver- und Entsorgungsleitungen", "Plans d’exécution des conduites d’approvisionnement et d’évacuation", "Piani esecutivi delle condotte di approvvigionamento e smaltimento"),

  // 52 Ausführung (Fachbauleitung)
  item("52-advice", "52", "in", "Beraten der Gesamtbauleitung und Mitwirken bei der Festlegung des Bauvorgangs für die bearbeiteten Anlagenteile", "Conseil à la direction générale des travaux et participation à la définition du déroulement pour les installations traitées", "Consulenza alla direzione generale dei lavori e partecipazione alla definizione dello svolgimento per gli impianti trattati"),
  item("52-quality", "52", "in", "Überwachen der Qualität der ausgeführten und im Werkvertrag festgehaltenen Leistungen", "Surveillance de la qualité des prestations exécutées et convenues dans le contrat d’entreprise", "Sorveglianza della qualità delle prestazioni eseguite e stabilite nel contratto d’appalto"),
  item("52-deliveries", "52", "in", "Kontrolle der im Werkvertrag enthaltenen Lieferungen", "Contrôle des fournitures comprises dans le contrat d’entreprise", "Controllo delle forniture comprese nel contratto d’appalto"),
  item("52-meetings", "52", "in", "Teilnahme an Bau- und Koordinationssitzungen nach Bedarf", "Participation aux séances de chantier et de coordination selon les besoins", "Partecipazione alle riunioni di cantiere e di coordinamento secondo necessità"),
  item("52-workshop", "52", "in", "Werkstattkontrollen und -abnahmen von wesentlichen Lieferteilen nach Bedarf", "Contrôles et réceptions en atelier des éléments importants selon les besoins", "Controlli e collaudi in officina delle parti essenziali secondo necessità"),
  item("52-daywork", "52", "in", "Anordnen und Kontrollieren der Regiearbeiten und der entsprechenden Rapporte", "Ordonnance et contrôle des travaux en régie et des rapports correspondants", "Ordinazione e controllo dei lavori a regia e dei relativi rapporti"),
  item("52-measuring", "52", "in", "Organisation und Kontrolle der Ausmassarbeiten", "Organisation et contrôle des métrés", "Organizzazione e controllo delle misurazioni"),
  item("52-claims", "52", "in", "Prüfen von Nachträgen", "Vérification des avenants", "Verifica delle richieste supplementari"),
  item("52-partial-acceptance", "52", "in", "Planen, Durchführen und Protokollieren von Teilabnahmen", "Planification, exécution et procès-verbaux des réceptions partielles", "Pianificazione, esecuzione e verbalizzazione dei collaudi parziali"),
  item("52-inspections", "52", "in", "Veranlassen offizieller Kontrollen durch zuständige Instanzen", "Organisation des contrôles officiels par les instances compétentes", "Richiesta dei controlli ufficiali da parte delle istanze competenti"),
  item("52-cost-control", "52", "in", "Führen der Kostenkontrolle", "Tenue du contrôle des coûts", "Tenuta del controllo dei costi"),
  item("52-invoices", "52", "in", "Kontrolle von Leistungsaufstellungen und Rechnungen", "Contrôle des décomptes de prestations et des factures", "Controllo dei conteggi delle prestazioni e delle fatture"),
  item("52-guarantees", "52", "in", "Einholen und Kontrollieren der Bank- und gleichwertiger Garantien", "Obtention et contrôle des garanties bancaires ou équivalentes", "Ottenimento e controllo delle garanzie bancarie o equivalenti"),
  item("52-schedule", "52", "in", "Mitwirken beim Nachführen des Ausführungsterminplans", "Participation à la mise à jour du calendrier d’exécution", "Partecipazione all’aggiornamento del programma esecutivo"),
  item("52-third-party", "52", "out", "Bauleitung für Anlageteile, welche von Dritten projektiert wurden", "Direction des travaux pour des installations projetées par des tiers", "Direzione dei lavori per impianti progettati da terzi"),
  item("52-permanent", "52", "out", "Vom Auftraggeber oder von der Gesamtleitung gewünschte ständige Bauaufsicht bzw. regelmässige Teilnahme an Bau- und Koordinationssitzungen", "Surveillance permanente du chantier ou participation régulière aux séances, demandée par le mandant ou la direction générale", "Sorveglianza permanente del cantiere o partecipazione regolare alle riunioni, richiesta dal committente o dalla direzione generale"),
  item("52-replacement", "52", "out", "Mehrleistungen infolge der Auswechslung von Unternehmern oder Lieferanten (Konkurse usw.)", "Prestations supplémentaires suite au remplacement d’entrepreneurs ou de fournisseurs (faillites, etc.)", "Prestazioni supplementari per la sostituzione di imprese o fornitori (fallimenti ecc.)"),
  { ...item("52-fk", "52", "out", "Fachkoordination gemäss Art. 9", "Coordination spécialisée selon art. 9", "Coordinamento specialistico secondo art. 9"), unlessOffered: "coordination" },
  item("52-concrete", "52", "out", "Kontrolle von Einlagen wie Rohren und Kanälen im Beton", "Contrôle des éléments noyés dans le béton (tubes, gaines)", "Controllo degli elementi annegati nel calcestruzzo (tubi, canali)"),
  item("52-utilities", "52", "out", "Kontrolle der Ver- und Entsorgungsleitungen", "Contrôle des conduites d’approvisionnement et d’évacuation", "Controllo delle condotte di approvvigionamento e smaltimento"),
  item("52-lcc", "52", "out", "Ermitteln der Lebenszykluskosten", "Détermination des coûts du cycle de vie", "Determinazione dei costi del ciclo di vita"),

  // 53 Inbetriebnahme, Abschluss (SIA 108 Art. 4.53)
  item("53-commissioning", "53", "in", "Planung, Organisation und Überwachung der Inbetriebnahme der Anlagen und Installationen", "Planification, organisation et surveillance de la mise en service des installations", "Pianificazione, organizzazione e sorveglianza della messa in esercizio degli impianti"),
  item("53-instruction", "53", "in", "Mitwirken bei der einmaligen Instruktion des Bedienungspersonals", "Participation à l’instruction unique du personnel d’exploitation", "Partecipazione all’istruzione unica del personale d’esercizio"),
  item("53-operating-permit", "53", "in", "Mitwirken beim Einholen der definitiven Betriebsbewilligung", "Participation à l’obtention de l’autorisation d’exploiter définitive", "Partecipazione all’ottenimento dell’autorizzazione d’esercizio definitiva"),
  item("53-acceptance", "53", "in", "Planung und Durchführung der Abnahmen", "Planification et exécution des réceptions", "Pianificazione ed esecuzione dei collaudi"),
  item("53-handover", "53", "in", "Mitwirken bei der Übergabe der Anlagen und Installationen", "Participation à la remise des installations", "Partecipazione alla consegna degli impianti"),
  item("53-manuals", "53", "in", "Einholen und Überprüfen der Betriebsinstruktionen und der nachgeführten Ausführungsunterlagen der Unternehmer", "Obtention et vérification des instructions d’exploitation et des documents d’exécution mis à jour des entrepreneurs", "Ottenimento e verifica delle istruzioni d’esercizio e dei documenti esecutivi aggiornati delle imprese"),
  item("53-as-built", "53", "in", "Nachführen der während der Bauausführung vorgenommenen Änderungen in die Pläne (Revisionspläne)", "Report dans les plans des modifications apportées pendant l’exécution (plans de révision)", "Aggiornamento dei piani con le modifiche apportate durante l’esecuzione (piani di revisione)"),
  item("53-defects", "53", "in", "Feststellen von Mängeln, Anordnen und Kontrollieren der Mängelbehebung, Mängellisten bis zum Ablauf der zweijährigen Rügefrist", "Constatation des défauts, ordonnance et contrôle de leur élimination, listes des défauts jusqu’à l’échéance du délai de deux ans", "Accertamento dei difetti, ordinazione e controllo della loro eliminazione, elenchi dei difetti fino alla scadenza del termine di due anni"),
  item("53-final-account", "53", "in", "Prüfen der Schlussabrechnungen und Gegenüberstellen mit dem Kostenvoranschlag", "Vérification des décomptes finaux et comparaison avec le devis", "Verifica dei conteggi finali e confronto con il preventivo"),
  item("53-documents", "53", "in", "Protokollieren der Abnahmen und Zusammenstellen der für Betrieb und Erhaltung erforderlichen Dokumente", "Procès-verbaux des réceptions et compilation des documents nécessaires à l’exploitation et à l’entretien", "Verbalizzazione dei collaudi e raccolta dei documenti necessari per l’esercizio e la manutenzione"),
  item("53-integral-tests", "53", "out", "Planung, Organisation und Überwachung integraler Tests", "Planification, organisation et surveillance de tests intégraux", "Pianificazione, organizzazione e sorveglianza di test integrali"),
  { ...item("53-fk", "53", "out", "Fachkoordination gemäss Art. 9", "Coordination spécialisée selon art. 9", "Coordinamento specialistico secondo art. 9"), unlessOffered: "coordination" },
  item("53-maintenance-plan", "53", "out", "Erstellen eines Instandhaltungsplans inkl. Einholen von Wartungsverträgen", "Établissement d’un plan d’entretien, y compris obtention des contrats de maintenance", "Allestimento di un piano di manutenzione, compreso l’ottenimento dei contratti di manutenzione"),
  item("53-training", "53", "out", "Personalschulung", "Formation du personnel", "Formazione del personale"),
  item("53-after-warranty", "53", "out", "Leistungen nach Ablauf der zweijährigen Rügefrist", "Prestations après l’échéance du délai de deux ans", "Prestazioni dopo la scadenza del termine di due anni"),
  // Gebäudeautomation (SIA 108 Art. 8.1)
  item("31-ga-concepts", "31", "in", "Zusammentragen der Konzepte der Fachplaner (Messstellenplan usw.)", "Rassemblement des concepts des ingénieurs spécialisés (plan des points de mesure, etc.)", "Raccolta dei concetti dei progettisti specialisti (piano dei punti di misura ecc.)", ga),
  item("31-ga-requirements", "31", "in", "Erfassen der übergeordneten Anforderungen an die Gebäudeautomation", "Relevé des exigences générales relatives à l’automatisation du bâtiment", "Rilevamento dei requisiti generali per l’automazione degli edifici", ga),
  item("31-ga-interfaces", "31", "in", "Definieren der Anforderungen und Verbindungsstellen (Schnittstellen) der Systeme", "Définition des exigences et des points de liaison (interfaces) des systèmes", "Definizione dei requisiti e dei punti di collegamento (interfacce) dei sistemi", ga),
  item("31-ga-rules", "31", "in", "Festlegen der Regeln für Gesamtbetrieb, Bedienung, Alarmierung und Überwachung", "Définition des règles d’exploitation globale, de commande, d’alarme et de surveillance", "Definizione delle regole per l’esercizio globale, il comando, l’allarme e la sorveglianza", ga),
  item("32-ga-description", "32", "in", "Erstellen des Anlage- und Funktionsbeschriebs der Gebäudeautomation", "Établissement du descriptif des installations et des fonctions de l’automatisation", "Allestimento della descrizione degli impianti e delle funzioni dell’automazione", ga),
  item("32-ga-control", "32", "in", "Erstellen des Regelbeschriebs", "Établissement du descriptif de régulation", "Allestimento della descrizione della regolazione", ga),
  item("32-ga-operation", "32", "in", "Erstellen des Betriebskonzepts", "Établissement du concept d’exploitation", "Allestimento del concetto d’esercizio", ga),
  item("32-ga-fire", "32", "in", "Festlegen der Brandfallsteuerungen (Brandabschaltungen)", "Définition des commandes en cas d’incendie (déclenchements)", "Definizione dei comandi in caso d’incendio (disinserimenti)", ga),
  item("32-ga-management", "32", "in", "Definieren der gewerkübergreifenden Funktionen und der Managementebene", "Définition des fonctions intercorps de métier et du niveau de gestion", "Definizione delle funzioni intersettoriali e del livello di gestione", ga),
  item("32-ga-energy", "32", "in", "Erarbeiten des Konzepts für den energieeffizienten Betrieb", "Élaboration du concept d’exploitation efficace en énergie", "Elaborazione del concetto d’esercizio efficiente dal profilo energetico", ga),
  item("32-ga-datapoints", "32", "in", "R&I-Schemata und Datenpunktliste, wenn die Aufgabe dies erfordert", "Schémas R&I et liste des points de données si la tâche l’exige", "Schemi R&I e lista dei punti dati se il compito lo richiede", ga),
  item("33-ga-permit", "33", "in", "Mitwirken im Bewilligungsverfahren (Unterlagen Gebäudeautomation)", "Participation à la procédure d’autorisation (documents d’automatisation)", "Partecipazione alla procedura d’autorizzazione (documenti di automazione)", ga),
  item("41-ga-tender", "41", "in", "Erstellen der Ausschreibungsunterlagen inkl. Leistungsabgrenzung zu den Fachplanern", "Établissement des documents d’appel d’offres, y compris délimitation des prestations avec les ingénieurs spécialisés", "Allestimento della documentazione d’appalto, inclusa la delimitazione delle prestazioni con i progettisti specialisti", ga),
  item("41-ga-offers", "41", "in", "Prüfen und Vergleichen der Angebote, Vergabeantrag", "Contrôle et comparaison des offres, proposition d’adjudication", "Verifica e confronto delle offerte, proposta di aggiudicazione", ga),
  item("51-ga-concepts", "51", "in", "Zusammentragen der freigegebenen Konzepte der Fachplaner", "Rassemblement des concepts approuvés des ingénieurs spécialisés", "Raccolta dei concetti approvati dei progettisti specialisti", ga),
  item("51-ga-documents", "51", "in", "Erstellen der Ausführungsunterlagen der Gebäudeautomation (Funktionsbeschriebe, Datenpunktlisten)", "Établissement des documents d’exécution de l’automatisation (descriptifs de fonctions, listes de points)", "Allestimento della documentazione esecutiva dell’automazione (descrizioni delle funzioni, liste dei punti)", ga),
  item("51-ga-check", "51", "in", "Überprüfen der Unternehmerunterlagen", "Contrôle des documents des entreprises", "Verifica della documentazione delle imprese", ga),
  item("52-ga-supervision", "52", "in", "Fachbauleitung Gebäudeautomation, Teilnahme an Koordinationssitzungen nach Bedarf", "Direction des travaux spécialisée en automatisation, participation aux séances de coordination selon besoin", "Direzione lavori specialistica dell’automazione, partecipazione alle sedute di coordinamento secondo necessità", ga),
  item("52-ga-invoices", "52", "in", "Prüfen von Nachträgen und Rechnungen", "Contrôle des avenants et des factures", "Verifica delle aggiunte e delle fatture", ga),
  item("53-ga-function", "53", "in", "Kontrolle der Funktionsnachweise und Mitwirken bei den Funktionskontrollen", "Contrôle des preuves de fonctionnement et participation aux contrôles de fonctionnement", "Controllo delle prove di funzionamento e partecipazione ai controlli", ga),
  item("53-ga-management", "53", "in", "Kontrolle der Managementfunktionen", "Contrôle des fonctions de gestion", "Controllo delle funzioni di gestione", ga),
  item("53-ga-tests", "53", "in", "Durchführen der integralen Tests gemäss vereinbarter Integrationstiefe", "Exécution des tests intégraux selon la profondeur d’intégration convenue", "Esecuzione dei test integrali secondo la profondità d’integrazione convenuta", ga),
  item("53-ga-permit-tests", "53", "out", "Integrale Tests im Zusammenhang mit der Bezugsbewilligung (Gesamtleitung)", "Tests intégraux liés au permis d’habiter (direction générale)", "Test integrali legati al permesso d’abitabilità (direzione generale)", ga),
  // Fachkoordination: räumliche (Art. 9.3) included, technische (Art. 9.4) besonders zu vereinbaren
  item("31-fk-meetings", "31", "in", "Leiten der Koordinationssitzungen mit Protokoll, Pendenzen- und Beschlussliste", "Conduite des séances de coordination avec procès-verbal, liste des tâches et des décisions", "Conduzione delle sedute di coordinamento con verbale, lista delle pendenze e delle decisioni", fk),
  item("31-fk-rough", "31", "in", "Grobkoordination der Gebäudetechnik und Erstellen des Koordinationsplans", "Coordination générale des installations du bâtiment et établissement du plan de coordination", "Coordinamento generale dell’impiantistica ed elaborazione del piano di coordinamento", fk),
  item("31-fk-cad", "31", "in", "CAD-Organisation und Entwurf des CAD-Pflichtenhefts", "Organisation DAO et projet de cahier des charges DAO", "Organizzazione CAD e bozza del capitolato CAD", fk),
  item("32-fk-meetings", "32", "in", "Leiten der Koordinationssitzungen", "Conduite des séances de coordination", "Conduzione delle sedute di coordinamento", fk),
  item("32-fk-plans", "32", "in", "Überarbeiten der Koordinationspläne inkl. Schachtdetails", "Mise à jour des plans de coordination, y compris détails des gaines", "Aggiornamento dei piani di coordinamento, inclusi i dettagli dei cavedi", fk),
  item("32-fk-statics", "32", "in", "Veranlassen der statischen Prüfung durch den Bauingenieur", "Demande de vérification statique par l’ingénieur civil", "Richiesta della verifica statica da parte dell’ingegnere civile", fk),
  item("32-fk-technical", "32", "out", "Technische Fachkoordination: koordiniertes technisches Gesamtkonzept", "Coordination technique : concept technique global coordonné", "Coordinamento tecnico: concetto tecnico globale coordinato", fk),
  item("32-fk-metering", "32", "out", "Gesamt-Messkonzept inkl. Erfolgskontrolle nach dem ersten Betriebsjahr", "Concept global de mesure, y compris contrôle des résultats après la première année d’exploitation", "Concetto di misura globale, incluso il controllo dei risultati dopo il primo anno d’esercizio", fk),
  item("32-fk-operation", "32", "out", "Bedienungs- und Betriebskonzept", "Concept de commande et d’exploitation", "Concetto di comando e d’esercizio", fk),
  item("41-fk-meetings", "41", "in", "Leiten der Koordinationssitzungen und Weiterführen der Koordinationspläne", "Conduite des séances de coordination et mise à jour des plans de coordination", "Conduzione delle sedute di coordinamento e aggiornamento dei piani di coordinamento", fk),
  item("51-fk-meetings", "51", "in", "Leiten der Koordinationssitzungen", "Conduite des séances de coordination", "Conduzione delle sedute di coordinamento", fk),
  item("51-fk-plans", "51", "in", "Erstellen der koordinierten Ausführungspläne und Koordinationsschnittpläne", "Établissement des plans d’exécution coordonnés et des coupes de coordination", "Allestimento dei piani esecutivi coordinati e delle sezioni di coordinamento", fk),
  item("51-fk-openings", "51", "in", "Erstellen der koordinierten Aussparungspläne zusammen mit dem Bauingenieur", "Établissement des plans de réservations coordonnés avec l’ingénieur civil", "Allestimento dei piani delle aperture coordinati con l’ingegnere civile", fk),
  item("52-fk-meetings", "52", "in", "Leiten der Koordinationssitzungen während der Ausführung", "Conduite des séances de coordination pendant l’exécution", "Conduzione delle sedute di coordinamento durante l’esecuzione", fk),
  item("53-fk-as-built", "53", "in", "Erstellen der Revisionskoordinationspläne", "Établissement des plans de coordination révisés", "Allestimento dei piani di coordinamento di revisione", fk),
  item("53-fk-commissioning", "53", "out", "Koordinierte Inbetriebnahme und integrale Tests (technische Fachkoordination)", "Mise en service coordonnée et tests intégraux (coordination technique)", "Messa in esercizio coordinata e test integrali (coordinamento tecnico)", fk),
  item("53-fk-documents", "53", "out", "Technische Bauwerksakten", "Dossier technique de l’ouvrage", "Documentazione tecnica dell’opera", fk),
];

/** Whether a service is listed for a trade. */
export const serviceApplies = (service: FeeService, trade: FeeTrade) => (service.trades ?? (installTrades as readonly FeeTrade[])).includes(trade);

/** State of a service for a trade: the stored choice, else the default (items limited to other trades: "no"). */
export function serviceState(service: FeeService, trade: FeeTrade, stored: Record<string, ServiceState> | undefined, offered: readonly FeeTrade[]): ServiceState {
  if (!serviceApplies(service, trade)) return "no";
  return stored?.[service.id] ?? (service.unlessOffered && offered.includes(service.unlessOffered) ? "no" : service.state);
}
