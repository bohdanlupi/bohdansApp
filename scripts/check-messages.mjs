// Fails if fr-CH / it-CH do not have exactly the same keys as de-CH.
import { readFileSync } from "node:fs";

const load = (locale) => JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));

const keys = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );

const reference = new Set(keys(load("de-CH")));
let failed = false;

for (const locale of ["fr-CH", "it-CH"]) {
  const other = new Set(keys(load(locale)));
  const missing = [...reference].filter((k) => !other.has(k));
  const extra = [...other].filter((k) => !reference.has(k));
  if (missing.length || extra.length) {
    failed = true;
    if (missing.length) console.error(`${locale} missing: ${missing.join(", ")}`);
    if (extra.length) console.error(`${locale} extra: ${extra.join(", ")}`);
  }
}

if (failed) process.exit(1);
console.log(`messages ok (${reference.size} keys)`);
