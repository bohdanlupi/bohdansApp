// Copies the pdf.js worker of the installed pdfjs-dist into /public, where the plan editor loads it from
// (src/lib/building/pdf-render.ts). Run after updating pdfjs-dist: node scripts/copy-pdf-worker.mjs
import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const source = path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "build", "pdf.worker.min.mjs");
const target = new URL("../public/pdf.worker.min.mjs", import.meta.url);
copyFileSync(source, target);
console.log(`copied ${source} → public/pdf.worker.min.mjs`);
