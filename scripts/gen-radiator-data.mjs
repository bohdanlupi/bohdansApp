// Generates src/lib/heating/radiator-data.ts: Zehnder Heizkörper (Charleston, Charleston Clinic / Turned, Nova Jet
// horizontal / vertikal) with their standard output Φ50 (EN 442, ΔT 50 K) and exponent n from the technical
// catalogues, the Zehnder article numbers from the ZehnderHK IGH catalogue (head article + length in mm), and the
// Heizkörper armatures from the Meier Tobler IGH catalogue (Oventrop Thermostatventile, Rücklaufverschraubungen,
// Thermostatköpfe, Anschlussarmaturen; Entlüftungsventile and Entleerhahnen).
//
// Inputs (local only, gitignored): Berechnungsvorlagen/Heizung/Zehnder_RAD_Charleston_TEC_CH_de.pdf,
// Berechnungsvorlagen/Heizung/Zehnder_RAD_Nova Jet_TEC_CH_de.pdf, IGH/ZehnderHK-*.zip, IGH/MeierTobler-*.zip.
// Needs `pdftotext` (poppler / xpdf, part of Git for Windows) on the PATH. Usage: node scripts/gen-radiator-data.mjs

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { strFromU8, unzipSync } from "fflate";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "src", "lib", "heating", "radiator-data.ts");
const docs = path.join(root, "Berechnungsvorlagen", "Heizung");
const igh = path.join(root, "IGH");

// Default encoding: with «-enc UTF-8» the Charleston Turned page comes out empty (only codes and numbers are read).
const pdfText = (file) => execFileSync("pdftotext", ["-table", path.join(docs, file), "-"], { maxBuffer: 64 * 1024 * 1024 }).toString("latin1");
const ighXml = (prefix) => {
  const zip = fs.readdirSync(igh).find((f) => f.startsWith(prefix) && f.endsWith(".zip"));
  if (!zip) throw new Error(`IGH/${prefix}*.zip missing`);
  const files = unzipSync(fs.readFileSync(path.join(igh, zip)));
  const xml = Object.keys(files).find((k) => /\.xml$/i.test(k));
  return { file: zip, xml: strFromU8(files[xml]) };
};
const dec = (t) => t.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const num = (s) => Number(String(s).replace(",", "."));

// ---------------------------------------------------------------------------
// Zehnder catalogues: one row per model, «Φ50» the last column (W), «n» the one before it
// ---------------------------------------------------------------------------

/** Rows of the technical data tables: model code, then numbers; dedupe by code (tables continue over pages). */
function rows(text, codeRe, count) {
  const seen = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = new RegExp(`^\\s*(${codeRe})(?:\\s+1\\))?\\s+([\\d.,\\s]+)$`).exec(line);
    if (!m) continue;
    const values = m[2].trim().split(/\s+/).map(num);
    if (values.some((v) => !Number.isFinite(v))) continue;
    if (count && !count.includes(values.length)) {
      console.warn(`skipped «${line.trim().slice(0, 80)}» (${values.length} values)`);
      continue;
    }
    const code = m[1].replace(/^(ZNX[A-Z]+)(\d)/, "$1-$2");
    if (!seen.has(code)) seen.set(code, values);
  }
  return seen;
}

const charleston = pdfText("Zehnder_RAD_Charleston_TEC_CH_de.pdf");
const novaJet = pdfText("Zehnder_RAD_Nova Jet_TEC_CH_de.pdf");

// Charleston / Clinic per element: H N T A V M Sk qms n Φ50 – model 2050 = 2 columns, 500 class height.
const charlestonModels = (prefix) =>
  [...rows(charleston, `${prefix}[2-6]\\d{3}`, [10])].map(([code, v]) => {
    const [height, hub, depth, , water, , , , n, phi50] = v;
    return { code, columns: Number(code.replace(prefix, "")[0]), height, hub, depth, water, n, phi50 };
  });
// Turned (horizontal, fixed sizes): H L N1 N2 T A V M qms n Φ50 per radiator.
const turnedModels = [...rows(charleston, "T[2-6]\\d{3}/\\d+", [11])].map(([code, v]) => {
  const [height, length, , , depth, , water, , , n, phi50] = v;
  return { code, columns: Number(code[1]), height, length, depth, water, n, phi50 };
});
// Nova Jet: horizontal per 1000 mm length, vertical per element (74 mm); H first, Φ50 last, n before it.
const novaRows = (codeRe) =>
  [...rows(novaJet, codeRe, [9, 10])].map(([code, v]) => ({ code, type: code.replace(/-.*$/, ""), height: v[0], n: v[v.length - 2], phi50: v[v.length - 1], water: null }));
const novaH = novaRows("ZNXH[A-Z]*-?\\d{3}(?:/\\d{3})?");
const novaV = novaRows("ZNXV[A-Z]*-\\d{3}(?:-4SR)?");

// ---------------------------------------------------------------------------
// ZehnderHK IGH: articles «<code>-<elements> Länge: <L> mm» or «<code> Länge: <L> mm», number = head + L (5 digits)
// ---------------------------------------------------------------------------

const zehnder = ighXml("ZehnderHK");
const articles = new Map(); // code → { head, sizes: Map(elements|length → length) }
{
  const re = /<Artikel Art_Nr_Anbieter="(\d+)">[\s\S]*?<Kopfartikel_Nr>T?(\d+)<\/Kopfartikel_Nr>\s*<Art_Txt_Kurz>([^<]*) Länge: (\d+) mm<\/Art_Txt_Kurz>/g;
  let m;
  while ((m = re.exec(zehnder.xml))) {
    const [, number, head, short, length] = m;
    if (number !== `${head}${length.padStart(5, "0")}`) continue;
    const sec = /^(.*?)-(\d+)$/.exec(short);
    // «2050-10», «K2050-10», «ZNXV-040-12», «ZNXVV-040-4SR-12»: elements; «ZNXH-007», «T2150/6»: by length.
    const sectioned = sec && !/^ZNX?H/.test(short);
    const code = sectioned ? sec[1] : short;
    const entry = articles.get(code) ?? { head, sizes: new Map() };
    if (entry.head !== head) continue; // colour / special versions with another head: keep the first (standard)
    entry.sizes.set(sectioned ? Number(sec[2]) : Number(length), Number(length));
    articles.set(code, entry);
  }
}
const withArticles = (models, label) => {
  const missing = models.filter((m) => !articles.has(m.code)).map((m) => m.code);
  if (missing.length) console.warn(`${label}: no IGH articles for ${missing.join(", ")}`);
  return models.flatMap((m) => {
    const a = articles.get(m.code);
    if (!a) return [];
    const sizes = [...a.sizes.keys()].sort((x, y) => x - y);
    return [{ ...m, head: a.head, sizes }];
  });
};

const series = [
  {
    key: "charleston",
    name: "Zehnder Charleston",
    unit: "element",
    pitch: 46,
    base: 26,
    source: "Zehnder_RAD_Charleston_TEC_CH_de.pdf",
    models: withArticles(charlestonModels(""), "Charleston"),
  },
  {
    key: "clinic",
    name: "Zehnder Charleston Clinic",
    unit: "element",
    pitch: 65,
    base: 7,
    source: "Zehnder_RAD_Charleston_TEC_CH_de.pdf",
    models: withArticles(charlestonModels("K"), "Clinic"),
  },
  { key: "turned", name: "Zehnder Charleston Turned", unit: "fixed", source: "Zehnder_RAD_Charleston_TEC_CH_de.pdf", models: withArticles(turnedModels, "Turned") },
  { key: "novaJetH", name: "Zehnder Nova Jet horizontal", unit: "length", source: "Zehnder_RAD_Nova Jet_TEC_CH_de.pdf", models: withArticles(novaH, "Nova Jet H") },
  { key: "novaJetV", name: "Zehnder Nova Jet vertikal", unit: "element", pitch: 74, base: 0, source: "Zehnder_RAD_Nova Jet_TEC_CH_de.pdf", models: withArticles(novaV, "Nova Jet V") },
];

// ---------------------------------------------------------------------------
// Meier Tobler IGH: register path per article number, Oventrop and accessory articles
// ---------------------------------------------------------------------------

const mt = ighXml("MeierTobler");
const pathOf = new Map();
{
  const stack = [];
  const reg = /<Element_(\d+) Txt="([^"]*)"|<\/Element_(\d+)>|<Element\d+_Nr Name="[^"]*">([^<]*)<\/Element\d+_Nr>/g;
  let m;
  while ((m = reg.exec(mt.xml))) {
    if (m[1]) {
      stack.length = Number(m[1]) - 1;
      stack[Number(m[1]) - 1] = dec(m[2]);
    } else if (m[3]) stack.length = Number(m[3]) - 1;
    else pathOf.set(m[4].trim(), stack.filter(Boolean).join(" > "));
  }
}
const mtArticles = [];
{
  const re = /<Artikel Art_Nr_Anbieter="([^"]*)">[\s\S]*?<Art_Txt_Kurz>([^<]*)<\/Art_Txt_Kurz>/g;
  let m;
  while ((m = re.exec(mt.xml))) mtArticles.push({ number: m[1], text: dec(m[2]).replace(/\s+/g, " ").trim(), path: pathOf.get(m[1]) ?? "" });
}
const inGroup = (re) => mtArticles.filter((a) => re.test(a.path));
const dnOf = (t) => {
  const dn = /DN\s?(\d+)/.exec(t);
  if (dn) return Number(dn[1]);
  const inch = /(3\/8|1\/2|3\/4|1)"/.exec(t);
  return inch ? { "3/8": 10, "1/2": 15, "3/4": 20, 1: 25 }[inch[1]] : null;
};
const formOf = (path, text) =>
  /Winkeleck/.test(path) ? (/links/.test(text) ? "winkeleckL" : "winkeleckR") : /Axial/.test(path) ? "axial" : /Durchgang/.test(path) ? "durchgang" : "eck";

const thermoValves = inGroup(/Heizkörperventile und Ventileinsätze > Thermostatventile (ohne Voreinstellung|mit Voreinstellung|für automatischen Abgleich) > /)
  .filter((a) => /^Oventrop/.test(a.text))
  .map((a) => ({
    number: a.number,
    text: a.text,
    series: /automatischen Abgleich/.test(a.path) ? "aq" : /mit Voreinstellung/.test(a.path) ? "av9" : "a",
    form: formOf(a.path, a.text),
    dn: dnOf(a.text),
  }))
  .filter((a) => a.dn !== null);
const returnValves = [...inGroup(/Rücklaufverschraubungen > Rücklaufverschraubungen (Eck|Durchgang)$/), ...mtArticles.filter((a) => /^Oventrop Combi \d Rücklaufverschraubung/.test(a.text))]
  .filter((a, i, all) => /^Oventrop Combi [234] /.test(a.text) && all.findIndex((b) => b.number === a.number) === i)
  .map((a) => ({ number: a.number, text: a.text, model: `combi${/Combi (\d)/.exec(a.text)[1]}`, form: /Durchgang/.test(a.text) ? "durchgang" : "eck", dn: dnOf(a.text.replace(/"A.*$/, '"')) }))
  .filter((a) => a.dn !== null);
const heads = inGroup(/Thermostatköpfe und Handräder > Thermostatköpfe$/)
  .filter((a) => /^Oventrop (UNI-L[HD]|Uni LHB|UNI-SH Thermostatkopf Design)/i.test(a.text))
  .map((a) => ({ number: a.number, text: a.text }));
const valveBlocks = inGroup(/Heizkörper und Armaturen > Ventilhahnblöcke$/)
  .filter((a) => /^Oventrop (Multiflex F|Multiblock T-RTL Anschlussarmatur)/.test(a.text))
  .map((a) => ({ number: a.number, text: a.text, form: /\bEck\b/.test(a.text) ? "eck" : "durchgang" }));
const vents = inGroup(/Entlüftung und Entleerung > Entlüftungsventile$/)
  .filter((a) => /^Watts Industries Entlüftungsventil/.test(a.text))
  .map((a) => ({ number: a.number, text: a.text, dn: dnOf(a.text) }));
const drains = inGroup(/Entlüftung und Entleerung > Entleerhahnen$/)
  .filter((a) => /ELV Entleerhahnen/.test(a.text))
  .map((a) => ({ number: a.number, text: a.text, dn: dnOf(a.text) }));
const drainTool = mtArticles.find((a) => a.number === "00227.890" || /^Oventrop Entleerungs- und Füllwerkzeug/.test(a.text));

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const check = (label, list, min) => {
  console.log(`${label}: ${list.length}`);
  if (list.length < min) throw new Error(`${label}: only ${list.length} entries`);
};
for (const s of series) check(`${s.name} models`, s.models, 5);
check("Thermostatventile", thermoValves, 20);
check("Rücklaufverschraubungen", returnValves, 8);
check("Thermostatköpfe", heads, 3);
check("Anschlussarmaturen", valveBlocks, 2);
check("Entlüftungsventile", vents, 2);
check("Entleerhahnen", drains, 1);

const ts = `// GENERATED by scripts/gen-radiator-data.mjs – do not edit.
// Zehnder Heizkörper: Φ50 (EN 442, ΔT 50 K) and exponent n from the technical catalogues (per element for
// Charleston / Clinic / Nova Jet vertikal, per 1000 mm for Nova Jet horizontal, per radiator for Charleston Turned);
// article number = head article + length in mm (5 digits) of the ZehnderHK IGH catalogue (${zehnder.file}).
// Armatures: Meier Tobler IGH catalogue (${mt.file}).

export type RadiatorUnit = "element" | "length" | "fixed";
export type RadiatorModel = {
  code: string;
  /** Nova Jet type (ZNXH, ZNXHL …) or Charleston columns. */
  type?: string;
  columns?: number;
  height: number;
  /** Turned: fixed length [mm]. */
  length?: number;
  hub?: number;
  depth?: number;
  water?: number | null;
  /** Φ50 [W] per element, per 1000 mm or per radiator (unit of the series). */
  phi50: number;
  n: number;
  head: string;
  /** Available element counts (unit element) or lengths [mm] (unit length / fixed). */
  sizes: number[];
};
export type RadiatorSeries = {
  key: "charleston" | "clinic" | "turned" | "novaJetH" | "novaJetV";
  name: string;
  unit: RadiatorUnit;
  /** Length of an element radiator = base + pitch × elements [mm]. */
  pitch?: number;
  base?: number;
  source: string;
  models: RadiatorModel[];
};

export type ValveForm = "eck" | "durchgang" | "axial" | "winkeleckL" | "winkeleckR";
export type MtArticle = { number: string; text: string };

export const radiatorSeries: RadiatorSeries[] = ${JSON.stringify(series)};

export const thermoValves: (MtArticle & { series: "a" | "av9" | "aq"; form: ValveForm; dn: number })[] = ${JSON.stringify(thermoValves, null, 1)};

export const returnValves: (MtArticle & { model: "combi2" | "combi3" | "combi4"; form: "eck" | "durchgang"; dn: number })[] = ${JSON.stringify(returnValves, null, 1)};

export const thermostatHeads: MtArticle[] = ${JSON.stringify(heads, null, 1)};

export const valveBlocks: (MtArticle & { form: "eck" | "durchgang" })[] = ${JSON.stringify(valveBlocks, null, 1)};

export const ventValves: (MtArticle & { dn: number | null })[] = ${JSON.stringify(vents, null, 1)};

export const drainCocks: (MtArticle & { dn: number | null })[] = ${JSON.stringify(drains, null, 1)};

export const drainTool: MtArticle | null = ${JSON.stringify(drainTool ? { number: drainTool.number, text: drainTool.text } : null)};
`;
fs.writeFileSync(out, ts);
console.log(`wrote ${path.relative(root, out)} (${Math.round(ts.length / 1024)} KB)`);
