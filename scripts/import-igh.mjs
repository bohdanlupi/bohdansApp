// Imports IGH DataExpert catalogues (zip with one XML file, as downloaded from igh.ch) as read-only
// supplier catalogues. The supplier register becomes the group tree, every article a position with its
// article number, unit and gross price. Articles with colour/finish variants (e.g. Sanitas) get one
// position per priced variant. Re-importing a catalogue replaces its entries and keeps the catalogue id.
//
// Usage: node scripts/import-igh.mjs [--dry-run] <file.zip | folder> …
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.
// The catalogue files are licensed supplier data: keep them out of the (public) repository.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.trim().replace(/^["']|["']$/g, "")]),
);

const dryRun = process.argv.includes("--dry-run");
const inputs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!inputs.length) {
  console.error("Usage: node scripts/import-igh.mjs [--dry-run] <file.zip | folder> …");
  process.exit(1);
}
const files = inputs.flatMap((p) =>
  statSync(p).isDirectory()
    ? readdirSync(p).filter((f) => /\.(zip|xml)$/i.test(f)).map((f) => join(p, f))
    : [p],
);

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : null;
};
const attr = (xml, name) => {
  const m = xml.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? decode(m[1]) : null;
};
const clean = (s) => (s ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();

// UN/ECE unit codes → units used in the app.
const unitCodes = { PCE: "Stk", C62: "Stk", MTR: "m", MTK: "m²", MTQ: "m³", KGM: "kg", LTR: "l", HUR: "h", SET: "Satz", PR: "Paar", PK: "Pak", RO: "Rolle" };

/** Price of a <Preis> block: gross list price (Typ 1) if present, else the first one; 0 counts as "no price". */
function price(xml) {
  const positions = [...(xml ?? "").matchAll(/<Preis_Pos Typ="(\d+)"[^>]*>([^<]*)</g)];
  const pos = positions.find((p) => p[1] === "1") ?? positions[0];
  const value = pos ? Number(pos[2]) : NaN;
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

/** One entry per priced variant: [{ suffix, text, price }] (no suffix for articles without variants). */
function variants(block) {
  const determine = tag(block, "Preis_Bestimmen") ?? "";
  if (determine.includes("<Preis_AF>")) {
    return [...determine.matchAll(/<AF>([\s\S]*?)<\/AF>/g)].map(([, af]) => ({
      suffix: tag(af, "AF_Nr"),
      text: tag(af, "AF_Txt"),
      price: price(af),
    }));
  }
  if (determine.includes("<Preis_AF_Zusatz>")) {
    return [...determine.matchAll(/<AFZ>([\s\S]*?)<\/AFZ>/g)].flatMap(([, afz]) => {
      const nr = tag(afz, "AF_Nr");
      const text = tag(afz, "AF_Txt");
      return [...afz.matchAll(/<AFZ_Nr([^>]*)>([^<]*)<\/AFZ_Nr>/g)].map(([, attrs, code]) => {
        const extra = attr(attrs, "Txt");
        const value = Number(attr(attrs, "Preis"));
        return {
          suffix: code && code !== "0" ? `${nr}-${code}` : nr,
          text: [text, extra].filter(Boolean).join(", "),
          price: Number.isFinite(value) && value > 0 ? value : null,
        };
      });
    });
  }
  return [{ suffix: null, text: null, price: price(determine) }];
}

function parseArticles(xml) {
  const articles = new Map();
  const start = xml.indexOf("<Artikelmenge>");
  let pos = start;
  while ((pos = xml.indexOf("<Artikel ", pos)) !== -1) {
    const end = xml.indexOf("</Artikel>", pos);
    const block = xml.slice(pos, end);
    pos = end + 10;

    const nr = attr(block.slice(0, 200), "Art_Nr_Anbieter");
    const short = clean(tag(block, "Art_Txt_Kurz"));
    let long = clean(tag(block, "Art_Txt_Lang"));
    // The long text usually repeats the short text; the LV prints both, so drop the repetition.
    if (long === short) long = "";
    else if (long.startsWith(short + "\n")) long = long.slice(short.length + 1).trim();

    const unitMatch = block.match(/<BM_Einheit_Code(?:\s+BM_Einheit="([^"]*)")?[^>]*>([^<]*)</);
    const unit = unitMatch ? (unitCodes[unitMatch[2]] ?? (decode(unitMatch[1] ?? "") || unitMatch[2])) : null;

    articles.set(nr, { nr, short, long, unit, variants: variants(block) });
  }
  return articles;
}

/** Register tree: groups { title, children } and article references { ref }. */
function parseRegister(xml) {
  const section = xml.slice(xml.indexOf("<Suchbegriffe>"), xml.indexOf("</Suchbegriffe>"));
  const root = { title: null, children: [], byTitle: new Map() };
  const stack = [root];
  const re = /<(Register_Element_1|Element_\d+)\s+Txt="([^"]*)"\s*(\/?)>|<\/(?:Register_Element_1|Element_\d+)>|<Element\d*_Nr(?:\s[^>]*)?>([^<]*)<\/Element\d*_Nr>/g;
  for (const m of section.matchAll(re)) {
    const parent = stack[stack.length - 1];
    if (m[1]) {
      // Groups with the same title under the same parent (e.g. one per register tab) are merged.
      const title = clean(decode(m[2])) || "–";
      let group = parent.byTitle.get(title);
      if (!group) {
        group = { title, children: [], byTitle: new Map() };
        parent.byTitle.set(title, group);
        parent.children.push(group);
      }
      if (!m[3]) stack.push(group);
    } else if (m[4] !== undefined) {
      parent.children.push({ ref: decode(m[4]).trim() });
    } else if (stack.length > 1) {
      stack.pop();
    }
  }
  return root;
}

function parseCatalog(xml) {
  const head = xml.slice(0, xml.indexOf("<Suchbegriffe>") >= 0 ? xml.indexOf("<Suchbegriffe>") : 5000);
  const katalog = head.match(/<Katalog\s[^>]*>/)?.[0] ?? "";
  const anbieter = tag(head, "Anbieter") ?? "";
  const supplier = tag(anbieter, "Firma") ?? "Lieferant";
  const supplierNo = attr(katalog, "ID_Anbieter");
  const catalogNo = attr(katalog, "ID_Katalog");
  const title = attr(katalog, "Txt_Katalog") ?? "";
  return {
    supplier,
    externalKey: `igh:${supplierNo}:${catalogNo}`,
    name: `${supplier} – ${title}`,
    version: `${attr(katalog, "Versions_Jahr")}/${attr(katalog, "Versions_Nr")}`,
    validFrom: attr(katalog, "Dat_Valid_Von"),
    validTo: attr(katalog, "Dat_Valid_Bis"),
    language: tag(head, "Code_Sprache") ?? "de",
    articles: parseArticles(xml),
    register: parseRegister(xml),
  };
}

/** Flattens register + articles into catalogue node rows in document order (parents first). */
function buildRows(catalog, catalogId) {
  const { articles, register, language } = catalog;
  const placed = new Set();
  const rows = [];
  let sort = 0;

  // Prune: every article only at its first place in the register; drop groups that end up empty.
  const prune = (group) => {
    group.children = group.children.filter((child) => {
      if (child.ref !== undefined) {
        if (!articles.has(child.ref) || placed.has(child.ref)) return false;
        placed.add(child.ref);
        return true;
      }
      return prune(child);
    });
    return group.children.length > 0;
  };
  prune(register);
  const unplaced = [...articles.keys()].filter((nr) => !placed.has(nr));
  // A single top group (usually the supplier name) adds nothing.
  let top = register.children;
  while (top.length === 1 && top[0].children && !unplaced.length) top = top[0].children;
  if (unplaced.length) {
    top = [...top, { title: top.length ? "Weitere Artikel" : catalog.name, children: unplaced.map((ref) => ({ ref })) }];
  }

  const text = (value) => (value ? { [language]: value } : {});
  const walk = (children, parentId) => {
    for (const child of children) {
      if (child.ref === undefined) {
        const id = crypto.randomUUID();
        rows.push({ id, catalog_id: catalogId, parent_id: parentId, kind: "group", short_text: text(child.title), sort: ++sort });
        walk(child.children, id);
        continue;
      }
      const article = articles.get(child.ref);
      for (const variant of article.variants) {
        rows.push({
          id: crypto.randomUUID(),
          catalog_id: catalogId,
          parent_id: parentId,
          kind: "position",
          article_number: variant.suffix ? `${article.nr}-${variant.suffix}` : article.nr,
          short_text: text(variant.text ? `${article.short}, ${variant.text}` : article.short),
          long_text: text(article.long),
          unit: article.unit,
          unit_price: variant.price,
          price_date: catalog.validFrom,
          sort: ++sort,
        });
      }
    }
  };
  walk(top, null);
  return rows;
}

// ---------------------------------------------------------------------------
// Upload (PostgREST with the secret key; bypasses RLS)
// ---------------------------------------------------------------------------

async function rest(path, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      "Content-Type": "application/json",
      "User-Agent": "lupi-cli/1.0",
      ...(prefer && { Prefer: prefer }),
    },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]}: ${res.status} ${await res.text()}`);
  return res.status === 204 || prefer?.includes("return=minimal") ? null : res.json();
}

async function upload(catalog) {
  const meta = {
    name: catalog.name,
    source: "igh",
    supplier: catalog.supplier,
    external_key: catalog.externalKey,
    version: catalog.version,
    valid_from: catalog.validFrom,
    valid_to: catalog.validTo,
    description: `IGH-Lieferantenkatalog, Version ${catalog.version}`,
    imported_at: new Date().toISOString(),
  };

  const [existing] = await rest(`catalogs?select=id,name&external_key=eq.${encodeURIComponent(catalog.externalKey)}`);
  let catalogId;
  if (existing) {
    catalogId = existing.id;
    // Keep a name the user changed in the app.
    await rest(`catalogs?id=eq.${catalogId}`, { method: "PATCH", body: { ...meta, name: existing.name }, prefer: "return=minimal" });
    // Delete the old entries top group by top group (children follow via cascade) to stay below timeouts.
    for (;;) {
      const roots = await rest(`catalog_nodes?select=id&catalog_id=eq.${catalogId}&parent_id=is.null&limit=50`);
      if (!roots.length) break;
      await rest(`catalog_nodes?id=in.(${roots.map((r) => r.id).join(",")})`, { method: "DELETE", prefer: "return=minimal" });
    }
  } else {
    [{ id: catalogId }] = await rest("catalogs?select=id", { method: "POST", body: meta, prefer: "return=representation" });
  }

  const rows = buildRows(catalog, catalogId);
  for (let i = 0; i < rows.length; i += 1000) {
    // All rows of a batch need the same keys for PostgREST.
    const batch = rows.slice(i, i + 1000).map((r) => ({ article_number: null, long_text: {}, unit: null, unit_price: null, price_date: null, ...r }));
    await rest("catalog_nodes", { method: "POST", body: batch, prefer: "return=minimal" });
    process.stdout.write(`\r  ${Math.min(i + 1000, rows.length)} / ${rows.length}`);
  }
  process.stdout.write("\n");
  return rows.length;
}

// ---------------------------------------------------------------------------

for (const file of files) {
  const raw = readFileSync(file);
  const xmlBytes = /\.zip$/i.test(file) ? Object.entries(unzipSync(raw)).find(([name]) => /\.xml$/i.test(name))?.[1] : raw;
  if (!xmlBytes) {
    console.error(`${file}: no XML file inside`);
    continue;
  }
  const catalog = parseCatalog(new TextDecoder("utf-8").decode(xmlBytes));
  if (dryRun) {
    const rows = buildRows(catalog, "dry-run");
    const groups = rows.filter((r) => r.kind === "group").length;
    const unpriced = rows.filter((r) => r.kind === "position" && r.unit_price === null).length;
    console.log(`${file}: ${catalog.name} (${catalog.externalKey}, ${catalog.version}) – ${catalog.articles.size} articles → ${rows.length - groups} positions, ${groups} groups, ${unpriced} without price`);
    continue;
  }
  console.log(`${file}: ${catalog.name}`);
  const count = await upload(catalog);
  console.log(`  ${count} entries imported`);
}
