// Generates src/lib/kwl/zehnder-data.ts from the digitised Zehnder datasheets
// (Berechnungsvorlagen/Lüftung KWL/Zehnder Daten/digitalisiert/*.json – local only, gitignored).
// Usage: node scripts/gen-zehnder-data.mjs. Product keys are referenced by saved networks: keep names stable.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, "..", "Berechnungsvorlagen", "Lüftung KWL", "Zehnder Daten", "digitalisiert");
const out = path.join(__dirname, "..", "src", "lib", "kwl", "zehnder-data.ts");

const read = (f) => (fs.existsSync(path.join(dir, f)) ? JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) : null);
const products = [];
const keys = new Set();

const slug = (s) =>
  "zehnder-" +
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/^zehnder\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
const uniqueKey = (name) => {
  let k = slug(name);
  let i = 2;
  while (keys.has(k)) k = `${slug(name)}-${i++}`;
  keys.add(k);
  return k;
};
const umlauts = (s) =>
  s
    .replace(/\bfuer\b/g, "für")
    .replace(/schraeg/g, "schräg")
    .replace(/Oeffnung/g, "Öffnung")
    .replace(/Ueberstroem/g, "Überström")
    .replace(/Verlaengerung/g, "Verlängerung")
    .replace(/schalldaemm/g, "schalldämm")
    .replace(/Mauerdurchfuehrung/g, "Mauerdurchführung");
const cleanName = (s) => umlauts(s.replace(/^Zehnder\s+/, "").replace(/\s+/g, " ").trim());
const round = (x) => (Math.abs(x) >= 100 ? Math.round(x * 10) / 10 : Math.round(x * 1000) / 1000);
const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);

function points(raw) {
  if (!Array.isArray(raw)) return [];
  const pts = raw
    .map((p) => (Array.isArray(p) ? [num(p[0]), num(p[1])] : [num(p.q ?? p.flow), num(p.dp ?? p.pa ?? p.value)]))
    .filter(([q, dp]) => q !== null && dp !== null)
    .map(([q, dp]) => [round(q), round(dp)]);
  pts.sort((a, b) => a[0] - b[0]);
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0]);
}

const curveUseOf = (label) =>
  /abluft|\babl\b|extract|mit filter/i.test(label) ? "extract" : /zuluft|\bzul\b|supply|ohne filter/i.test(label) ? "supply" : undefined;

function curves(pressureLoss, fallbackLabel, variantUse) {
  const list = Array.isArray(pressureLoss) ? pressureLoss : pressureLoss ? [pressureLoss] : [];
  const labels = new Set();
  const res = [];
  for (const c of list) {
    if (/nomogramm/i.test(c.label || "")) continue;
    const pts = points(c.points);
    if (pts.length < 2) continue;
    let label = umlauts((c.label || fallbackLabel || "Druckverlust").replace(/\s+/g, " ").trim().slice(0, 140));
    let i = 2;
    const base = label;
    while (labels.has(label)) label = `${base} (${i++})`;
    labels.add(label);
    const curve = { label, points: pts };
    if (c.flowRefersTo === "perOutlet" || c.flowRefersTo === "total") curve.flowRefersTo = c.flowRefersTo;
    const use = curveUseOf(label) ?? (variantUse === "supply" || variantUse === "extract" ? variantUse : undefined);
    if (use) curve.use = use;
    res.push(curve);
  }
  return res;
}

const articles = (v) =>
  (v.articles || [])
    .filter((a) => a && typeof a.number === "string" && /\d/.test(a.number))
    .map((a) => ({ number: articleNo(a.number), text: String(a.text || "").replace(/\s+/g, " ").trim().slice(0, 300) }));

const skipVariant = (name) => /zubeh[öo]r|^montage|ger[äa]teanschl[üu]sse|[üu]bersicht|befestigung/i.test(name);

function range(v) {
  const r = v.recommendedRange;
  if (Array.isArray(r) && num(r[1]) !== null) return [num(r[0]) ?? 0, r[1]];
  if (v.maxFlow && num(v.maxFlow.value) !== null) return [0, v.maxFlow.value];
  if (v.maxRecommended && num(v.maxRecommended.flow_m3h) !== null) return [0, v.maxRecommended.flow_m3h];
  return undefined;
}

function inner(v) {
  const d = v.dimensions || v.dimensions_mm || {};
  const dia = num(d.innerDiameter_mm) ?? num(d.D1_innerDiameter_mm);
  if (num(d.innerWidth_mm) && num(d.innerHeight_mm)) return { width: d.innerWidth_mm, height: d.innerHeight_mm };
  if (dia) return { diameter: dia };
  return undefined;
}

// Ventilation units (measurement table + max. external pressure line) and extensions with a pressure drop.
function addDevices(json) {
  if (!json) return;
  const arts = (list) =>
    (list || [])
      .filter((a) => typeof a.nr === "string" && /\d/.test(a.nr))
      .map((a) => ({ number: articleNo(a.nr), text: String(a.desc || "").replace(/\s+/g, " ").trim().slice(0, 300) }));
  for (const p of json.products) {
    for (const v of p.variants || []) {
      const name = cleanName(v.model || p.product);
      if (p.kind === "device") {
        const measurements = (v.measurements || [])
          .filter((m) => num(m.qv) !== null && num(m.pst) !== null && num(m.powerW) !== null)
          .map((m) => ({ qv: m.qv, pst: m.pst, powerW: m.powerW, ...(num(m.spi) !== null ? { spi: m.spi } : {}) }));
        const maxCurve = points(v.maxExternalCurve?.points);
        if (!measurements.length || maxCurve.length < 2) continue; // e.g. ComfoSpot 50 (through-wall unit)
        products.push({
          key: uniqueKey(name),
          manufacturer: "Zehnder",
          name,
          family: "ComfoAir",
          kind: "device",
          curves: [],
          articles: arts(v.articles),
          source: { file: p.file, page: num(v.pages?.data) ?? num(p.page) ?? undefined },
          device: {
            measurements,
            maxExternalCurve: maxCurve,
            maxFlow: num(v.maxFlow) ?? undefined,
            nominalFlow: num(v.nominalFlow?.qv) ?? undefined,
          },
        });
      } else if (v.pressureDrop && !/ComfoFond/.test(p.product)) {
        // (ComfoFond-L Q is modelled as a device attachment, see attachments() below.)
        const pd = v.pressureDrop;
        const list = Object.values(pd).filter((c) => c && typeof c === "object" && Array.isArray(c.points));
        products.push({
          key: uniqueKey(name),
          manufacturer: "Zehnder",
          name,
          family: "Erweiterungen",
          kind: "extension",
          curves: curves(list, name),
          articles: arts(v.articles),
          source: { file: p.file, page: num(v.pages?.pressureDrop) ?? num(p.page) ?? undefined },
        });
      }
    }
  }
}

const articleNo = (n) => {
  const m = /(\d{3}) ?(\d{3}) ?(\d{3})/.exec(n);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : n.trim();
};
// Family for grouping in selections: product group of the datasheet without «Zehnder» and suffixes.
const familyOf = (product) =>
  cleanName(product)
    .replace(/\s*[–-]\s*Formteile\/Zubehör$/, "")
    .replace(/\s*\(.*\)$/, "")
    .trim();
const fittingRole = (name) =>
  /y-stück|kreuzungsstück/i.test(name)
    ? "tee"
    : /bogen|gebogen/i.test(name)
      ? "bend"
      : "joint";

const kindMap = { throttle: "valve" };
const airUseOf = (u) => {
  if (!u) return undefined;
  if (/supply\/extract|both/.test(u)) return "both";
  const m = /^(supply|extract|outdoor|exhaust|transfer)\b/.exec(u);
  return m ? m[1] : undefined;
};

function addGroup(json, defaults = {}) {
  if (!json) return;
  for (const p of json.products) {
    if (/_OBR_/.test(p.file)) continue; // overview of cover grilles: article numbers only
    for (const v of p.variants) {
      if (skipVariant(v.name)) continue;
      const kind = kindMap[v.kind || p.kind] || v.kind || p.kind || defaults.kind;
      const name = cleanName(v.name);
      const product = {
        key: uniqueKey(name),
        manufacturer: "Zehnder",
        name,
        family: familyOf(p.product),
        kind,
        curves: curves(v.pressureLoss, name, airUseOf(v.use)),
        articles: articles(v),
        source: { file: p.file, page: num(v.page) ?? undefined },
      };
      if (kind === "fitting") product.fitting = fittingRole(name);
      const i = kind === "duct" ? inner(v) : undefined;
      if (i) product.inner = i;
      const outlets = num(v.connections?.outlets?.count);
      if (kind === "distributor" && outlets) product.outlets = outlets;
      const r = range(v);
      if (r) product.recommendedRange = r;
      const use = airUseOf(v.use);
      if (use) product.use = use;
      if (kind === "duct" && product.curves.length && !/pa\/m/i.test(String(v.pressureLoss?.unit ?? "Pa/m"))) {
        console.warn("duct without Pa/m:", name);
      }
      products.push(product);
    }
  }
}

addDevices(read("devices.json"));
addGroup(read("ducts.json"));
addGroup(read("distributors.json"), { kind: "distributor" });
addGroup(read("terminals.json"), { kind: "terminal" });
addGroup(read("grilles.json"), { kind: "grille" });

const body = products.map((p) => "  " + JSON.stringify(p)).join(",\n");

// Attachments of the ComfoAir Q units: ComfoFond-L Q, enthalpy exchanger (ERV), ComfoClime 24 / 36.
function attachments(json) {
  const compact = (s) => s.replace(/\s+/g, "").replace(/ERV$/, "");
  const keyOf = (model) => products.find((p) => p.kind === "device" && compact(p.name) === compact(model))?.key;
  const find = (re) => json.products.find((p) => re.test(p.product));
  const arts = (list) =>
    (list || []).map((a) => ({
      number: articleNo(a.nr),
      // Without digitising remarks such as «(Artikeltabelle S.17; …)».
      text: String(a.desc || "").replace(/\s*\((?:Artikeltabelle|Ausschreibungstext)[^)]*\)/g, "").replace(/\s+/g, " ").trim().slice(0, 300),
    }));

  const fondP = find(/ComfoFond/);
  const fv = fondP.variants[0];
  const fond = {
    name: "ComfoFond-L Q",
    source: { file: fondP.file, page: fv.pages?.pressureDrop },
    withFilter: points(fv.pressureDrop.withFilter.points),
    withoutFilter: points(fv.pressureDrop.withoutFilter.points),
    devices: Object.fromEntries(
      fv.electrical.nominal.map((n) => [keyOf(n.with), { pumpW: n.powerW, maxFlow: fv.maxFlow["with" + n.with.replace("ComfoAir ", "")] ?? null }]),
    ),
    articles: arts(fv.articles),
  };

  const ervP = find(/Enthalpietauscher/);
  const erv = {
    source: { file: ervP.file, page: ervP.page },
    devices: Object.fromEntries(
      ervP.variants
        .filter((v) => keyOf(v.forDevice))
        .map((v) => [
          keyOf(v.forDevice),
          {
            heatRecoveryPct: v.phi?.heatRecoveryPct ?? null,
            humidityRecoveryPct: v.phi?.humidityRecoveryPct ?? null,
            spiPhi: v.phi?.spiWhM3 ?? null,
            tempEfficiencyPct: v.en13141_7?.tempEfficiencyPct ?? null,
            retrofitArticle: arts(v.articles)[0] ?? null,
          },
        ]),
    ),
  };

  const ccP = find(/ComfoClime/);
  const clime = ccP.variants.map((v) => {
    const a = arts(v.articles);
    return {
      key: v.model.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: v.model,
      source: { file: ccP.file, page: v.pages?.fanCurves },
      heatingKW: v.heatingCapacityKW,
      coolingKW: v.coolingCapacityKW,
      maxPowerW: v.maxPowerW,
      flowRange: v.flowRange,
      article: a[0],
      combinations: v.combinations.map((c) => {
        const q = c.with.replace("ComfoAir ", "");
        const adapters = a.filter((x) => /adapter/i.test(x.text));
        return {
          device: keyOf(c.with),
          supply: points(c.fanCurve100.supply),
          extract: points(c.fanCurve100.extract),
          adapter: adapters.find((x) => x.text.includes(q)) ?? adapters[0] ?? null,
        };
      }),
      accessories: a.slice(1).filter((x) => !/adapter/i.test(x.text)),
    };
  });
  return { fond, erv, clime };
}
const attachmentData = attachments(read("devices.json"));
fs.writeFileSync(
  out,
  `// Generated from the Zehnder CH datasheets (Berechnungsvorlagen/Lüftung KWL/Zehnder Daten): pressure-drop
// curves digitised from the diagrams (vector paths calibrated on the grid) and tables, article numbers from the
// order lists. Do not edit by hand – regenerate from the digitised JSON.

import type { ZehnderAttachments } from "./attachments";
import type { Product } from "./products";

export const zehnderProducts: Product[] = [
${body},
];

export const zehnderAttachments: ZehnderAttachments = ${JSON.stringify(attachmentData)};
`,
);
const count = {};
for (const p of products) count[p.kind] = (count[p.kind] || 0) + 1;
console.log(products.length, "products", count, "withCurves", products.filter((p) => p.curves.length).length);
