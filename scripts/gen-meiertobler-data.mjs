// Generates src/lib/kwl/meiertobler-data.ts from the Meier Tobler IGH catalogue in the database (spiro pipes and
// fittings of the group "Lüftung Spirorohre und Formstücke"). Meier Tobler publishes no pressure-drop diagrams for
// these parts: pipes are calculated with Darcy–Weisbach (galvanised steel), fittings with loss coefficients ζ
// (reference values for round spiro fittings, related to the velocity in the connection diameter).
// Usage (needs .env): node --env-file=.env scripts/gen-meiertobler-data.mjs
// Product keys are referenced by saved networks: keep the naming stable.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "src", "lib", "kwl", "meiertobler-data.ts");

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
  global: { headers: { "User-Agent": "lupi-cli/1.0" } },
});

const { data: catalog, error } = await supabase.from("catalogs").select("id").eq("source", "igh").ilike("name", "%meier tobler%").single();
if (error) throw error;

const rows = [];
for (const prefix of ["KL310.", "01905.7"]) {
  for (let from = 0; ; from += 1000) {
    const { data, error: e } = await supabase
      .from("catalog_nodes")
      .select("article_number, short_text")
      .eq("catalog_id", catalog.id)
      .eq("kind", "position")
      .like("article_number", `${prefix}%`)
      .order("article_number")
      .range(from, from + 999);
    if (e) throw e;
    rows.push(...data);
    if (data.length < 1000) break;
  }
}

// ζ reference values (pressed spiro bends R ≈ 1·d, segment bends, branch of T-pieces at the main velocity).
const bendZeta = {
  Spirobogen: { 15: 0.06, 30: 0.12, 45: 0.18, 60: 0.24, 90: 0.3 },
  Segmentbogen: { 15: 0.07, 30: 0.14, 45: 0.21, 60: 0.28, 90: 0.35 },
  "Kurz Segmentbogen": { 90: 0.5 },
};

const n = (s) => Number(s);
const rules = [
  [/MT Spirorohr (\d+) ?mm à 3 ?m/, (m) => ({ kind: "duct", family: "Spirorohre", name: `Spirorohr DN ${n(m[1])} (à 3 m)`, d: n(m[1]), material: "steel", lvPiece: 3 })],
  [/(Kurz Segmentbogen|Segmentbogen|Spirobogen) (\d+)° mit Dichtung (\d+) ?mm/, (m) => ({ kind: "fitting", fitting: "bend", family: "Bogen", name: `${m[1]} ${n(m[2])}° DN ${n(m[3])}`, d: n(m[3]), zeta: bendZeta[m[1]]?.[n(m[2])] ?? 0.3 })],
  [/Spiro-Etagenbogen (\d+) ?mm/, (m) => ({ kind: "fitting", fitting: "bend", family: "Bogen", name: `Etagenbogen DN ${n(m[1])}`, d: n(m[1]), zeta: 0.4 })],
  [/Schalungsknie 90° mit Dichtung (\d+) ?mm/, (m) => ({ kind: "fitting", fitting: "bend", family: "Bogen", name: `Schalungsknie 90° DN ${n(m[1])}`, d: n(m[1]), zeta: 0.8 })],
  [/T-Stück (45|90)° mit Dichtung (\d+)-(\d+) ?mm/, (m) => ({ kind: "fitting", fitting: "tee", family: "T-Stücke", name: `T-Stück ${m[1]}° DN ${n(m[2])}/${n(m[3])}`, d: n(m[2]), zeta: m[1] === "45" ? 0.5 : 1.0 })],
  [/Sattelstück mit Dichtung (\d+)-(\d+) ?mm/, (m) => ({ kind: "fitting", fitting: "tee", family: "Sattelstücke", name: `Sattelstück DN ${n(m[1])}/${n(m[2])}`, d: n(m[1]), zeta: 1.0 })],
  [/Reduktion (asymetrisch|zentriert) mit Dichtung (\d+)-(\d+) ?mm/, (m) => ({ kind: "fitting", fitting: "reducer", family: "Reduktionen", name: `Reduktion ${m[1] === "zentriert" ? "zentrisch" : "asymmetrisch"} DN ${n(m[2])}/${n(m[3])}`, d: n(m[3]), zeta: 0.1 })],
  [/Verbindungs-Muffe (\d+) ?mm/, (m) => ({ kind: "fitting", fitting: "joint", family: "Verbindungen", name: `Verbindungsmuffe DN ${n(m[1])}`, d: n(m[1]), zeta: 0 })],
  [/Schiebemuffe mit Dichtung (\d+)-(\d+) ?mm/, (m) => ({ kind: "fitting", fitting: "joint", family: "Verbindungen", name: `Schiebemuffe DN ${n(m[1])}, L ${n(m[2])} mm`, d: n(m[1]), zeta: 0 })],
  [/Schiebenippel mit Dichtung (\d+)-(\d+) ?mm/, (m) => ({ kind: "fitting", fitting: "joint", family: "Verbindungen", name: `Schiebenippel DN ${n(m[1])}, L ${n(m[2])} mm`, d: n(m[1]), zeta: 0 })],
  [/Verbindungsrohr für Formstück (\d+) ?mm/, (m) => ({ kind: "fitting", fitting: "joint", family: "Verbindungen", name: `Verbindungsrohr für Formstück DN ${n(m[1])}`, d: n(m[1]), zeta: 0 })],
  [/Spiro-Stutzen mit Bord mit Dichtung (\d+) ?mm/, (m) => ({ kind: "fitting", fitting: "joint", family: "Verbindungen", name: `Stutzen mit Bord DN ${n(m[1])}`, d: n(m[1]), zeta: 0 })],
  [/Rohrabschlussdeckel mit Dichtung (\d+) ?mm/, (m) => ({ kind: "fitting", fitting: "cap", family: "Deckel", name: `Rohrabschlussdeckel DN ${n(m[1])}`, d: n(m[1]), zeta: 0 })],
  [/Absperrklappe mit Dichtung (\d+) ?mm/, (m) => ({ kind: "valve", family: "Absperrklappen", name: `Absperrklappe DN ${n(m[1])}`, d: n(m[1]), zeta: 0.2 })],
  [/Rohrschalldämpfer Isol 50mm, L1000mm (\d+) ?mm/, (m) => ({ kind: "silencer", family: "Schalldämpfer", name: `Rohrschalldämpfer isoliert 50 mm, L 1000 mm, DN ${n(m[1])}`, d: n(m[1]), zeta: 0.15 })],
];

const products = new Map();
for (const r of rows) {
  const text = (r.short_text?.de ?? "").replace(/\s+/g, " ").trim();
  if (/lindab/i.test(text)) continue;
  for (const [re, make] of rules) {
    const m = re.exec(text);
    if (!m) continue;
    const p = make(m);
    const key = `meiertobler-${p.name
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}`;
    if (products.has(key)) break; // duplicate catalogue entries (e.g. Etagenbogen twice)
    const product = {
      key,
      manufacturer: "Meier Tobler",
      name: p.name,
      family: p.family,
      kind: p.kind,
      curves: [],
      inner: { diameter: p.d },
      articles: [{ number: r.article_number, text }],
      source: { file: "IGH-Katalog Meier Tobler AG – Haustechniksysteme" },
    };
    if (p.fitting) product.fitting = p.fitting;
    if (p.zeta !== undefined) product.zeta = p.zeta;
    if (p.material) product.material = p.material;
    if (p.lvPiece) product.lvPiece = p.lvPiece;
    products.set(key, product);
    break;
  }
}

const familyOrder = ["Spirorohre", "Bogen", "T-Stücke", "Sattelstücke", "Reduktionen", "Verbindungen", "Deckel", "Absperrklappen", "Schalldämpfer"];
const list = [...products.values()].sort(
  (a, b) =>
    familyOrder.indexOf(a.family) - familyOrder.indexOf(b.family) ||
    a.name.replace(/DN .*/, "").localeCompare(b.name.replace(/DN .*/, "")) ||
    a.inner.diameter - b.inner.diameter ||
    a.name.localeCompare(b.name, "de", { numeric: true }),
);

fs.writeFileSync(
  out,
  `// Generated by scripts/gen-meiertobler-data.mjs from the Meier Tobler IGH catalogue (spiro pipes and fittings).
// No manufacturer pressure-drop data: pipes by Darcy–Weisbach (steel), fittings by reference loss coefficients ζ.
// Do not edit by hand.

import type { Product } from "./products";

export const meierToblerProducts: Product[] = [
${list.map((p) => "  " + JSON.stringify(p)).join(",\n")},
];
`,
);
const count = {};
for (const p of list) count[p.family] = (count[p.family] || 0) + 1;
console.log(list.length, "products", count);
