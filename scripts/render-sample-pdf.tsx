// Dev helper: renders the letterhead preview without Supabase.
// Usage: npx tsx scripts/render-sample-pdf.tsx [de|fr|it] [out.pdf]
import { readFileSync, writeFileSync } from "node:fs";

import { renderToBuffer } from "@react-pdf/renderer";

import type { AppLanguage, FirmSettings } from "../src/lib/supabase/types";
import { SampleLetter } from "../src/pdf/sample-letter";

const firm: FirmSettings = {
  id: true,
  name: "LUPI Technik & Planung GmbH",
  street: "Hintermättlistrasse 14b",
  zip: "5506",
  city: "Mägenwil",
  country: "CH",
  phone: "079 945 15 89",
  email: "info@lupi-gmbh.ch",
  website: "www.lupi-gmbh.ch",
  uid_number: "CHE-262.091.082",
  bank_name: "UBS Schweiz AG",
  iban: "CH38 0021 1211 1325 1501 H",
  bic: "UBSWCHZH80A",
  managing_director: "Bohdan Lupi",
  vat_rate: 8.1,
  offer_validity_days: 30,
  payment_terms_days: 30,
  logo_path: null,
  updated_at: new Date().toISOString(),
  updated_by: null,
};

const language = (process.argv[2] ?? "de") as AppLanguage;
const out = process.argv[3] ?? `briefkopf-${language}.pdf`;
const logo = { data: readFileSync("public/brand/logo.png"), format: "png" as const };

renderToBuffer(<SampleLetter firm={firm} logo={logo} language={language} />).then((pdf) => {
  writeFileSync(out, pdf);
  console.log(`written ${out}`);
});
