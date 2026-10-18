import type { L10n } from "@/lib/planning";

// Honorarberechnung nach SIA 108:2014 Art. 7 (Gebäudetechnik):
//   p  = Z1 + Z2 / ∛Bp                          Grundfaktor (Art. 7.2.2), Bp = faktorbestimmende Baukosten
//   Tm = B · p/100 · n · q/100 · r · U · k       durchschnittlicher Zeitaufwand in h (Art. 7.2.1, 9.6.1)
//   Tp = Tm · i                                  prognostizierter Zeitaufwand (Art. 7.3)
//   H  = Tp · s · h                              Honorar exkl. MwSt. (Art. 7.4)
// Gebäudeautomation (Art. 8.3) and Fachkoordination (Art. 9.7) take B as weighted shares of the coordinated
// installation costs; k (0.15–0.2) only applies to the Fachkoordination.

export const feeTrades = ["heating", "cooling", "ventilation", "sanitary", "electrical", "automation", "coordination"] as const;
export type FeeTrade = (typeof feeTrades)[number];

/** Trades planned with their own Baukosten B; Gebäudeautomation and Fachkoordination use a basis of these. */
export const installTrades = ["heating", "cooling", "ventilation", "sanitary", "electrical"] as const satisfies readonly FeeTrade[];
export type BasisTrade = "automation" | "coordination";
export const isBasisTrade = (trade: FeeTrade): trade is BasisTrade => trade === "automation" || trade === "coordination";

/** Fachgebiete of SIA 108 Art. 7.5.21 / 7.7.3: Heizung and Kälte share one (H/K). */
export const siaColumns = ["hk", "lk", "s", "e", "ga", "fk"] as const;
export type SiaColumn = (typeof siaColumns)[number];

export const tradeColumn: Record<FeeTrade, SiaColumn> = {
  heating: "hk",
  cooling: "hk",
  ventilation: "lk",
  sanitary: "s",
  electrical: "e",
  automation: "ga",
  coordination: "fk",
};

/** Teilphasen with Grundleistungen (SIA 108 Art. 7.7.3); phases 1, 2 and 6 are besonders zu vereinbarende Leistungen. */
export const feePhases = ["31", "32", "33", "41", "51", "52", "53"] as const;
export type FeePhase = (typeof feePhases)[number];

export type PhaseShares = Record<FeePhase, number>;

/**
 * Leistungsanteile q in % (SIA 108 Art. 7.7.3). The norm gives 32 + 33 together (E 18 %, H/K 20 %, L/K 18 %,
 * S 20 %, GA 20 %, FK 30 %); the split 33 = 2 % is our own default and can be changed in the settings.
 */
export const defaultShares: Record<SiaColumn, PhaseShares> = {
  hk: { "31": 10, "32": 18, "33": 2, "41": 23, "51": 23, "52": 14, "53": 10 },
  lk: { "31": 12, "32": 16, "33": 2, "41": 23, "51": 23, "52": 14, "53": 10 },
  s: { "31": 6, "32": 18, "33": 2, "41": 23, "51": 23, "52": 18, "53": 10 },
  e: { "31": 6, "32": 16, "33": 2, "41": 21, "51": 27, "52": 18, "53": 10 },
  ga: { "31": 9, "32": 18, "33": 2, "41": 26, "51": 20, "52": 13, "53": 12 },
  fk: { "31": 10, "32": 28, "33": 2, "41": 15, "51": 25, "52": 15, "53": 5 },
};

/** Limits of the factors (Art. 7.8.3, 7.10.3, 7.14.1, 9.6.1); n and i have no limits in the norm (own choice). */
export const factorLimits = {
  n: [0.5, 1.5],
  r: [0.75, 1.25],
  i: [0.5, 1.5],
  s: [1, 1.5],
  u: [1, 1.4],
  k: [0.15, 0.2],
} as const;

type BuildingType = { id: string; group: L10n; text: L10n; n: Record<SiaColumn, number> };

const g = {
  living: { de: "Wohnen", fr: "Habitation", it: "Abitazione" },
  education: { de: "Unterricht, Bildung und Forschung", fr: "Enseignement, formation et recherche", it: "Insegnamento, formazione e ricerca" },
  industry: { de: "Industrie und Gewerbe", fr: "Industrie et artisanat", it: "Industria e artigianato" },
  agriculture: { de: "Land- und Forstwirtschaft", fr: "Agriculture et sylviculture", it: "Agricoltura e selvicoltura" },
  technical: { de: "Technische Anlagen", fr: "Installations techniques", it: "Impianti tecnici" },
  commerce: { de: "Handel und Verwaltung", fr: "Commerce et administration", it: "Commercio e amministrazione" },
  justice: { de: "Justiz und Polizei", fr: "Justice et police", it: "Giustizia e polizia" },
  health: { de: "Fürsorge und Gesundheit", fr: "Prévoyance et santé", it: "Assistenza e sanità" },
  worship: { de: "Kultus", fr: "Culte", it: "Culto" },
  culture: { de: "Kultur und Geselligkeit", fr: "Culture et vie sociale", it: "Cultura e socialità" },
  hospitality: { de: "Gastgewerbe und Fremdenverkehr", fr: "Hôtellerie et tourisme", it: "Settore alberghiero e turismo" },
  leisure: { de: "Freizeit, Sport, Erholung", fr: "Loisirs, sport, détente", it: "Tempo libero, sport, svago" },
  traffic: { de: "Verkehrsanlagen", fr: "Installations de transport", it: "Impianti di trasporto" },
  military: { de: "Militär- und Schutzanlagen", fr: "Installations militaires et de protection", it: "Impianti militari e di protezione" },
} satisfies Record<string, L10n>;

/** Values in the column order of the norm: E, H/K, L/K, S, GA, FK. */
const bt = (id: string, group: L10n, text: L10n, e: number, hk: number, lk: number, s: number, ga: number, fk: number): BuildingType => ({
  id,
  group,
  text,
  n: { e, hk, lk, s, ga, fk },
});
const t3 = (de: string, fr: string, it: string): L10n => ({ de, fr, it });

/**
 * Schwierigkeitsgrad n für den Normalfall (SIA 108 Art. 7.6.5, «Beispiele von Bauwerksarten»), all building types
 * with values for the Gebäudetechnik (rows with only «Elektrische / Mechanische Anlagen» are left out).
 */
export const buildingTypes: BuildingType[] = [
  bt("temporary", g.living, t3("Behelfswohnungen", "Logements provisoires", "Abitazioni provvisorie"), 0.7, 0.7, 0.7, 0.7, 0.7, 0.7),
  bt("mfh-same", g.living, t3("Mehrfamilienhaus, gleichartige Wohnungstypen", "Immeuble locatif, logements similaires", "Casa plurifamiliare, appartamenti uguali"), 0.7, 0.7, 0.7, 0.7, 0.7, 0.7),
  bt("mfh-mixed", g.living, t3("Mehrfamilienhaus, verschiedenartige Wohnungstypen", "Immeuble locatif, logements différents", "Casa plurifamiliare, appartamenti diversi"), 0.8, 0.8, 0.8, 0.8, 0.8, 0.8),
  bt("terrace-rep", g.living, t3("Terrassenhaus mit Geschosswiederholung", "Maison en terrasses, étages répétitifs", "Casa a terrazze, piani ripetuti"), 0.7, 0.7, 0.7, 0.8, 0.7, 0.7),
  bt("terrace", g.living, t3("Terrassenhaus ohne Geschosswiederholung", "Maison en terrasses, sans répétition", "Casa a terrazze, senza ripetizione"), 0.8, 0.8, 0.8, 0.9, 0.8, 0.8),
  bt("efh", g.living, t3("Einfamilienhaus, Ferienhaus, einfachste resp. durchschnittliche", "Maison individuelle, maison de vacances, simple ou moyenne", "Casa unifamiliare, casa di vacanza, semplice o media"), 0.8, 0.8, 0.8, 0.8, 0.8, 0.8),
  bt("efh-custom", g.living, t3("Einfamilienhaus, Ferienhaus mit individuellen Ansprüchen", "Maison individuelle, maison de vacances, exigences individuelles", "Casa unifamiliare, casa di vacanza con esigenze individuali"), 0.9, 0.9, 0.9, 0.9, 0.9, 0.9),
  bt("senior-flats", g.living, t3("Alterswohnungen, Alterssiedlungen", "Logements pour personnes âgées", "Appartamenti per anziani"), 0.8, 0.8, 0.8, 0.8, 0.8, 0.8),
  bt("care-home", g.living, t3("Altersheime", "Homes pour personnes âgées", "Case per anziani"), 0.9, 1.0, 1.0, 1.0, 1.0, 1.0),
  bt("youth-home", g.living, t3("Heimstätten, Kinder- und Jugendheime", "Foyers pour enfants et jeunes", "Istituti per bambini e giovani"), 0.9, 0.9, 0.9, 0.9, 0.9, 0.9),
  bt("student-home", g.living, t3("Studenten- und Lehrlingswohnheime", "Foyers d’étudiants et d’apprentis", "Case per studenti e apprendisti"), 0.8, 0.8, 0.8, 0.8, 0.8, 0.8),

  bt("school", g.education, t3("Kinderhorte, Kindergärten, Primar- und Sekundarschulen", "Crèches, jardins d’enfants, écoles primaires et secondaires", "Asili nido, scuole dell’infanzia, elementari e medie"), 0.8, 0.8, 0.8, 0.8, 0.8, 0.8),
  bt("vocational", g.education, t3("Berufsschulen, höhere Fachschulen", "Écoles professionnelles, écoles supérieures", "Scuole professionali, scuole specializzate superiori"), 0.9, 0.8, 0.8, 0.9, 0.8, 0.8),
  bt("gymnasium", g.education, t3("Mittelschulen, Gymnasien und Gesamtschulen", "Écoles moyennes, gymnases", "Scuole medie superiori, licei"), 0.9, 0.8, 0.8, 0.9, 0.9, 0.9),
  bt("special-school", g.education, t3("Heilpädagogische und Sonderschulen", "Écoles spécialisées", "Scuole speciali"), 0.8, 0.8, 0.8, 0.8, 0.8, 0.8),
  bt("university", g.education, t3("Hochschulen, Universitäten", "Hautes écoles, universités", "Scuole universitarie, università"), 1.0, 1.0, 1.0, 1.0, 1.0, 1.0),
  bt("library", g.education, t3("Bibliotheken, Staatsarchive", "Bibliothèques, archives d’État", "Biblioteche, archivi di Stato"), 1.0, 1.0, 1.0, 0.8, 1.0, 1.0),
  bt("research", g.education, t3("Forschungsinstitute ohne Laboratorien", "Instituts de recherche sans laboratoires", "Istituti di ricerca senza laboratori"), 1.0, 1.0, 1.0, 0.9, 1.0, 1.0),
  bt("lab-research", g.education, t3("Forschungsinstitute mit Laboratorien", "Instituts de recherche avec laboratoires", "Istituti di ricerca con laboratori"), 1.2, 1.0, 1.2, 1.2, 1.2, 1.2),

  bt("warehouse", g.industry, t3("Lagerhallen", "Halles d’entreposage", "Capannoni di deposito"), 0.6, 0.6, 0.6, 0.6, 0.6, 0.6),
  bt("warehouse-multi", g.industry, t3("Mehrstöckige Lagerbauten", "Entrepôts à plusieurs niveaux", "Magazzini a più piani"), 0.7, 0.7, 0.7, 0.7, 0.7, 0.7),
  bt("cold-store", g.industry, t3("Mechanisierte Lager, Kühllager", "Entrepôts mécanisés, entrepôts frigorifiques", "Magazzini meccanizzati, celle frigorifere"), 1.0, 0.8, 1.0, 0.8, 1.0, 0.8),
  bt("silo", g.industry, t3("Silobauten", "Silos", "Silos"), 0.8, 0.8, 0.8, 0.8, 0.8, 0.8),
  bt("distribution", g.industry, t3("Verteilzentralen", "Centres de distribution", "Centri di distribuzione"), 1.0, 1.0, 1.0, 1.0, 1.0, 1.0),
  bt("industrial-hall", g.industry, t3("Industriehallen", "Halles industrielles", "Capannoni industriali"), 1.0, 1.0, 1.0, 0.9, 1.0, 1.0),
  bt("prod-heavy", g.industry, t3("Produktionsbauten, Rohstoff- und Schwerindustrie", "Bâtiments de production, industrie lourde et des matières premières", "Edifici di produzione, industria pesante e delle materie prime"), 1.0, 1.0, 1.0, 1.0, 1.0, 1.0),
  bt("prod-mechanical", g.industry, t3("Produktionsbauten, mechanische Industrie", "Bâtiments de production, industrie mécanique", "Edifici di produzione, industria meccanica"), 1.0, 1.0, 1.0, 1.0, 1.0, 1.0),
  bt("prod-processing", g.industry, t3("Produktionsbauten, verarbeitende Industrie", "Bâtiments de production, industrie de transformation", "Edifici di produzione, industria di trasformazione"), 1.0, 1.1, 1.2, 1.0, 1.1, 1.1),
  bt("prod-food", g.industry, t3("Produktionsbauten, Lebensmittel- und Getränkeindustrie", "Bâtiments de production, industrie alimentaire et des boissons", "Edifici di produzione, industria alimentare e delle bevande"), 0.9, 1.0, 1.0, 0.9, 1.0, 1.0),
  bt("workshop", g.industry, t3("Betriebsgebäude, Gewerbebauten, Werkstätten, Zentralwäschereien", "Bâtiments d’exploitation, artisanat, ateliers, blanchisseries centrales", "Edifici aziendali, artigianali, officine, lavanderie centrali"), 1.0, 1.0, 1.0, 0.9, 1.0, 1.0),
  bt("lab", g.industry, t3("Laborgebäude", "Bâtiments de laboratoires", "Edifici di laboratorio"), 1.2, 1.1, 1.2, 1.2, 1.2, 1.2),

  bt("farm", g.agriculture, t3("Landwirtschaftsbauten", "Bâtiments agricoles", "Edifici agricoli"), 0.9, 0.9, 0.9, 0.9, 0.9, 0.9),
  bt("animal-shelter", g.agriculture, t3("Tierheime, Veterinärstationen", "Refuges pour animaux, stations vétérinaires", "Rifugi per animali, stazioni veterinarie"), 0.8, 1.0, 1.0, 0.9, 1.0, 1.0),
  bt("animal-hospital", g.agriculture, t3("Tierspitäler", "Hôpitaux vétérinaires", "Ospedali veterinari"), 1.0, 1.0, 1.2, 1.1, 1.2, 1.2),
  bt("slaughterhouse", g.agriculture, t3("Schlachthöfe", "Abattoirs", "Macelli"), 1.2, 1.1, 1.2, 1.2, 1.2, 1.2),

  bt("heating-plant", g.technical, t3("Heizzentralen, Fernwärmeanlagen und Kraftwerkbauten", "Centrales de chauffage, chauffage à distance et centrales électriques", "Centrali termiche, teleriscaldamento e centrali elettriche"), 1.0, 0.9, 1.0, 0.8, 1.0, 1.0),
  bt("solar-wind", g.technical, t3("Sonnenenergie- und Windkraftanlagen", "Installations solaires et éoliennes", "Impianti solari ed eolici"), 1.0, 0.9, 1.0, 0.8, 1.0, 1.0),
  bt("water-treatment", g.technical, t3("Wasseraufbereitungsanlagen, Pumpwerke, Kläranlagen", "Traitement de l’eau, stations de pompage, stations d’épuration", "Impianti di trattamento dell’acqua, stazioni di pompaggio, depuratori"), 1.0, 0.9, 1.2, 0.8, 1.0, 1.0),
  bt("incineration", g.technical, t3("Kehrichtverbrennungsanlagen, Abwärmeverwertungsanlagen", "Usines d’incinération, valorisation des rejets thermiques", "Impianti di incenerimento, recupero del calore residuo"), 1.0, 0.9, 1.2, 0.9, 1.0, 1.0),
  bt("substation", g.technical, t3("Elektro-Unterwerke, Freiluft- und Innenraumanlagen, Trafostationen", "Sous-stations électriques, installations extérieures et intérieures, stations transformatrices", "Sottostazioni elettriche, impianti all’aperto e interni, cabine di trasformazione"), 1.0, 0.9, 1.0, 0.8, 1.0, 1.0),

  bt("shop-simple", g.commerce, t3("Ladenbauten, einfache Grundausstattung", "Magasins, équipement simple", "Negozi, dotazione semplice"), 0.8, 0.8, 0.8, 0.8, 0.8, 0.8),
  bt("shop-complex", g.commerce, t3("Ladenbauten, komplexe Grundausstattung", "Magasins, équipement complexe", "Negozi, dotazione complessa"), 1.0, 0.9, 1.2, 0.9, 1.0, 1.0),
  bt("mall", g.commerce, t3("Warenhäuser, Einkaufszentren, Markthallen", "Grands magasins, centres commerciaux, halles de marché", "Grandi magazzini, centri commerciali, mercati coperti"), 1.0, 1.0, 1.2, 1.0, 1.1, 1.1),
  bt("office-simple", g.commerce, t3("Einfache Bürobauten", "Bâtiments administratifs simples", "Edifici amministrativi semplici"), 1.0, 0.9, 0.8, 0.8, 0.9, 0.9),
  bt("office", g.commerce, t3("Bürobauten mit erhöhten Anforderungen", "Bâtiments administratifs à exigences accrues", "Edifici amministrativi con esigenze elevate"), 1.1, 1.0, 1.0, 0.9, 1.0, 1.0),
  bt("bank", g.commerce, t3("Banken, Rechenzentren", "Banques, centres de calcul", "Banche, centri di calcolo"), 1.2, 1.1, 1.2, 1.0, 1.2, 1.1),

  bt("court", g.justice, t3("Gerichtsgebäude", "Palais de justice", "Palazzi di giustizia"), 1.3, 1.0, 1.2, 1.0, 1.3, 1.2),
  bt("police", g.justice, t3("Polizeieinsatzgebäude, Untersuchungsgefängnisse, Strafvollzugsanstalten", "Bâtiments de police, prisons préventives, établissements pénitentiaires", "Edifici di polizia, carceri preventive, penitenziari"), 1.3, 1.0, 1.2, 1.0, 1.3, 1.2),

  bt("day-care", g.health, t3("Tagesheime, geschützte Werkstätten", "Foyers de jour, ateliers protégés", "Centri diurni, laboratori protetti"), 0.9, 0.9, 0.9, 0.9, 0.9, 0.9),
  bt("doctor", g.health, t3("Arztpraxen, Ärztehäuser", "Cabinets médicaux", "Studi medici"), 1.1, 1.0, 1.1, 1.1, 1.1, 1.1),
  bt("hospital-beds", g.health, t3("Krankenhäuser, Bettenhäuser", "Hôpitaux, unités de soins", "Ospedali, reparti di degenza"), 1.0, 1.0, 1.0, 1.1, 1.0, 1.0),
  bt("hospital-treatment", g.health, t3("Krankenhäuser, Behandlungstrakte", "Hôpitaux, secteurs de traitement", "Ospedali, reparti di cura"), 1.2, 1.1, 1.2, 1.2, 1.2, 1.2),
  bt("university-hospital", g.health, t3("Universitätskliniken", "Cliniques universitaires", "Cliniche universitarie"), 1.3, 1.2, 1.2, 1.3, 1.3, 1.3),
  bt("nursing", g.health, t3("Pflegeheime, Rehabilitationszentren, Sanatorien, Heilbäder", "Établissements médico-sociaux, centres de réadaptation, sanatoriums, bains thermaux", "Case di cura, centri di riabilitazione, sanatori, bagni termali"), 1.0, 1.0, 1.0, 1.1, 1.0, 1.0),

  bt("church", g.worship, t3("Kirchen, Kapellen, Abdankungshallen", "Églises, chapelles, salles funéraires", "Chiese, cappelle, sale funerarie"), 1.0, 0.8, 1.0, 0.7, 0.8, 0.8),
  bt("crematorium", g.worship, t3("Krematorien", "Crématoires", "Crematori"), 1.0, 0.8, 1.0, 0.8, 0.9, 0.9),
  bt("parish", g.worship, t3("Kirchgemeindehäuser, -zentren", "Maisons et centres paroissiaux", "Case e centri parrocchiali"), 1.0, 1.0, 1.0, 0.8, 1.0, 1.0),
  bt("monastery", g.worship, t3("Klöster", "Couvents", "Conventi"), 1.0, 1.0, 1.0, 1.0, 1.0, 1.0),

  bt("exhibition-temp", g.culture, t3("Provisorische Ausstellungshallen", "Halles d’exposition provisoires", "Padiglioni espositivi provvisori"), 0.8, 0.8, 0.8, 0.8, 0.8, 0.8),
  bt("exhibition", g.culture, t3("Ausstellungsbauten, Pavillons", "Bâtiments d’exposition, pavillons", "Edifici espositivi, padiglioni"), 1.0, 1.0, 1.0, 1.0, 1.0, 1.0),
  bt("museum", g.culture, t3("Museen, Kunstgalerien", "Musées, galeries d’art", "Musei, gallerie d’arte"), 1.0, 1.0, 1.2, 0.9, 1.1, 1.0),
  bt("club", g.culture, t3("Wohlfahrtshäuser, Klubhäuser, Kulturzentren", "Maisons sociales, clubs, centres culturels", "Case sociali, club, centri culturali"), 0.9, 0.9, 1.0, 0.9, 0.9, 0.9),
  bt("small-theatre", g.culture, t3("Kleintheater", "Petits théâtres", "Piccoli teatri"), 1.2, 1.0, 1.2, 0.9, 1.0, 1.0),
  bt("theatre", g.culture, t3("Konzertbauten, Theaterbauten", "Salles de concert, théâtres", "Sale da concerto, teatri"), 1.2, 1.2, 1.4, 1.0, 1.3, 1.2),
  bt("cinema", g.culture, t3("Kinotheater, Diskotheken, Saalbauten", "Cinémas, discothèques, salles", "Cinema, discoteche, sale"), 1.0, 1.0, 1.2, 0.9, 1.1, 1.0),
  bt("congress", g.culture, t3("Kongresshäuser", "Palais des congrès", "Palazzi dei congressi"), 1.2, 1.1, 1.2, 1.1, 1.2, 1.1),
  bt("festival-hall", g.culture, t3("Festhallen", "Halles de fête", "Sale per feste"), 0.9, 0.8, 0.9, 0.8, 0.8, 0.8),
  bt("studio", g.culture, t3("Radio-, Fernseh- oder Filmstudios", "Studios de radio, de télévision ou de cinéma", "Studi radiofonici, televisivi o cinematografici"), 1.4, 1.2, 1.4, 1.0, 1.3, 1.2),

  bt("restaurant", g.hospitality, t3("Restaurationsbetriebe", "Restaurants", "Ristoranti"), 1.1, 1.0, 1.1, 1.1, 1.1, 1.1),
  bt("hotel", g.hospitality, t3("Hotel- und Motelbauten", "Hôtels et motels", "Alberghi e motel"), 1.2, 1.0, 1.2, 1.1, 1.2, 1.1),
  bt("hotel-simple", g.hospitality, t3("Hotels mit einfachem Ausbau, Motels garnis", "Hôtels simples, motels garnis", "Alberghi semplici, motel garni"), 0.9, 1.0, 1.0, 0.9, 1.0, 1.0),
  bt("canteen", g.hospitality, t3("Kantinen, selbständige Grossküchen", "Cantines, cuisines collectives indépendantes", "Mense, cucine industriali indipendenti"), 1.1, 1.0, 1.0, 1.1, 1.0, 1.0),
  bt("hostel", g.hospitality, t3("Herbergen, Jugendherbergen", "Auberges, auberges de jeunesse", "Ostelli, ostelli della gioventù"), 0.8, 0.8, 0.8, 0.8, 0.8, 0.8),
  bt("cafeteria", g.hospitality, t3("Raststätten, Cafeterias, Tearooms", "Restoroutes, cafétérias, tea-rooms", "Aree di servizio, caffetterie, sale da tè"), 0.9, 0.9, 0.9, 0.9, 0.9, 0.9),
  bt("mountain-hut", g.hospitality, t3("Klubhütten, Berghäuser", "Cabanes, maisons de montagne", "Capanne, case di montagna"), 0.8, 0.8, 0.8, 0.8, 0.8, 0.8),

  bt("sports-hall", g.leisure, t3("Turn- und Sporthallen, Mehrzweckhallen", "Salles de gymnastique et de sport, salles polyvalentes", "Palestre e sale polivalenti"), 0.8, 0.9, 0.9, 0.9, 0.9, 0.9),
  bt("stadium", g.leisure, t3("Stadionanlagen, Sportplätze, Tribünen, Garderobengebäude, Freibäder", "Stades, terrains de sport, tribunes, vestiaires, piscines en plein air", "Stadi, campi sportivi, tribune, spogliatoi, piscine all’aperto"), 0.9, 1.0, 1.0, 1.0, 1.0, 1.0),
  bt("pool", g.leisure, t3("Kunsteishallen, Hallenbäder", "Patinoires couvertes, piscines couvertes", "Piste di ghiaccio coperte, piscine coperte"), 1.0, 1.1, 1.2, 1.1, 1.1, 1.1),
  bt("sports-facility", g.leisure, t3("Sportanlagen (Reithallen, Schiessanlagen, Kegel- und Bowlinganlagen usw.)", "Installations sportives (manèges, stands de tir, bowlings, etc.)", "Impianti sportivi (maneggi, poligoni di tiro, bowling ecc.)"), 0.9, 0.9, 0.9, 0.8, 0.9, 0.9),
  bt("youth-centre", g.leisure, t3("Freizeitzentren, Jugendhäuser", "Centres de loisirs, maisons de jeunes", "Centri per il tempo libero, centri giovanili"), 0.9, 0.8, 0.9, 0.8, 0.9, 0.8),
  bt("greenhouse", g.leisure, t3("Tierhäuser, Gewächshäuser", "Animaleries, serres", "Stabulari, serre"), 1.2, 1.1, 1.2, 1.1, 1.1, 1.1),

  bt("garage-single", g.traffic, t3("Eingeschossige Einstellgaragen", "Garages couverts à un niveau", "Autorimesse a un piano"), 0.6, 0.6, 0.8, 0.6, 0.6, 0.6),
  bt("garage-under", g.traffic, t3("Tiefgaragen", "Parkings souterrains", "Autorimesse sotterranee"), 0.8, 0.8, 0.8, 0.8, 0.8, 0.8),
  bt("car-park", g.traffic, t3("Oberirdische Parkhäuser", "Parkings en élévation", "Autosilo fuori terra"), 0.8, 0.8, 0.8, 0.8, 0.8, 0.8),
  bt("depot", g.traffic, t3("Werkhöfe", "Centres d’entretien", "Centri di manutenzione"), 0.9, 0.9, 1.0, 0.9, 0.9, 0.9),
  bt("traffic-control", g.traffic, t3("Verkehrsleitzentrale", "Centrale de gestion du trafic", "Centrale di gestione del traffico"), 1.2, 1.0, 1.2, 0.8, 1.1, 1.0),
  bt("petrol-station", g.traffic, t3("Tankstellen, Wartehallen mit Diensträumen, Zollposten, Busbahnhöfe", "Stations-service, salles d’attente avec locaux de service, postes de douane, gares routières", "Stazioni di servizio, sale d’attesa con locali di servizio, posti doganali, autostazioni"), 0.8, 0.8, 0.8, 0.8, 0.8, 0.8),
  bt("station", g.traffic, t3("Bahnhöfe, Bahnbetriebsbauten", "Gares, bâtiments d’exploitation ferroviaire", "Stazioni, edifici di esercizio ferroviario"), 1.2, 0.8, 1.0, 0.8, 1.0, 1.0),
  bt("rail-depot", g.traffic, t3("Eisenbahn- und Strassenbahndepots und -werkstätten", "Dépôts et ateliers ferroviaires et de tramways", "Depositi e officine ferroviari e tranviari"), 0.8, 0.8, 0.8, 1.0, 0.8, 0.8),
  bt("airport-passenger", g.traffic, t3("Flughäfen, Passagier- und Betriebsbauten", "Aéroports, bâtiments passagers et d’exploitation", "Aeroporti, edifici passeggeri e d’esercizio"), 1.2, 1.1, 1.2, 1.1, 1.2, 1.2),
  bt("airport-cargo", g.traffic, t3("Flughäfen, Frachtbauten, Werfthallen", "Aéroports, bâtiments de fret, hangars", "Aeroporti, edifici merci, hangar"), 0.8, 0.6, 0.8, 0.9, 0.8, 0.8),
  bt("post-simple", g.traffic, t3("Postgebäude, Telefongebäude (einfache)", "Bâtiments postaux et téléphoniques (simples)", "Edifici postali e telefonici (semplici)"), 0.8, 0.8, 1.0, 0.8, 0.8, 0.8),
  bt("post-complex", g.traffic, t3("Postbetriebsgebäude, Fernmeldegebäude (komplexe)", "Bâtiments d’exploitation postale, de télécommunication (complexes)", "Edifici d’esercizio postale, di telecomunicazione (complessi)"), 1.3, 1.0, 1.2, 1.1, 1.2, 1.1),

  bt("barracks", g.military, t3("Kasernen, Zeughäuser", "Casernes, arsenaux", "Caserme, arsenali"), 1.0, 1.0, 1.0, 1.0, 1.0, 1.0),
  bt("civil-protection", g.military, t3("Öffentliche Zivilschutzanlagen, Kommandoposten, Sanitätsposten", "Abris publics de protection civile, postes de commandement, postes sanitaires", "Impianti pubblici di protezione civile, posti di comando, posti sanitari"), 1.0, 1.0, 1.0, 1.0, 1.0, 1.0),
  bt("protected-hospital", g.military, t3("Geschützte Operationsstellen, Notspitäler", "Centres opératoires protégés, hôpitaux de secours", "Centri operatori protetti, ospedali d’emergenza"), 1.2, 1.0, 1.1, 1.1, 1.1, 1.1),
  bt("civil-training", g.military, t3("Zivilschutz-Ausbildungszentren", "Centres d’instruction de la protection civile", "Centri d’istruzione della protezione civile"), 0.9, 1.0, 0.7, 0.8, 0.9, 0.9),
  bt("fire-station", g.military, t3("Feuerwehrgebäude", "Casernes de pompiers", "Caserme dei pompieri"), 1.0, 1.0, 1.0, 1.0, 1.0, 1.0),
];

/** Installation or system of the basis of Gebäudeautomation / Fachkoordination with the share range of the norm. */
export type BasisSystem = { id: string; text: L10n; range: readonly [number, number]; link?: readonly FeeTrade[] };

const sys = (id: string, text: L10n, min: number, max: number, link?: readonly FeeTrade[]): BasisSystem => ({ id, text, range: [min, max], link });
const sysText = {
  electrical: t3("Elektro", "Électricité", "Elettricità"),
  lighting: t3("Beleuchtung", "Éclairage", "Illuminazione"),
  security: t3("Sicherheit", "Sécurité", "Sicurezza"),
  hk: t3("Heizung / Kälte", "Chauffage / froid", "Riscaldamento / refrigerazione"),
  lk: t3("Lüftung / Klima", "Ventilation / climatisation", "Ventilazione / climatizzazione"),
  commercialCooling: t3("Gewerbliche Kälte", "Froid commercial", "Refrigerazione commerciale"),
  sanitary: t3("Sanitär", "Sanitaire", "Sanitario"),
  gastro: t3("Gastro", "Gastronomie", "Gastronomia"),
  management: t3("Managementebene", "Niveau de gestion", "Livello di gestione"),
  transport: t3("Transportsysteme", "Systèmes de transport", "Sistemi di trasporto"),
  special: t3("Spezialsysteme", "Systèmes spéciaux", "Sistemi speciali"),
  client: t3("Vom Bauherrn gestellte Systeme (z. B. Betriebseinrichtungen)", "Systèmes fournis par le maître d’ouvrage (p. ex. équipements d’exploitation)", "Sistemi forniti dal committente (p. es. attrezzature d’esercizio)"),
  automation: t3("Gebäudeautomation", "Automatisation du bâtiment", "Automazione degli edifici"),
};

/**
 * Aufwandbestimmende Anteile der Anlagekosten: Gebäudeautomation Art. 8.3, Fachkoordination Art. 9.7 (proposals of
 * the norm, to be agreed per project). `link`: costs taken from these trades of the offer unless entered.
 */
export const basisSystems: Record<BasisTrade, BasisSystem[]> = {
  automation: [
    sys("electrical", sysText.electrical, 10, 20, ["electrical"]),
    sys("lighting", sysText.lighting, 5, 10),
    sys("security", sysText.security, 5, 10),
    sys("hk", sysText.hk, 10, 20, ["heating", "cooling"]),
    sys("lk", sysText.lk, 10, 20, ["ventilation"]),
    sys("commercialCooling", sysText.commercialCooling, 10, 20),
    sys("sanitary", sysText.sanitary, 5, 10, ["sanitary"]),
    sys("gastro", sysText.gastro, 5, 10),
    sys("management", sysText.management, 100, 100),
    sys("transport", sysText.transport, 5, 10),
    sys("special", sysText.special, 5, 10),
    sys("client", sysText.client, 5, 20),
  ],
  coordination: [
    sys("electrical", sysText.electrical, 50, 100, ["electrical"]),
    sys("lighting", sysText.lighting, 50, 100),
    sys("hk", sysText.hk, 100, 100, ["heating", "cooling"]),
    sys("lk", sysText.lk, 100, 100, ["ventilation"]),
    sys("sanitary", sysText.sanitary, 100, 100, ["sanitary"]),
    sys("gastro", sysText.gastro, 50, 100),
    sys("commercialCooling", sysText.commercialCooling, 50, 100),
    sys("automation", sysText.automation, 50, 100),
    sys("special", sysText.special, 100, 100),
    sys("client", sysText.client, 50, 100),
  ],
};

/** Default share of a basis system: the middle of the norm's range. */
export const defaultBasisPct = (system: BasisSystem) => (system.range[0] + system.range[1]) / 2;

/** Grundfaktor p (Art. 7.2.2); null without Z values or costs. */
export function baseFactor(z1: number | null, z2: number | null, bp: number | null): number | null {
  if (z1 === null || z2 === null || !bp || bp <= 0) return null;
  return z1 + z2 / Math.cbrt(bp);
}

export type SiaFactors = { b: number; bp: number; z1: number | null; z2: number | null; n: number; r: number; i: number; s: number; u: number; k: number };

/** Prognostizierter Zeitaufwand Tp in hours for the Leistungsanteil q (in %); null when p is unknown. */
export function predictedHours(f: SiaFactors, q: number): number | null {
  const p = baseFactor(f.z1, f.z2, f.bp);
  if (p === null || f.b <= 0) return null;
  const tm = ((f.b * p) / 100) * f.n * (q / 100) * f.r * f.u * f.k;
  return tm * f.i;
}
