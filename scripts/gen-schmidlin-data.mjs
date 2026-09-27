// Schmidlin AG price book «Komponenten» (PDF, list 01.2014 with the price adjustment on its cover page) → supplier
// catalogue with prices in the database, and src/lib/kwl/schmidlin-data.ts with the parts offered at the end of
// the outdoor / exhaust air in the network (rain caps, louvred and column caps, weather protection grilles).
// The PDF tables are read by the x position of the text items (pdf.js), so every price lands in its column.
// Schmidlin publishes no pressure-drop data: the network uses reference loss coefficients ζ.
//
// Usage: node scripts/gen-schmidlin-data.mjs [--import] [file.pdf]
//   without --import only the TS file is written; --import also replaces the catalogue (needs .env).
// The price book is licensed supplier data: the PDF and the prices stay out of the (public) repository.
// Article numbers are made up from code, size, variant and material, and referenced by saved networks: keep them.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "src", "lib", "kwl", "schmidlin-data.ts");
const doImport = process.argv.includes("--import");
const file =
  process.argv.slice(2).find((a) => !a.startsWith("--")) ??
  path.join(root, "Berechnungsvorlagen", "Lüftung KWL", "Schmidlin", "preisbuch_komponenten_07_2026_2.pdf");

/** Price adjustment on the cover page: «Preisanpassung Komponenten + 20 % ab dem 01.07.2026». */
const adjustment = 1.2;
const validFrom = "2026-07-01";
const sourceFile = "Schmidlin AG, Preisbuch Komponenten 01.2014 (+20 % ab 01.07.2026)";

// ---------------------------------------------------------------------------
// PDF → rows of text items
// ---------------------------------------------------------------------------

const doc = await getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }).promise;

/** Text items of a page grouped into rows (top first), each item with its right edge x2. */
async function pageRows(n) {
  const { items } = await (await doc.getPage(n)).getTextContent();
  const words = items
    .filter((i) => i.str.trim())
    .map((i) => ({ t: i.str.trim(), x2: i.transform[4] + i.width, y: -i.transform[5] }))
    .sort((a, b) => a.y - b.y || a.x2 - b.x2);
  const rows = [];
  for (const w of words) {
    const row = rows.find((r) => Math.abs(r.y - w.y) < 2.5);
    if (row) row.items.push(w);
    else rows.push({ y: w.y, items: [w] });
  }
  for (const r of rows) r.items.sort((a, b) => a.x2 - b.x2);
  return rows;
}

const isPrice = (t) => /^\d+(\.\d\d|\.–)$/.test(t);
const priceOf = (t) => Number(t.replace(".–", ""));
const isNumber = (t) => /^\d+$/.test(t);
/** Row label in the first column (size / height b). */
const label = (row) => (row.items[0] && row.items[0].x2 < 70 && isNumber(row.items[0].t) ? Number(row.items[0].t) : null);

const materials = {
  VZ: { de: "Stahlblech sendzimirverzinkt", fr: "tôle galvanisée sendzimir", short: "verzinkt" },
  AL: { de: "Aluminium", fr: "aluminium", short: "Alu" },
  V2A: { de: "Chromstahl 1.4301 (V2A)", fr: "acier inoxydable 1.4301 (V2A)", short: "V2A" },
  V4A: { de: "Chromstahl 1.4404 (V4A)", fr: "acier inoxydable 1.4404 (V4A)", short: "V4A" },
};

/** Material of a matrix page: the label next to the drawing at the top. */
function pageMaterial(rows) {
  const text = rows
    .filter((r) => r.y < -600)
    .map((r) => r.items.map((i) => i.t).join(" "))
    .join(" ");
  if (/verzinkt/.test(text)) return "VZ";
  if (/1\.4404/.test(text)) return "V4A";
  if (/1\.4301/.test(text)) return "V2A";
  if (/Aluminium/.test(text)) return "AL";
  throw new Error("material not found");
}

/** Table with one row per diameter and fixed price columns; the numbers after the prices are returned as extras. */
async function diameterTable(page, columns) {
  const rows = await pageRows(page);
  const out = [];
  for (const row of rows) {
    const d = label(row);
    if (d === null) continue;
    const cells = row.items.slice(1);
    const prices = cells.filter((c) => isPrice(c.t)).map((c) => priceOf(c.t));
    if (!prices.length) continue;
    if (prices.length !== columns.length) throw new Error(`page ${page}, Ø ${d}: ${prices.length} prices for ${columns.length} columns`);
    const extras = cells.filter((c) => !isPrice(c.t)).map((c) => c.t);
    columns.forEach((col, i) => out.push({ d, ...col, price: prices[i], extras, page }));
  }
  if (!out.length) throw new Error(`page ${page}: no rows`);
  return out;
}

/** Price matrix: widths a in the header row, heights b in the first column. */
async function matrix(page) {
  const rows = await pageRows(page);
  const material = pageMaterial(rows);
  const aIndex = rows.findIndex((r) => r.items[0]?.t === "a" && r.items[0].x2 < 70);
  const header = rows[aIndex + 1].items.filter((i) => isNumber(i.t));
  const bIndex = rows.findIndex((r, i) => i > aIndex && r.items[0]?.t === "b");
  const out = [];
  for (const row of rows.slice(bIndex + 1)) {
    if (row.items[0]?.t === "Preise") break;
    const b = label(row);
    if (b === null) continue;
    for (const cell of row.items.slice(1)) {
      if (!isPrice(cell.t)) throw new Error(`page ${page}, b ${b}: unexpected «${cell.t}»`);
      const col = header.reduce((best, h) => (Math.abs(h.x2 - cell.x2) < Math.abs(best.x2 - cell.x2) ? h : best));
      if (Math.abs(col.x2 - cell.x2) > 12) throw new Error(`page ${page}, b ${b}: no column for ${cell.t}`);
      out.push({ a: Number(col.t), b, material, price: priceOf(cell.t), page });
    }
  }
  if (!out.length) throw new Error(`page ${page}: no rows`);
  return out;
}

// ---------------------------------------------------------------------------
// Product types
// ---------------------------------------------------------------------------

const exhaustOnly = { de: "Einsatz: nur für Fortluft", fr: "Usage : uniquement pour l’air d’échappement" };
const variants = {
  M: { de: "Ausführung M mit Anschlussnippel", fr: "exécution M avec manchon de raccord", short: "M (Anschlussnippel)" },
  R: { de: "Ausführung R mit Standrohr (inkl. 1 m Rohr)", fr: "exécution R avec tuyau (incl. 1 m)", short: "R (Standrohr)" },
};
const mr = (mats) => mats.flatMap((material) => ["M", "R"].map((variant) => ({ material, variant })));

/**
 * Types in catalogue order. `zeta`: reference loss coefficient at the connection (round) or the nominal area
 * (rectangular); `use`: exhaust-only parts; `network`: sizes offered in the network (the rest only in the catalogue).
 */
const types = [
  {
    key: "rhr", code: "080 RHR", title: { de: "Regenhut rund", fr: "Chapeau biconique rond" }, page: 21,
    columns: mr(["VZ", "AL", "V2A", "V4A"]), zeta: 1.0, use: "exhaust", notes: [exhaustOnly], network: (p) => p.d <= 315,
  },
  {
    key: "rhe", code: "262 RHE", title: { de: "Regenhut eckig", fr: "Chapeau biconique rectangulaire" }, pages: [23, 24, 25, 26],
    extra: { de: "inkl. 1 m Kanal", fr: "incl. 1 m de gaine" }, zeta: 1.0, use: "exhaust", notes: [exhaustOnly], network: (p) => p.a <= 500 && p.b <= 500,
  },
  {
    key: "lh", code: "280 LH", title: { de: "Lamellhut", fr: "Chapeau à lamelles" }, page: 27,
    columns: mr(["AL", "V2A", "V4A"]), zeta: 1.5, network: () => true,
    detail: (e) => ({ de: `${e[0]} Lamellen, h = ${e[1]} mm`, fr: `${e[0]} lamelles, h = ${e[1]} mm` }),
  },
  {
    key: "sh", code: "282 SH", title: { de: "Säulenhut", fr: "Chapeau à colonne" }, page: 29,
    columns: mr(["AL", "V2A", "V4A"]), zeta: 1.0, use: "exhaust", notes: [exhaustOnly], network: (p) => p.d <= 315,
    detail: (e) => ({ de: `${e[0]} Lamellen, h = ${e[1]} mm`, fr: `${e[0]} lamelles, h = ${e[1]} mm` }),
  },
  {
    key: "stp", code: "285 STP", title: { de: "Standrohr mit Grundplatte", fr: "Tuyau avec plaque de base" }, page: 30,
    columns: ["AL", "V2A", "V4A"].map((material) => ({ material })), extra: { de: "l = 500 mm, Zubehör zu Lamell- und Säulenhut", fr: "l = 500 mm, accessoire pour chapeau à lamelles et à colonne" },
  },
  {
    key: "ros", code: "285 ROS", title: { de: "Rosette montiert", fr: "Rosace montée" }, page: 31,
    columns: ["VZ", "AL", "V2A", "V4A"].map((material) => ({ material })), extra: { de: "Zubehör zu Regen-, Lamell- und Säulenhut", fr: "accessoire pour chapeau biconique, à lamelles et à colonne" },
  },
  {
    key: "wsr", code: "261 WS-R", title: { de: "Wetterschutzgitter rund", fr: "Grille pare-pluie ronde" }, page: 35,
    columns: ["AL", "V2A", "V4A"].map((material) => ({ material })), extra: { de: "Nennmass = Aussparung, mit Vogelschutzgitter", fr: "cote nominale = cavité, avec grille anti-oiseaux" },
    zeta: 3.0, network: (p) => p.d <= 315,
  },
  {
    key: "ws50", code: "260 WS 50", title: { de: "Wetterschutzgitter eckig WS-50", fr: "Grille pare-pluie rectangulaire WS-50" }, pages: [37, 38, 39, 40, 41, 42],
    extra: { de: "Teilung 50 mm, Nennmass = Aussparung, mit Vogelschutzgitter", fr: "division 50 mm, cote nominale = cavité, avec grille anti-oiseaux" },
    zeta: 3.0, network: (p) => p.a <= 500 && p.b <= 500,
  },
  {
    key: "ws150", code: "264.1 WS-150", title: { de: "Wetterschutzgitter eckig WS-150", fr: "Grille pare-pluie rectangulaire WS-150" }, pages: [44, 45],
    extra: { de: "Teilung 150 mm, Nennmass = Aussparung, mit Vogelschutzgitter", fr: "division 150 mm, cote nominale = cavité, avec grille anti-oiseaux" },
    zeta: 2.0, network: (p) => p.a <= 600 && p.b <= 600,
  },
  {
    key: "ws150sd", code: "264.2 WS-150 SD", title: { de: "Wetterschutzgitter eckig WS-150 SD", fr: "Grille pare-pluie rectangulaire WS-150 SD" }, pages: [46, 47],
    extra: { de: "Teilung 150 mm, Nennmass = Aussparung, mit Vogelschutzgitter", fr: "division 150 mm, cote nominale = cavité, avec grille anti-oiseaux" },
    zeta: 3.5, network: (p) => p.a <= 600 && p.b <= 600,
  },
  {
    key: "ws300sd", code: "264.3 WS-300 SD", title: { de: "Wetterschutzgitter eckig WS-300 SD", fr: "Grille pare-pluie rectangulaire WS-300 SD" }, pages: [48, 49],
    extra: { de: "Nennmass = Aussparung, mit Vogelschutzgitter", fr: "cote nominale = cavité, avec grille anti-oiseaux" },
    zeta: 3.5, network: (p) => p.a <= 600 && p.b <= 600,
  },
  {
    key: "wsh", code: "263 WSH", title: { de: "Wetterschutzgitter horizontal", fr: "Grille pare-pluie horizontale" }, pages: [51, 52, 53, 54, 55, 56],
    extra: { de: "Rahmen und Lamellen geschweisst, Nennmass = Aussparung, mit Vogelschutzgitter", fr: "cadre et lamelles soudés, cote nominale = cavité, avec grille anti-oiseaux" },
    zeta: 2.5, use: "exhaust", notes: [exhaustOnly], network: (p) => p.a <= 500 && p.b <= 500,
  },
];

const compact = (code) => code.replace(/[\s-]/g, "");
const size = (p) => (p.d ? `Ø ${p.d} mm` : `${p.a} × ${p.b} mm`);
const round05 = (v) => Math.round(v * 20) / 20;

const items = [];
for (const type of types) {
  const raw = type.pages
    ? (await Promise.all(type.pages.map(matrix))).flat()
    : await diameterTable(type.page, type.columns);
  // A size may be listed twice (matrix split over two pages): keep the first.
  const seen = new Set();
  for (const p of raw) {
    const article = [compact(type.code), p.d ?? `${p.a}x${p.b}`, p.variant, p.material].filter(Boolean).join("-");
    if (seen.has(article)) continue;
    seen.add(article);
    const mat = materials[p.material];
    const variant = p.variant ? variants[p.variant] : null;
    const detail = type.detail?.(p.extras);
    const text = (l) => [`${type.title[l]} ${size(p)}`, variant?.[l], type.extra?.[l], mat[l]].filter(Boolean).join(", ");
    items.push({
      type,
      article,
      size: p.d ? { diameter: p.d } : { width: p.a, height: p.b },
      material: p.material,
      variant: p.variant ?? null,
      short: { de: text("de"), fr: text("fr") },
      long: {
        de: [`Code ${type.code}`, detail?.de, ...(type.notes ?? []).map((n) => n.de)].filter(Boolean).join("\n"),
        fr: [`Code ${type.code}`, detail?.fr, ...(type.notes ?? []).map((n) => n.fr)].filter(Boolean).join("\n"),
      },
      price: round05(p.price * adjustment),
      page: p.page,
      inNetwork: !!type.network?.({ d: p.d, a: p.a, b: p.b }),
    });
  }
}

// ---------------------------------------------------------------------------
// Network products (no prices)
// ---------------------------------------------------------------------------

const products = items
  .filter((i) => i.inNetwork)
  .map((i) => {
    const product = {
      key: `schmidlin-${i.article.toLowerCase().replace(/\./g, "-")}`,
      manufacturer: "Schmidlin",
      name: [`${i.type.title.de} ${i.size.diameter ? `Ø ${i.size.diameter}` : `${i.size.width} × ${i.size.height}`}`, i.variant && variants[i.variant].short, materials[i.material].short]
        .filter(Boolean)
        .join(", "),
      family: `${i.type.title.de} (${i.type.code})`,
      kind: "grille",
      curves: [],
      inner: i.size,
      zeta: i.type.zeta,
      articles: [{ number: i.article, text: i.short.de }],
      source: { file: sourceFile, page: i.page },
      notes: "ζ Richtwert (keine Herstellerangabe zum Druckverlust)",
    };
    if (i.type.use) product.use = i.type.use;
    return product;
  });

writeFileSync(
  out,
  `// Generated by scripts/gen-schmidlin-data.mjs from the Schmidlin AG price book «Komponenten» (prices only in the
// database catalogue). Parts at the end of the outdoor / exhaust air; no pressure-drop data from Schmidlin, so the
// network uses reference loss coefficients ζ. Do not edit by hand.

import type { Product } from "./products";

export const schmidlinProducts: Product[] = [
${products.map((p) => "  " + JSON.stringify(p)).join(",\n")},
];
`,
);
if (process.argv.includes("--list")) for (const i of items) console.log(`${i.article}\t${i.price.toFixed(2)}\t${i.short.de}`);
const count = (list, by) => list.reduce((m, x) => ((m[by(x)] = (m[by(x)] ?? 0) + 1), m), {});
console.log(`${items.length} catalogue positions`, count(items, (i) => i.type.code));
console.log(`${products.length} network products`, count(products, (p) => p.family));

// ---------------------------------------------------------------------------
// Catalogue import (PostgREST with the secret key; bypasses RLS)
// ---------------------------------------------------------------------------

if (doImport) {
  const env = Object.fromEntries(
    readFileSync(path.join(root, ".env"), "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.trim().replace(/^["']|["']$/g, "")]),
  );
  const rest = async (url, { method = "GET", body, prefer } = {}) => {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${url}`, {
      method,
      headers: { apikey: env.SUPABASE_SECRET_KEY, "Content-Type": "application/json", "User-Agent": "lupi-cli/1.0", ...(prefer && { Prefer: prefer }) },
      body: body && JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${method} ${url.split("?")[0]}: ${res.status} ${await res.text()}`);
    return res.status === 204 || prefer?.includes("return=minimal") ? null : res.json();
  };

  const externalKey = "pricebook:schmidlin:komponenten";
  const meta = {
    source: "pricebook",
    supplier: "Schmidlin AG",
    external_key: externalKey,
    version: "01.2014, +20 % ab 01.07.2026",
    valid_from: validFrom,
    description: "Preisbuch Komponenten 01.2014 mit Preisanpassung +20 % ab 01.07.2026; Nettopreise exkl. MWST",
    imported_at: new Date().toISOString(),
  };
  const [existing] = await rest(`catalogs?select=id,name&external_key=eq.${encodeURIComponent(externalKey)}`);
  let catalogId;
  if (existing) {
    catalogId = existing.id;
    await rest(`catalogs?id=eq.${catalogId}`, { method: "PATCH", body: meta, prefer: "return=minimal" });
    await rest(`catalog_nodes?catalog_id=eq.${catalogId}&parent_id=is.null`, { method: "DELETE", prefer: "return=minimal" });
  } else {
    [{ id: catalogId }] = await rest("catalogs?select=id", { method: "POST", body: { ...meta, name: "Schmidlin AG – Komponenten" }, prefer: "return=representation" });
  }

  // Group per type, sub-group per material, positions in the order of the price book.
  const rows = [];
  let sort = 0;
  const group = (parentId, short) => {
    const id = crypto.randomUUID();
    rows.push({ id, catalog_id: catalogId, parent_id: parentId, kind: "group", article_number: null, short_text: short, long_text: {}, unit: null, unit_price: null, price_date: null, sort: ++sort });
    return id;
  };
  for (const type of types) {
    const typeId = group(null, { de: `${type.title.de} (Code ${type.code})`, fr: `${type.title.fr} (code ${type.code})` });
    for (const [material, mat] of Object.entries(materials)) {
      const list = items.filter((i) => i.type === type && i.material === material);
      if (!list.length) continue;
      const materialId = group(typeId, { de: mat.de, fr: mat.fr });
      for (const i of list) {
        rows.push({
          id: crypto.randomUUID(),
          catalog_id: catalogId,
          parent_id: materialId,
          kind: "position",
          article_number: i.article,
          short_text: i.short,
          long_text: i.long,
          unit: "Stk",
          unit_price: i.price,
          price_date: validFrom,
          sort: ++sort,
        });
      }
    }
  }
  for (let i = 0; i < rows.length; i += 1000) {
    await rest("catalog_nodes", { method: "POST", body: rows.slice(i, i + 1000), prefer: "return=minimal" });
  }
  console.log(`catalogue ${catalogId}: ${rows.length} entries imported`);
}
