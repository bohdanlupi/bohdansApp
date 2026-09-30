// Generates src/lib/sanitary/catalog-data.ts from the IGH catalogues in the database: the Nussbaum articles the
// Sanitär module uses (Optipress-Aquaplus / Optiflex-Flowpress pipes and valves, Zentrale, water treatment) and the
// Biral hot-water circulation pumps (CompAX BLUE, ModulA BLUE). Each article gets its size as printed at the end of
// the catalogue text («…, 22», «…, ¾», «…, 16x3.8»).
// Usage (needs .env): node --env-file=.env scripts/gen-nussbaum-data.mjs
// Family codes and article numbers are referenced by saved systems: keep the output stable.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "src", "lib", "sanitary", "catalog-data.ts");

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
  global: { headers: { "User-Agent": "lupi-cli/1.0" } },
});

/** Nussbaum families (article number before the dot) and what they are in the schema. */
const families = {
  "81082": "Optipress-Edelstahlrohr 1.4521, Stange à 6 m",
  "87153": "Optiflex-Flowpress-Rohr formstabil",
  "82200": "Optipress-Aquaplus-Schrägsitzventil",
  "82202": "Optipress-Aquaplus-Schrägsitzventil, mit Entleerventil",
  "81163": "Optipress-A-Rückflussverhinderer EA",
  "86510": "Optiflex-Flowpress-Schrägsitzventil",
  "15101": "Rückflussverhinderer EA (Gewinde, für Optiflex-Flowpress mit Übergängen)",
  "36030": "Zirkulationsventil, mit Durchflussregulierung selbstständig",
  "24026": "Regulierventil, mit Innengewinde",
  "82232": "Optipress-Aquaplus-Batterieventil, mit Optipress-A-Anschlussverschraubung",
  "18102": "Feinfilter rückspülbar, mit Optipress-A-Anschlussverschraubung",
  "12102": "Redfil rückspülbar, mit Optipress-A-Anschlussverschraubung",
  "11002": "Druckreduzierventil mit OP-A-Verschraubung",
  "81168": "OP-A-Absperr-Sicherheitsgarnitur SW, zu Stand-Wassererwärmer",
  "19051": "Wasserenthärter Aquapro-Vita Compact",
  "19053": "Wasserenthärter Aquapro-Vita",
  "67100": "Rohbauset, für Messkapsel Koax",
  "81018": "Optipress-Aquaplus-Temperaturmessstelle, für gedämmte Leitungen",
  // Fittings of the material list (Rohre): bends, T-pieces, reducers, couplings, transitions, manifolds.
  "80000": "Optipress-Aquaplus-Bogen 90°",
  "80003": "Optipress-Aquaplus-Bogen 45°",
  "80010": "Optipress-Aquaplus-T-Stück",
  "81010": "Optipress-Aquaplus-T-Stück",
  "80020": "Optipress-Aquaplus-Muffe",
  "80021": "Optipress-Aquaplus-Reduktion, mit Einsteckende",
  "81021": "Optipress-Aquaplus-Reduktion, mit Einsteckende",
  "80033": "Optipress-Aquaplus-Übergang, mit Innengewinde",
  "84240": "Optiflex-Flowpress-Bogen 90°",
  "84241": "Optiflex-Flowpress-Bogen 45°",
  "84242": "Optiflex-Flowpress-T-Stück",
  "84236": "Optiflex-Flowpress-Kupplung",
  "84234": "Optiflex-Flowpress-Übergang, auf Optipress-Aquaplus",
  "84250": "Optiflex-Flowpress-Verteileranschluss",
  "84260": "Optiflex-Flowpress-Verteiler, 2-fach",
  "84261": "Optiflex-Flowpress-Verteiler, 3-/4-fach",
};

async function catalogId(pattern) {
  const { data, error } = await supabase.from("catalogs").select("id").eq("source", "igh").ilike("name", pattern).single();
  if (error) throw error;
  return data.id;
}

async function positions(catalog, filter) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(supabase.from("catalog_nodes").select("article_number, short_text").eq("catalog_id", catalog).eq("kind", "position"))
      .order("article_number")
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();

const nussbaum = await catalogId("%nussbaum%");
const articles = {};
for (const family of Object.keys(families)) {
  const rows = await positions(nussbaum, (q) => q.like("article_number", `${family}.%`));
  articles[family] = rows
    .map((r) => {
      const text = clean(r.short_text?.de);
      // Size: the last comma-separated part when it is a dimension («22», «20 (¾)», «¾», «28 x 22», «50 HF»).
      const last = text.split(",").pop().trim();
      const size = /^[\d¼½¾⅜]/.test(last) ? last : null;
      return { number: r.article_number, size, text };
    })
    .filter((a) => a.text);
}

const biral = await catalogId("%biral%");
const pumpRows = await positions(biral, (q) => q.ilike("search_text", "%blue%"));
const pumps = pumpRows
  .map((r) => {
    const text = clean(r.short_text?.de).replace(/^BIRAL Brauchwasser-Umwälzpumpe\s*/i, "");
    const m = /^(CompAX|ModulA) (\d+)-(\d+(?:\.\d+)?) (\d+) BLUE( RV KH)?/.exec(text);
    if (!m) return null;
    return { number: r.article_number, name: text, series: m[1], dn: Number(m[2]), head: Number(m[3]), length: Number(m[4]), valves: !!m[5] };
  })
  .filter(Boolean)
  .sort((a, b) => a.head - b.head || a.dn - b.dn || a.number.localeCompare(b.number));

const banner = `// Generated by scripts/gen-nussbaum-data.mjs from the IGH catalogues (R. Nussbaum AG, Biral AG) – do not edit.\n\n`;
const body =
  `export type CatalogArticle = { number: string; size: string | null; text: string };\n\n` +
  `/** Nussbaum articles by family (article number before the dot). */\n` +
  `export const nussbaumFamilies = ${JSON.stringify(families, null, 2)} as const;\n\n` +
  `export type NussbaumFamily = keyof typeof nussbaumFamilies;\n\n` +
  `export const nussbaumArticles: Record<NussbaumFamily, CatalogArticle[]> = ${JSON.stringify(articles, null, 2)};\n\n` +
  `/** Biral hot-water circulation pumps: series, connection DN, max. head [m] (from the type name), length [mm]; «valves»: with check valve and ball valve (RV KH). */\n` +
  `export type BiralPump = { number: string; name: string; series: string; dn: number; head: number; length: number; valves: boolean };\n\n` +
  `export const biralPumps: BiralPump[] = ${JSON.stringify(pumps, null, 2)};\n`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, banner + body);
console.log(`wrote ${path.relative(root, out)}: ${Object.values(articles).reduce((s, a) => s + a.length, 0)} Nussbaum articles, ${pumps.length} Biral pumps`);
