// Filters, control units, sensors and interfaces of the Zehnder ComfoAir Q350 / Q450 / Q600, selected with the
// device of a ventilation system. Articles from the Zehnder IGH catalogue (article numbers as there, so the LV
// takes text and price from the catalogue).

type Article = { number: string; text: string };

/** Units the options exist for (ComfoAir Q). */
export const hasQOptions = (deviceKey: string | null | undefined) => /^zehnder-comfoair-q\d+$/.test(deviceKey ?? "");

/** ISO 16890 filter class: group (coarse < ePM10 < ePM2.5 < ePM1) and efficiency [%]. */
export type FilterClass = { group: "coarse" | "ePM10" | "ePM2.5" | "ePM1"; pct: number; carbon?: boolean };

const groupRank: Record<FilterClass["group"], number> = { coarse: 0, ePM10: 1, "ePM2.5": 2, ePM1: 3 };

/** «ISO ePM1 55%», with the SIA 410 letter for the schema (G coarse, F fine, A activated carbon). */
export const filterText = (f: FilterClass) => `ISO ${f.group === "coarse" ? "Coarse" : f.group} ${f.pct}%`;
export const filterLetter = (f: FilterClass) => (f.carbon ? "A" : f.group === "coarse" ? "G" : "F");

export type FilterSet = { key: string; name: string; supply: FilterClass; extract: FilterClass; article: Article };

/** Filter sets of the ComfoAir Q (one filter each in the outdoor and the extract air). */
export const filterSets: FilterSet[] = [
  {
    key: "g4f7",
    name: "G4 / F7",
    supply: { group: "ePM1", pct: 55 },
    extract: { group: "coarse", pct: 65 },
    article: { number: "400502013", text: "Filterset für CA Q350/450/600 G4/ISO Coarse 65% F7/ISO ePM1 55% Inhalt: Je 1 St." },
  },
  {
    key: "g4g4",
    name: "G4 / G4",
    supply: { group: "coarse", pct: 65 },
    extract: { group: "coarse", pct: 65 },
    article: { number: "400502012", text: "Filterset ComfoAir Q 350/450/600 G4, Inhalt 2 Stück" },
  },
  {
    key: "carbon",
    name: "Aktivkohle / Aktivkohle",
    supply: { group: "ePM10", pct: 50, carbon: true },
    extract: { group: "ePM10", pct: 50, carbon: true },
    article: { number: "400100165", text: "Filtersatz Zehnder ComfoAir Q 350/450/600 (Aktivkohlenfilter) 2 x Aktivkohlefilter ISO ePM10 ≥ 50 %" },
  },
  {
    key: "freshScent",
    name: "Fresh Scent (G4 / Aktivkohle)",
    supply: { group: "ePM10", pct: 50, carbon: true },
    extract: { group: "coarse", pct: 65 },
    article: { number: "400100097", text: "Filtersatz Zehnder ComfoAir Q 350/450/600 Fresh Scent G4 / ISO Grob ≥ 65 % und Aktivkohlefilter" },
  },
];

export const findFilterSet = (key: string | null | undefined) => filterSets.find((f) => f.key === key) ?? null;

/** Parses the required stages of the filter concept, e.g. «ISO ePM10 50% + ISO ePM1 50%». */
export function parseFilterStages(text: string): FilterClass[] {
  return [...text.matchAll(/ISO\s+(coarse|ePM10|ePM2\.5|ePM1)\s+(\d+)\s*%/gi)].map((m) => ({
    group: (m[1].toLowerCase() === "coarse" ? "coarse" : m[1].replace(/^epm/i, "ePM")) as FilterClass["group"],
    pct: Number(m[2]),
  }));
}

/** Whether a filter reaches a required class (a finer group always does, the same group needs the efficiency). */
export const meetsClass = (f: FilterClass, required: FilterClass) =>
  groupRank[f.group] > groupRank[required.group] || (groupRank[f.group] === groupRank[required.group] && f.pct >= required.pct);

/**
 * Deviations of a filter set from the filter concept of a dwelling: the device has one filter per side, so a
 * two-stage supply requirement is never met completely; the finest stage must be reached on the supply side and
 * the extract minimum on the extract side.
 */
export function filterDeviations(set: FilterSet, required: { supply: string | null; extract: string }): { side: "supply" | "extract"; required: string; actual: string }[] {
  const out: { side: "supply" | "extract"; required: string; actual: string }[] = [];
  if (required.supply) {
    const stages = parseFilterStages(required.supply);
    const finest = stages.reduce<FilterClass | null>((best, s) => (!best || meetsClass(s, best) ? s : best), null);
    if (stages.length > 1 || (finest && !meetsClass(set.supply, finest))) out.push({ side: "supply", required: required.supply, actual: filterText(set.supply) });
  }
  const extract = parseFilterStages(required.extract)[0];
  if (extract && !meetsClass(set.extract, extract)) out.push({ side: "extract", required: required.extract, actual: filterText(set.extract) });
  return out;
}

// ---------------------------------------------------------------------------
// Control units, sensors, interfaces
// ---------------------------------------------------------------------------

export const controlUnits = {
  comfoSense: { name: "ComfoSense CCH", short: "CS", article: { number: "655010240", text: "Bedieneinheit Zehnder ComfoSense CCH für ComfoAir Q350/450/600" } },
  comfoSwitch: { name: "ComfoSwitch CCH", short: "SW", article: { number: "655010260", text: "Bedieneinheit Zehnder ComfoSwitch CCH für ComfoAir Q350/450/600" } },
  senseFeller: { name: "ComfoSense Feller EDIZIOdue", short: "CS", article: { number: "655010220", text: "Bedieneinheit ComfoSense Feller Edizio due RAL 9016" } },
  rfz: { name: "Funkfernbedienung RFZ", short: "RF", article: { number: "655000755", text: "Funkfernbedienung Sender RFZ zum ComfoAir Q (als zusätzliche Schaltstelle)" } },
} as const;
export type ControlKey = keyof typeof controlUnits;
export const controlKeys = Object.keys(controlUnits) as ControlKey[];

/** Surface-mounting housing for ComfoSense CCH / ComfoSwitch CCH. */
export const surfaceHousing: Article = { number: "990210152", text: "Aufputzgehäuse für ComfoSense CCH ComfoSwitchCCH und ComfoLED CH RAL9016" };

export const sensorTypes = {
  rff: { name: "Feuchtesensor RFF", short: "H", optionBox: true, articles: { ap: { number: "659000330", text: "Zehnder Raum-Feuchte-Sensor RFF, AP 0-10 V für ComfoAirQ in Kombination mit Option Box" } } },
  c67: {
    name: "CO₂-Sensor C67 ComfoNet",
    short: "CO2",
    optionBox: false,
    articles: {
      up: { number: "655000880", text: "Zehnder Raum-CO2-Sensor C67 ComfoNet, UP, für Zehnder ComfoAir Q 350 / 450 / 600" },
      ap: { number: "655000885", text: "Zehnder Raum-CO2-Sensor C67 ComfoNet, AP, für Zehnder ComfoAir Q 350 / 450 / 600" },
    },
  },
  v67: {
    name: "CO₂-Sensor V67 0-10 V",
    short: "CO2",
    optionBox: true,
    articles: {
      up: { number: "655000850", text: "Zehnder CO2 Raumsensor V67 UP-Montage, 0-10V Signal für ComfoAirQ in Kombination mit Option Box" },
      ap: { number: "655000855", text: "Zehnder CO2 Raumsensor V67 AP-Montage, 0-10V Signal für ComfoAirQ in Kombination mit Option Box" },
    },
  },
} as const;
export type SensorKey = keyof typeof sensorTypes;
export const sensorKeys = Object.keys(sensorTypes) as SensorKey[];

export const interfaceTypes = {
  lan: { name: "ComfoConnect LAN C", short: "LAN", article: { number: "655011100", text: "Internet-Schnittstelle Zehnder ComfoConnect LAN C für Steuerung per App und Webportal" } },
  knx: { name: "ComfoConnect KNX C", short: "KNX", article: { number: "655011120", text: "KNX-Schnittstelle Zehnder ComfoConnect KNX C für KNX Anschlussmöglichkeit" } },
  pro: { name: "ComfoConnect Pro (Modbus)", short: "MB", article: { number: "471429300", text: "Modbus und Internet-Schnittstelle Zehnder ComfoConnect Pro für Steuerung per App und Webportal" } },
} as const;
export type InterfaceKey = keyof typeof interfaceTypes;
export const interfaceKeys = Object.keys(interfaceTypes) as InterfaceKey[];

/** Option Box (0-10 V inputs) for RFF / V67 sensors; not needed with the ComfoFond-L Q, whose Option Box has them. */
export const optionBox = { name: "Option Box", short: "OB", article: { number: "471502143", text: "Zehnder Option Box ComfoAir Q Zubehör-Schnittstelle für Zehnder ComfoAir Q 350/450/600" } };
