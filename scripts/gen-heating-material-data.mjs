// Generates src/lib/heating/material-data.ts from the Nussbaum and Meier Tobler IGH catalogues in the database: the
// articles of the Materialauszug of 242 Wärmeerzeugung (valves on Optipress-Therm, Sicherheitsventile,
// Ausdehnungsgefässe, Biral pumps, Siemens valves and actuators, IMI STAD, GWF Wärmezähler, HakaGerodur
// Erdsondenverteiler). Usage (needs .env): node --env-file=.env scripts/gen-heating-material-data.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "src", "lib", "heating", "material-data.ts");

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
  global: { headers: { "User-Agent": "lupi-cli/1.0" } },
});

async function catalogId(name) {
  const { data, error } = await supabase.from("catalogs").select("id").eq("source", "igh").ilike("name", `%${name}%`).single();
  if (error) throw error;
  return data.id;
}

/** Positions of a catalogue whose article number starts with one of the prefixes. */
async function positions(catalog, prefixes) {
  const rows = [];
  for (const prefix of prefixes) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("catalog_nodes")
        .select("article_number, short_text")
        .eq("catalog_id", catalog)
        .eq("kind", "position")
        .like("article_number", `${prefix}%`)
        .order("article_number")
        .range(from, from + 999);
      if (error) throw error;
      rows.push(...data.map((r) => ({ number: r.article_number, text: r.short_text.de ?? "" })));
      if (data.length < 1000) break;
    }
  }
  return rows;
}

/** Applies the regex to each row; `map` turns the match into the fields of the article. */
const parse = (rows, re, map) => rows.flatMap((r) => {
  const m = r.text.match(re);
  return m ? [{ number: r.number, text: r.text, ...map(m) }] : [];
});

const inch = { "½": 0.5, "1/2": 0.5, "¾": 0.75, "3/4": 0.75, "1": 1, "1 1/4": 1.25, "1¼": 1.25, "1 1/2": 1.5, "1½": 1.5, "2": 2 };
const n = (s) => Number(String(s).replace(",", "."));

const nb = await catalogId("nussbaum");
const mt = await catalogId("meier tobler");

const data = {
  // Nussbaum
  ballValves: parse(await positions(nb, ["82100."]), /^Optipress-Kugelhahn, mit Metallgriff, (\d+(?:\.\d+)?)$/, (m) => ({ d: n(m[1]) })),
  teesThreaded: parse(await positions(nb, ["55013."]), /^Optipress-Therm-T-Stück, mit Innengewinde, ([\d.]+) x ([½¾1]) x [\d.]+$/, (m) => ({ d: n(m[1]), thread: inch[m[2]] })),
  drainCocks: parse(await positions(nb, ["55032."]), /^Füll- und Entleerkugelhahn, mit Aussengewinde, ([½¾1])$/, (m) => ({ thread: inch[m[1]] })),
  checkValves: parse(await positions(nb, ["81163."]), /^Optipress-A-Rückflussverhinderer EA, (\d+)$/, (m) => ({ d: n(m[1]) })),
  potableSafetyValves: parse(await positions(nb, ["13000."]), /^Sicherheitsventil, 6 bar fest eingestellt, ([½¾1])$/, (m) => ({ thread: inch[m[1]] })),
  // Meier Tobler
  afrisoValves: parse(await positions(mt, ["00310."]), /^Afriso Sicherheitsventil (1 1\/4|1\/2|3\/4|1)", ([\d,.]+) bar$/, (m) => ({ thread: inch[m[1]], bar: n(m[2]) })),
  imiValves: parse(await positions(mt, ["00024.4"]), /^IMI DG\/Hswiss Sicherheitsventil DN(\d+) - ([\d.]+) bar$/, (m) => ({ dn: n(m[1]), bar: n(m[2]) })),
  drainValves: parse(await positions(mt, ["00276.35"]), /^Meier Tobler ELV Entleerhahnen (1\/2|3\/8)"$/, (m) => ({ thread: m[1] === "1/2" ? 0.5 : 0.375 })),
  vessels: parse(await positions(mt, ["00862.0", "00862.1"]), /^Reflex N Membran-Druckausdehnungsgefäss grau (\d+)$/, (m) => ({ volume: n(m[1]) })),
  capValves: parse(await positions(mt, ["00862.160", "00860.141"]), /^Reflex SU Kappenventil R (¾|1)"/, (m) => ({ thread: inch[m[1]] })),
  vesselBrackets: parse(await positions(mt, ["00862.161"]), /^Reflex Wandhalterung mit Spannband und Konsole (\d+) - (\d+) l$/, (m) => ({ min: n(m[1]), max: n(m[2]) })),
  manometers: parse(await positions(mt, ["00433.93"]), /^Afriso Manometer 80 mm 0 - ([\d.]+) bar$/, (m) => ({ range: n(m[1]) })),
  pumps: [
    ...parse(await positions(mt, ["00072.3"]), /^Biral PrimAX Heizungsumwälzpumpe (\d+)-(\d+) (\d+) RED T2$/, (m) => ({ series: "PrimAX", medium: "heating", dn: n(m[1]), head: n(m[2]), length: n(m[3]) })),
    ...parse(await positions(mt, ["00071.0"]), /^Biral ModulA Heizungsumwälzpumpe (\d+)(F?)-(\d+) (\d+) RED (?:PN6 )?T2?$/, (m) => ({ series: "ModulA", medium: "heating", dn: n(m[1]), head: n(m[3]), length: n(m[4]) })),
    ...parse(await positions(mt, ["00071.4", "00071.6"]), /^Biral ModulA Kaltwasserumwälzpumpe (\d+)(F?)-(\d+) (\d+) GREEN (?:PN6 )?T2$/, (m) => ({ series: "ModulA", medium: "brine", dn: n(m[1]), head: n(m[3]), length: n(m[4]) })),
  ],
  mixingValves: parse(await positions(mt, ["00121.6"]), /^Siemens Dreiweg-Ventil VXG44\.(\d+)-([\d.]+)$/, (m) => ({ dn: n(m[1]), kvs: n(m[2]) })),
  throughValves: parse(await positions(mt, ["00121.6"]), /^Siemens Durchgangs-Ventil VVG44\.(\d+)-([\d.]+)$/, (m) => ({ dn: n(m[1]), kvs: n(m[2]) })),
  diverterValves: parse(await positions(mt, ["00120.25"]), /^Siemens 3-Weg Umschaltkugelhahn VBI60\.(\d+)-(\d+)L$/, (m) => ({ dn: n(m[1]), kvs: n(m[2]) })),
  actuators: parse(await positions(mt, ["00121.393", "00120.231"]), /^Siemens Stellantrieb (SAS61\.03|GLB161\.9E)$/, (m) => ({ type: m[1] })),
  balancingValves: parse(await positions(mt, ["00435.17"]), /^IMI STAD Einregulierungsventil m\. Entleeradapter DN (\d+) IG$/, (m) => ({ dn: n(m[1]) })),
  heatMeters: parse(await positions(mt, ["51550.10"]), /^GWF UltraMaXX Vs Wärmezähler M-Bus qp([\d.]+) (3\/4|1)"x(\d+) mm, DM$/, (m) => ({ qp: n(m[1]), thread: inch[m[2]] })),
  thermometers: parse(await positions(mt, ["53020.151"]), /^Meier Tobler Thermometer mit Messingtauchhülse/, () => ({})),
  probeManifolds: parse(await positions(mt, ["14762.", "14672."]), /^HakaGerodur SAVE (97|125) Erdsonden-?[Vv]erteiler (\d+)x(\d+)-?(KH\+F|IS\+F|KH|IS|HY\+F|HY)$/, (m) => ({ body: n(m[1]), outlets: n(m[2]), d: n(m[3]), kind: m[4] })),
};

for (const [key, list] of Object.entries(data)) if (!list.length) throw new Error(`no articles for ${key}`);

const header = `// GENERATED by scripts/gen-heating-material-data.mjs from the Nussbaum and Meier Tobler IGH catalogues – do not edit.
// Articles of the Materialauszug of 242 Wärmeerzeugung; thread sizes in inches, pipe sizes as Optipress outer diameter.

export type Article = { number: string; text: string };
`;
const types = {
  ballValves: "d: number", teesThreaded: "d: number; thread: number", drainCocks: "thread: number", checkValves: "d: number",
  potableSafetyValves: "thread: number", afrisoValves: "thread: number; bar: number", imiValves: "dn: number; bar: number",
  drainValves: "thread: number", vessels: "volume: number", capValves: "thread: number", vesselBrackets: "min: number; max: number",
  manometers: "range: number", pumps: 'series: "PrimAX" | "ModulA"; medium: "heating" | "brine"; dn: number; head: number; length: number',
  mixingValves: "dn: number; kvs: number", throughValves: "dn: number; kvs: number", diverterValves: "dn: number; kvs: number",
  actuators: 'type: "SAS61.03" | "GLB161.9E"', balancingValves: "dn: number", heatMeters: "qp: number; thread: number", thermometers: "",
  probeManifolds: 'body: number; outlets: number; d: number; kind: "KH+F" | "IS+F" | "KH" | "IS" | "HY+F" | "HY"',
};
let body = header;
for (const [key, list] of Object.entries(data)) {
  const type = types[key] ? `Article & { ${types[key]} }` : "Article";
  body += `\nexport const ${key}: (${type})[] = ${JSON.stringify(list, null, 2)};\n`;
}
fs.writeFileSync(out, body);
console.log(Object.entries(data).map(([k, v]) => `${k}: ${v.length}`).join("\n"));
