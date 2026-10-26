// Generates src/lib/building/sia3801-data.ts from the licensed sources in Berechnungsvorlagen/ (gitignored):
//  - climate set «SIA 2028:2010»: sheet «Klima» of 19_sia_380-1_2016_-win-10_1_12.xlsx (41 stations: altitude, monthly
//    θe and global radiation S / O / W / N / horizontal in MJ/m², annual mean, design temperature);
//  - climate set «SIA 4028» (draft): prSIA4028 Kompaktdaten – Tabelle 4 Monatswerte (θe, radiation horizontal / E / S /
//    W / N in MJ/m²), Tabelle 1 Stationen (altitude), Tabelle 7 Winterauslegung (4-day cold design temperature);
//  - shading factors f_s1 (Horizont), f_s2 (Überhang), f_s3 (Seitenblende) by angle and 13 orientation groups, and the
//    Standardnutzung values of the 12 Gebäudekategorien (sheet «Daten»).
// Run: node scripts/gen-sia3801-data.mjs
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { strFromU8, unzipSync } from "fflate";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const EXCEL = path.join(root, "Berechnungsvorlagen/Heizung/19_sia_380-1_2016_-win-10_1_12.xlsx");
const KOMPAKT = path.join(root, "Berechnungsvorlagen/SIA/SIA_MB_4028/prSIA4028 Kompaktdaten_0 (1).xlsx");
const OUT = path.join(root, "src/lib/building/sia3801-data.ts");

/** Minimal xlsx reader: sheet name → Map("A1" → value). */
function readWorkbook(file) {
  const z = unzipSync(readFileSync(file));
  const wb = strFromU8(z["xl/workbook.xml"]);
  const rels = strFromU8(z["xl/_rels/workbook.xml.rels"]);
  const relmap = {};
  for (const m of rels.matchAll(/<Relationship [^>]*>/g)) relmap[/Id="([^"]+)"/.exec(m[0])[1]] = /Target="([^"]+)"/.exec(m[0])[1];
  const shared = [];
  const sx = z["xl/sharedStrings.xml"] ? strFromU8(z["xl/sharedStrings.xml"]) : "";
  for (const m of sx.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push([...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join(""));
  const dec = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  const sheets = new Map();
  for (const m of wb.matchAll(/<sheet [^>]*>/g)) {
    const name = dec(/name="([^"]+)"/.exec(m[0])[1]);
    const target = "xl/" + relmap[/r:id="([^"]+)"/.exec(m[0])[1]].replace(/^\/?xl\//, "");
    const xml = strFromU8(z[target]);
    const cells = new Map();
    for (const c of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const t = /t="([^"]+)"/.exec(c[2])?.[1];
      const v = /<v>([^<]*)<\/v>/.exec(c[3] ?? "")?.[1];
      if (v === undefined) continue;
      cells.set(c[1], t === "s" ? dec(shared[+v]) : t === "str" ? dec(v) : Number(v));
    }
    sheets.set(name, cells);
  }
  return sheets;
}

const col = (i) => {
  let s = "";
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s;
  return s;
};
const colIndex = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
// Numbers, also when a sheet stores them as text (the 4028 Monatswerte do).
const num = (v) => {
  if (typeof v === "string") v = v.trim() === "" ? NaN : Number(v.replace(",", "."));
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

// --- SIA 2028:2010 from the Excel --------------------------------------------------------------------------------
const excel = readWorkbook(EXCEL);
const klima = excel.get("Klima");
const stations2028 = [];
for (let row = 4; row <= 44; row++) {
  const name = klima.get(`B${row}`);
  if (typeof name !== "string" || !name) continue;
  const months = [];
  for (let m = 0; m < 12; m++) {
    const base = colIndex("D") + m * 6; // Januar | S | O | W | N | H
    const g = (k) => num(klima.get(`${col(base + k)}${row}`));
    months.push({ theta: g(0), s: g(1), e: g(2), w: g(3), n: g(4), h: g(5) });
  }
  stations2028.push({ name, altitude: num(klima.get(`C${row}`)), thetaMean: num(klima.get(`BX${row}`)), thetaDesign: num(klima.get(`BY${row}`)), months });
}

// --- prSIA 4028 from the Kompaktdaten ----------------------------------------------------------------------------
const kompakt = readWorkbook(KOMPAKT);
const t1 = kompakt.get("Tabelle 1 Stationen");
// Stations are matched by their abbreviation (names differ between the tables).
const altitude = new Map();
for (let row = 2; row <= 60; row++) {
  const abbr = t1.get(`B${row}`);
  if (typeof abbr === "string" && abbr) altitude.set(abbr, num(t1.get(`F${row}`)));
}
const t2 = kompakt.get("Tabelle 2 Stadtsationen");
for (let row = 2; row <= 10; row++) {
  const abbr = t2.get(`B${row}`);
  if (typeof abbr === "string" && abbr) altitude.set(abbr, num(t2.get(`E${row}`)));
}
const t7 = kompakt.get("Tabelle 7 Winterauslegung");
const design = new Map();
for (let row = 4; row <= 70; row++) {
  const abbr = t7.get(`B${row}`);
  if (typeof abbr === "string" && abbr) design.set(abbr, num(t7.get(`C${row}`)));
}
const t4 = kompakt.get("Tabelle 4 Monatswerte");
const stations4028 = [];
// Blocks of 12 rows per station (name, header, θ, horizontal, E, S, W, N, …), with group titles in between.
for (let row = 2; row <= 760; row++) {
  const name = t4.get(`A${row}`);
  if (typeof name !== "string" || !name || t4.get(`A${row + 2}`) !== "Lufttemperatur, Mittelwert") continue;
  const abbr = [t4.get(`J${row}`), t4.get(`H${row}`), t4.get(`I${row}`)].find((v) => typeof v === "string" && v) ?? name;
  const rowOf = { theta: row + 2, h: row + 3, e: row + 4, s: row + 5, w: row + 6, n: row + 7 };
  if (t4.get(`J${rowOf.h}`) !== "horizontal" || t4.get(`J${rowOf.s}`) !== "S") throw new Error(`unexpected layout at row ${row} (${name})`);
  const months = [];
  for (let m = 0; m < 12; m++) {
    const c = col(colIndex("L") + m);
    months.push({ theta: num(t4.get(`${c}${rowOf.theta}`)), s: num(t4.get(`${c}${rowOf.s}`)), e: num(t4.get(`${c}${rowOf.e}`)), w: num(t4.get(`${c}${rowOf.w}`)), n: num(t4.get(`${c}${rowOf.n}`)), h: num(t4.get(`${c}${rowOf.h}`)) });
  }
  stations4028.push({ name, altitude: altitude.get(abbr) ?? null, thetaMean: num(t4.get(`X${rowOf.theta}`)), thetaDesign: design.get(abbr) ?? null, months });
}

// --- shading tables and Standardnutzung from «Daten» --------------------------------------------------------------
const daten = excel.get("Daten");
const groups = ["SW/SO", "SSO", "S", "SSW", "WSW", "W/O", "WNW", "NW/NO", "NNW", "N", "NNO", "ONO", "OSO"];
const table = (firstRow, lastRow) => {
  const rows = [];
  for (let row = firstRow; row <= lastRow; row++) {
    const angle = num(daten.get(`A${row}`));
    if (angle === null) break;
    rows.push(groups.map((_, i) => num(daten.get(`${col(1 + i)}${row}`)) ?? 1));
  }
  return rows;
};
const horizon = table(101, 171);
const overhang = table(177, 252);
const fin = table(258, 333);

const categories = [];
for (let row = 5; row <= 16; row++) {
  const label = daten.get(`N${row}`);
  const g = (c) => num(daten.get(`${c}${row}`));
  categories.push({ label, thetaInt: g("B"), personArea: g("C"), personHeat: g("D"), presence: g("E"), electricity: g("F"), fEl: g("G"), airflow: g("H"), qhLi0: g("I"), dQhLi: g("J"), hotWater: g("K"), tau0: g("L"), a0: g("M"), phLi: g("P") });
}

const out = `// GENERATED by scripts/gen-sia3801-data.mjs – do not edit.
// Climate sets for SIA 380/1 (monthly θe [°C] and global radiation [MJ/m²] on S / E / W / N vertical and horizontal),
// shading factors of the Martinelli + Menti 380/1 tool (f_s1 Horizont 0–${horizon.length - 1}°, f_s2 Überhang 0–${overhang.length - 1}°, f_s3 Seitenblende
// 0–${fin.length - 1}°, 13 orientation groups) and the Standardnutzung of the 12 Gebäudekategorien (SIA 380/1:2016).

export type ClimateMonth = { theta: number | null; s: number | null; e: number | null; w: number | null; n: number | null; h: number | null };
export type ClimateStationData = { name: string; altitude: number | null; thetaMean: number | null; thetaDesign: number | null; months: ClimateMonth[] };

export const climateSets = {
  sia2028: ${JSON.stringify(stations2028)},
  sia4028: ${JSON.stringify(stations4028)},
} as const satisfies Record<string, readonly ClimateStationData[]>;

/** Orientation groups of the shading tables (columns). */
export const shadingGroups = ${JSON.stringify(groups)} as const;
/** f_s1 by horizon angle [°] (row index) and orientation group (column). */
export const horizonFactors: readonly (readonly number[])[] = ${JSON.stringify(horizon)};
/** f_s2 by overhang angle. */
export const overhangFactors: readonly (readonly number[])[] = ${JSON.stringify(overhang)};
/** f_s3 by side fin angle. */
export const finFactors: readonly (readonly number[])[] = ${JSON.stringify(fin)};

export type UsageCategory = {
  label: string;
  thetaInt: number | null;
  /** Personenfläche [m²/P], sensible heat per person [W/P], presence [h/d]. */
  personArea: number | null;
  personHeat: number | null;
  presence: number | null;
  /** Electricity [kWh/m²a] and its reduction factor f_el. */
  electricity: number | null;
  fEl: number | null;
  /** Aussenluft-Volumenstrom [m³/(h m²)]. */
  airflow: number | null;
  /** Grenzwert Q_H,li0 and slope ΔQ_H,li [kWh/m²]. */
  qhLi0: number | null;
  dQhLi: number | null;
  hotWater: number | null;
  tau0: number | null;
  a0: number | null;
  /** Grenzwert spezifische Heizlast Ph,li [W/m²] (SIA 384/3), null where none. */
  phLi: number | null;
};

export const usageCategoryKeys = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"] as const;
export const usageCategories: Record<(typeof usageCategoryKeys)[number], UsageCategory> = {
${categories.map((c, i) => `  ${["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"][i]}: ${JSON.stringify(c)},`).join("\n")}
};
`;
writeFileSync(OUT, out);
console.log(`wrote ${OUT}: ${stations2028.length} stations 2028, ${stations4028.length} stations 4028, shading ${horizon.length}/${overhang.length}/${fin.length} rows, ${categories.length} categories`);
