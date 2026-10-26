# HLKS Planer – Web App (Plan)

Web-based AVA tool (Ausschreibung, Vergabe, Abrechnung) for a single HLKS planning firm,
modelled on *MesserliHLKS für Planer*. Vercel (hosting) + Supabase (DB, auth, storage).

## Decisions so far

| Topic | Decision |
|---|---|
| Users | Our own firm only (single organisation, several users, roles) |
| Catalogues | Start with an own text catalogue (Eigentextkatalog) + free R-positions; NPK/suissetec/IGH import later |
| Numbering | NPK-like: Kapitel (e.g. 411) › hierarchical position numbers (e.g. 111.101), R-positions for free text |
| Languages | DE + FR + IT from the start (UI **and** catalogue/LV texts) |
| Auth | Supabase email + password, invite-only |
| LV editor | Tree on the left + detail panel on the right |
| PDF layout | From `vorlagen/` Offerte + Offerte_Anhang: Arial/Helvetica, logo top right, grey table header, dark blue total bar (#1F497D), footer with address/contact |
| Accounts | Vercel + Supabase available, GitHub for code, Supabase region Zurich |
| Roles | Admin / Planer / Viewer (sufficient) |
| Existing data | Addresses and catalogue texts will be provided later → CSV import needed |
| Cost plans | Preload **both** BKP and eBKP-H |

## Tech stack

- **Next.js (App Router) + TypeScript** on Vercel
- **Supabase**: Postgres, Auth, Storage (documents, images, logo), Row Level Security
- **Tailwind + shadcn/ui** for the UI; **TanStack Table** for grids (Angebotsvergleich)
- **next-intl** for UI i18n (de-CH, fr-CH, it-CH)
- **@react-pdf/renderer** for PDFs (LV, KV, Angebotsvergleich, letters): works in Vercel serverless functions without headless Chrome
- **Zod** for validation, Supabase CLI for migrations + generated TS types
- Money stored as `numeric(14,2)`, CHF, Swiss rounding to 0.05 where needed, MwSt configurable (currently 8.1 %)

## Multilingual content

Every user-facing catalogue/LV text is stored as `jsonb` `{ "de": "...", "fr": "...", "it": "..." }`.
Each LV has a **document language**, and printing uses that language (falling back to DE if a
translation is missing, with a visible warning in the editor).

## Data model (MVP)

```
profiles            id (=auth.users), name, role (admin | planer | viewer), language

-- Adressen / CRM
companies           id, name, name2, street, po_box, zip, city, country, phone, email, website, uid_number,
                    language (correspondence), categories text[], trades text[], notes, archived
                    (every address is a company – private clients too; category/trade keys in
                    src/lib/address-options.ts, validated by the app)
contacts            id, company_id (required), salutation, first_name, last_name, function, phone, mobile,
                    email, language (null = like company), notes

-- Projekte
projects            id, number (unique, suggested YYYY-NNN), name, street, zip, city, status, language,
                    start_date, end_date, description   (client = participant with role "client")
project_participants project_id, company_id, contact_id? (must belong to the company), role, note
company_list / project_list   search views (search_text, contact_count, client_names)

-- Kostenplan (Phase 3)
cost_plan_templates id, key (bkp | ebkp_h | null for own lists), name
cost_plan_items     id, template_id, parent_id (derived from the code: 242 → 24 → 2), code, name (i18n)
projects.cost_plan_template_id, lvs.cost_plan_item_id, lv_nodes.cost_plan_item_id (override)
project_cost_items  project_id, cost_plan_item_id, budget, manual_amount (KV not covered by LVs), note
project_cost_lv_amounts (view)  LV estimate per project and effective code

-- Eigenkatalog + LV (Phase 2) – one node model for both trees
node_kind           group | position | r_position (LV only) | text
catalogs            id, name, trade, description, active
catalog_nodes       id, catalog_id, parent_id, kind, number, short_text/long_text (i18n), unit,
                    unit_price, price_date, sort
lvs                 id, project_id, number, title, trade, language, status (draft | tendered | awarded),
                    description, submission_deadline, cost_plan_item_id, awarded_bidder_id, award_date,
                    award_justification
lv_nodes            id, lv_id, parent_id, kind, number, short_text/long_text (i18n), unit, quantity,
                    unit_price (estimate), is_optional, is_lump_sum, source_catalog_node_id,
                    cost_plan_item_id, sort
lv_measurements     id, lv_node_id, description, count, factor_a/b/c, result (generated)
                    → trigger sets lv_nodes.quantity = Σ result (Vorausmass)
lv_list (view)      lvs + estimate_total, position_count
Numbering: 100 / 110 / 110.101 (src/lib/tree.ts), reassigned after every structural change.

-- Ausschreibung / Offerten (Phase 4)
lv_bidders          id, lv_id, company_id, contact_id, status (invited | offered | declined), invited_at,
                    offer_received_at, offer_reference, discount_pct, skonto_pct, other_deductions,
                    vat_pct, notes   (bidder and offer header in one row; one offer per bidder)
offer_prices        lv_bidder_id, lv_node_id, lv_id, unit_price, note
offer_totals (view) gross total and missing prices per bidder
Offer math (src/lib/offer-math.ts): Brutto − Rabatt − Abzüge = Netto − Skonto + MwSt = Total (5 Rp.)

-- Dokumente
documents           id, project_id?, company_id?, storage_path, name, type, uploaded_by

-- KWL-Auslegung (kontrollierte Wohnungslüftung)
ventilation_calcs   id, project_id, name (Wohnung / Einheit), sort, data jsonb (rooms, height, filter, device, notes)
                    → schema src/lib/kwl/schema.ts, all results computed in src/lib/kwl/calc.ts + sia3825.ts
ventilation_plans   project_id (PK), data jsonb (design criteria, checklist states, phase inputs,
                    commissioning measurements, notes per phase) → src/lib/kwl/plan-schema.ts

-- Heizungsplanung
heating_plans       project_id (PK), data jsonb (Planungsgrundlagen, checklist states, notes per phase, heat load site +
                    construction catalogue) → src/lib/heating/plan-schema.ts
heating_calcs       id, project_id, name, sort, data jsonb (Konzepte: SIA 384/2 heat load, rooms with elements)
                    → src/lib/heating/heat-load-schema.ts, computed in heat-load.ts
heating_systems     id, project_id, name, sort, data jsonb (243 Fussbodenheizung per distributor, plantId = Anlage)
                    → src/lib/heating/floor-schema.ts, computed in floor.ts
heating_plants      id, project_id, name, sort, data jsonb (242 Wärmeerzeugungsanlage: generators, cooling, storage …)
                    → src/lib/heating/plant-schema.ts; radiators jsonb (243 Heizkörper per Heizgruppe → radiator-schema.ts,
                    computed in radiators.ts)

-- Gebäudemodell (planned 2026-10-26, see «Gebäudemodell, Plan-Tracing und SIA 380/1»)
building_plans      id, project_id, floor, name, storage_path (pdf + png snapshot in bucket «plans»), page, px size, scale,
                    rotation, north, origin
building_models     project_id (PK), data jsonb (floors, zones, rooms with polygons, envelope segments + openings, links,
                    construction catalogue) → src/lib/building/schema.ts, SIA 380/1 in sia3801.ts

-- Honorarofferten (SIA 108)
fee_offers          id, number (unique, YYYY-NNN), title, status (draft | sent | accepted | declined), company_id, contact_id,
                    project_id (set when the accepted offer becomes a project), street, zip, city, language, offer_date,
                    valid_until, data jsonb (method sia | hours, trades Heizung/Kälte/Lüftung-Klima/Sanitär with B, n, r, i, s, U
                    and phases 31–53, services per trade + phase, own lines, extras, copy of rates / Z1 Z2 / shares)
                    → src/lib/fees/offer-schema.ts, computed in calc.ts (SIA 108:2014 Art. 7, sia108.ts), services.ts
firm_settings.fee_settings  Z1/Z2 per Fachgebiet, Leistungsanteile q, rate categories, Nebenkosten → settings-schema.ts
```

All tables get `created_at/updated_at/created_by`. RLS policies: authenticated users of the firm
can read everything; write access by role.

## App structure

```
/login
/projekte                      list + create
/projekte/[id]                 overview, Beteiligte, documents
/projekte/[id]/kostenplan      BKP / KV
/projekte/[id]/gebaeude        Gebäudemodell: Geschosse + Pläne, Decken / Böden, Zonen, Klima; /plan/[floor] tracing editor; /sia3801 SIA 380/1 + PDF /api/pdf/sia3801/[id]
/projekte/[id]/heizung         redirects to the first checklist (31); checklist PDF /api/pdf/heating-plan/[id]
/projekte/[id]/heizung/[31…61] SIA 108 phase: checklists (SIA 384/1, 384/2, 384/6, 384/7, EN-103, HE301 refs)
/projekte/[id]/heizung/erzeugung?anlage=  242 Wärmeerzeugung (one page), per Anlage
/projekte/[id]/heizung/verteilung/waermebedarf[/calcId]  243 Wärmebedarf SIA 384/2 (project-wide), PDF /api/pdf/heat-load/[calcId]
/projekte/[id]/heizung/verteilung/{fussbodenheizung[/systemId],heizkoerper,schema}?anlage=  243, per Anlage
/projekte/[id]/lueftung        KWL-Planung: design criteria + phase progress, PDF /api/pdf/kwl-plan/[id]
/projekte/[id]/lueftung/[31…61] SIA 108 phase: checklists (SIA 382/5 refs) + calculations + diagrams
/projekte/[id]/lueftung/wohnungen[/calcId]  dwelling calculations, PDF /api/pdf/kwl/[calcId]
/projekte/[id]/lv/[lvId]       LV editor (tree + detail panel, Vorausmass tab)
/projekte/[id]/lv/[lvId]/offerten        bidders, price entry per offer
/projekte/[id]/lv/[lvId]/vergleich       Angebotsvergleich + Vergabeantrag
/adressen                      companies + contacts
/kataloge                      own catalogue editor (same tree + detail UI as the LV)
/einstellungen                 users, letterhead, MwSt, cost plan templates
/einstellungen/honorar         SIA 108 defaults for fee offers (Z1/Z2, Leistungsanteile, rates, Nebenkosten)
/honorarofferten[/neu|/id]     fee offers by SIA 108 (trades, phases, services), PDF /api/pdf/honorarofferte/[id],
                               «Projekt erstellen» turns an accepted offer into a project
```

## Phases

**Phase 0 – Foundation** ✅ done (2026-09-22), live on Vercel
Next.js 16 app, Supabase migration (profiles/roles, firm settings, storage bucket), invite-only auth
(login, invite, password reset/set), DE/FR/IT UI with language switch, app shell, settings (firm data,
users, profile), letterhead PDF preview (`/api/pdf/briefkopf`).

**Phase 1 – Adressen + Projekte** ✅ done (2026-09-22)
CRUD for companies/contacts/projects, participants per project, search, CSV import of existing addresses.
Project documents (upload) are not built yet – planned together with the document management.

**Phase 2 – Eigenkatalog + Leistungsverzeichnis** ✅ done (2026-09-22)
Catalogue editor; LV editor with tree (drag & drop, auto-numbering), insert positions from the catalogue,
R-positions, Eventualpositionen, Vorausmass, estimate prices from own prices; LV PDF on the firm letterhead.

**Phase 3 – BKP + Kostenvoranschlag** ✅ done (2026-09-22)
Load the BKP template, assign LVs/positions to BKP codes, cost estimate with roll-ups, KV PDF.

**Phase 4 – Offerten + Angebotsvergleich** ✅ done (2026-09-22) – plus invitation letter and a detailed
comparison PDF (landscape)
Invite bidders, manual price entry per position, deductions (Rabatt, Skonto, MwSt), side-by-side
comparison (per position + totals, ranking, deviation from estimate, highlighting of min/max),
Vergabeantrag PDF, Auftragsbestätigung / Absageschreiben letters.

**Later (post-MVP)**
- SIA 451 / IfA18 (`.crbx`) import/export – requires the CRB specification and certification
- NPK import (with CRB licence), suissetec catalogues (IGH done 2026-09-23)
- Bauleitung: protocols, Mängel- und Pendenzenverwaltung
- Werkvertrag, document management with free folder structure
- Images and signatures in documents, article search across catalogues

## Current status (2026-09-22) – resume here

Done:
- Phase 0 code committed locally, `npm run check` passes.
- Supabase project moved to **Zurich** (eu-central-2), ref `nrtmpqhfdwnfavvrqghj`: linked, migration
  `20260922000000_foundation.sql` applied, types regenerated (unchanged).
- RLS verified with temporary test users (14/14 checks passed, test users deleted).
- Code pushed to GitHub; repo is **public** (history checked: no secrets, `.env` never committed).
  `gh` CLI installed and logged in as bohdanlupi.
- Deployed on Vercel: **https://bohdans-app.vercel.app** (`vercel.json` pins the Next.js preset).
  Auth config applied via `node scripts/configure-auth.mjs https://bohdans-app.vercel.app`:
  sign-up off, password ≥ 10, Site URL + redirect URLs (prod + localhost).
- First admin created in Supabase; login on the live site works.

Decisions 2026-09-22:
- **No SMTP.** Users are created on the website (Supabase → Authentication → Users → Add user, with password,
  auto-confirm); new users start as viewer and get their role in the app. The in-app e-mail invite and
  "Passwort vergessen" therefore do not send mails.
- London project deleted; only the Zurich project `nrtmpqhfdwnfavvrqghj` remains.
- Address CSV sample from the user will follow.

Phase 1 done (2026-09-22): migrations `20260922180000_addresses_projects.sql` and
`20260922190000_import_addresses.sql` applied to Zurich; 23 DB/RLS checks and page smoke tests passed.
CSV import: semicolon/comma/tab, UTF-8 or Windows-1252, column mapping with DE/FR/IT header guessing,
atomic via `import_addresses()` RPC. Waiting for the real address export from the user to verify.

Phases 2–4 done (2026-09-22), migrations up to `20260923200000_offers.sql` applied to Zurich.
Tested with temporary users against the live DB: tree numbering/moves, catalogue → LV copy, Vorausmass,
estimate totals, cost codes (LV / group / position), budget/KV roll-ups, offer prices, Rabatt/Skonto/MwSt,
ranking, all PDFs (LV tender/estimate, KV, letters DE/FR/IT, Vergabeantrag, Angebotsvergleich), all pages
in DE/FR/IT as planer and viewer. Not yet clicked through in a real browser by the user.

IGH catalogues (2026-09-23): migrations `20260924000000`–`20260924030000` applied to Zurich (supplier catalogue
columns, browse/search/subtree RPCs, RLS initplan, entry_count triggers, trigram search index).
`scripts/import-igh.mjs` imported 14 catalogues (~215k entries, DB ~220 MB of 500 MB): Biral, CTA, Danfoss,
Grundfos, Heim, Helios, IMI, Meier Tobler, Nussbaum, Oventrop, Sanitas, Siemens, Techem, Zehnder Lüftung.
Left out on purpose (free-plan size): Zehnder HK, Debrunner Acifer BW/TB/WG. Catalogue page and LV
"Aus Katalog" dialog load lazily with server search; LV/offer queries now page past the 1000-row API limit.
Tested end to end with a temporary planer (browse, search, insert into LV, read-only guard, PDF).

KWL-Auslegung (2026-09-25): calculations of `Berechnungsvorlagen/Lüftung KWL/2026-XXX_L_DimTool-Lupi.xlsm` ported to
`src/lib/kwl/` (air flows per room SIA 382/5 with LUPI defaults, min/party distribution, fan curves of the devices
→ operating points per stage, nominal stage, party flow, SPI check SIA 382/1, ODA/IDA → ISO 16890 filters, duct
sizing, door overflow, AUL/FOL distance, duct insulation). Results match the workbook example (Q350 ST: stages 5/4,
SPI 0.20, party 235.9 m³/h). Migration `20260925200000_ventilation_calcs.sql` applied to Zurich.
Since 2026-09-26 only Zehnder devices (see Lüftungsanlagen); the stage power table of the workbook is superseded by
the datasheet SPI. The AUL/FOL distance and insulation charts were digitised from images.

Heizungsplanung (2026-09-26): project tab «Heizung» (before «Lüftung»), a planning dossier by the SIA 108 phases
31–61 like the Lüftung (src/lib/heating/phases.ts: goals + checklists DE/FR/IT). Sources in `Berechnungsvorlagen/Heizung/`
(PDFs have priority over the Excel DimTool): SIA 384/1:2022, SIA 384/2:2020, SIA 384/6:2021 (EWS), EnDK EN-103 (2020),
SWKI HE301-01 (safety), HAKA floor heating planning guide; refs are written out in full. Items are filtered by the
Planungsgrundlagen: building, Neubau / Umbau / Ersatz Wärmeerzeuger, generators (WP Luft, Sole/EWS, Grundwasser, Pellets,
Stückholz, Fernwärme, Gas/Öl; multi-select), emitters (FBH, Heizkörper, TABS, Lufterhitzer), power / EBF thresholds,
Nutzeinheiten, Speicher, Kühlung. Warmwasser is left to the later Sanitär module (user decision). Calculations of the
DimTool (expansion vessel, pump, EWS, safety valve, heating curve, energy, HGT) are still to come. Shared parts:
src/lib/planning.ts (item/check types, lenient parsing, progress), src/components/planning/ (fields, plan-ui checklist,
autosave hook usePlan), src/pdf/plan-checklist-document.tsx. Migration `20260926200000_heating_plans.sql` applied.

Heizung Anlagen (2026-09-27): SIA 384/7 (Grundwasser) checklist items added. «Konzepte» = Norm-Heizlast after SIA 384/2
(src/lib/heating/heat-load.ts; spec from `384-2_2020_Vorlage.xlsx`, norm wins: θe,0 rounded as a whole, inertia Tabelle 7 /
Gl. 15, f1 Tabelle 4, building total without Φ_T,in (Gl. 13), f_i-z Tabelle 6, n_min by concept + room type, Δθs only on
heated surfaces, f_e,an per element depth, Anhang A for non-actively heated rooms; 40 SIA 2028 stations in climate.ts from
the template, overridable; groundwater factors 1/1.15/2 of the template as default). Site, climate and the construction
catalogue (U, ground Ueq Gl. 19/20, ψ, χ) are per project. Verified against the constructed spec example (686 W) and the
template test vectors (Ueq, Anhang A 18.30 °C). «Dimensionierung» = floor heating HAKA.GERODUR Nass-System
(src/lib/heating/floor.ts, data src/lib/heating/haka-data.ts GENERATED by scripts/gen-haka-data.mjs from the vector-
digitised charts B1–B9, C, D in `Berechnungsvorlagen/Heizung/Fussbodenheizung/digitalisiert/` – gitignored): group
temperature from the most demanding room at the design spacing, edge zone, largest sufficient spacing, downward loss,
mass flow, pipe length incl. edge zone, rings, Tab. D as drawn (17/13 @ 100 kg/h 58 Pa/m; guide text says 64). Rooms link to
the heat load; Qh = room load minus the elements marked «FBH». Max. ring length is a LUPI value (not in HAKA).
Heizung restructured (2026-09-27, user decision «start over, keep the checklists»): chapters 242 Wärmeerzeugung (System,
Warmwasser, Energiespeicher, Gruppen, Prinzipschema) and 243 Wärmeverteilung (Wärmebedarf SIA 384/2, Fussbodenheizung,
Heizkörper, Sicherheitseinrichtungen, Prinzipschema). Several Anlagen per project (heating_plants), chosen with an Anlage
bar (?anlage=, chapter-frame.tsx / plant-bar.tsx); Wärmebedarf is project-wide, the other 243 chapters belong to an
Anlage. The Planungsgrundlagen page was dropped: checklist params come from the chapters (effectiveHeatingParams in
src/lib/heating/params.ts: generators / cooling / storage from the Anlagen, floor from the FBH systems, power from the
heat loads, building data edited in 242 System). Engines of heat load and floor heating kept; their new UI and the
other subchapters (Warmwasser, Speicher sizing, Gruppen, Heizkörper, Sicherheit, both Prinzipschemas) follow one by one.
242 merged into one page (2026-10-05, user decision): building data, then the Anlage in four sectors – 1 Wärmequelle
(generators, parallel), 2 Warmwasser (Wassererwärmer via Umschaltventil, volume), 3 Energiespeicher (technischer
Speicher, volume), 4 Verteiler (druckbehaftet with Hauptpumpe / drucklos with Bypass, or decoupled by the Speicher)
with Heizgruppen (Drossel-, Umlenk-, Beimisch-, Einspritzschaltung mit Dreiweg- / Durchgangsventil; Wärmeabgabe,
kW, VL/RL, optional Wärmezähler; mismatch Schaltung vs. Verteiler only warns). Prinzipschema drawn live below
(src/lib/heating/generation-schema.ts, shared primitives for a later PDF): SIA 410 symbols, VL red solid / RL blue
dashed; source side per generator (EWS with Solepumpe + MAG, Grundwasser Zwischenkreis + Platten-WT + Brunnen,
Fernwärme Platten-WT with Wärmezähler + Regelventil, Holz with Rücklaufhochhaltung); parts SIA 410 lacks are built
from its parts («~ sinngemäss» in the legend). Each group: Kugelhähne, Thermometer VL/RL, VL-Fühler. Group emitters
also feed the checklist params. Plan PDF /api/pdf/heating-schema/<plantId> (src/pdf/heating-schema-document.tsx,
sheet as the Sanitär plan, trade «Heizung» in red; Plankopf in heating_plants.schema_plan, migration applied 2026-10-05).
Sicherheitseinrichtungen moved from 243 into 242 (2026-10-05): src/lib/heating/safety.ts after SWKI HE301-01 –
MAG mit vorgegebener Gasfüllung (3.2.4/3.2.5, verified against example B.6; e Tabelle 1, X Figur 5, Vsys Richtwert
Tabelle 13 or entered, Speicher without X, p0 = pst + pv + 0.3, pfin ≤ pSV / 1.3 or 1.15, VN next maker size, pfil),
separate Solekreis MAG (X = 2.5, Vwr ≥ 3 dm³, e from the glycol curves of Anhang A.5/A.6, digitised by eye), SV per
generator (boilers by Verdampfung + iSA2 Tab. 9 col. A, WP / Fernwärme by Ausdehnung Tab. 5), iSL Tab. 3, hints
(Druckbegrenzer > 300 kW, WMS, Vorschaltgefäss, 3.3). Schema: SV 1.26.10 on each generator, MAG on the RL main.
Kompressor / Druckhaltepumpe (B.8/B.9) not yet.
Generators are a list (heating_plants.data.generators: id, type, name, ΦN; several of one type; older type sets are
migrated on parse, ids = type). Schema: SV teed off the VL below the Absperrungen (VL/RL at one height, no
Rückflussverhinderer), MAG with Kappenventil + Entleerung and «Vorsicht nicht schliessen», Entleerungen (2.6.7) in
VL/RL of each group above and below.
Erdwärmesonden SIA 384/6 (2026-10-05, section 6 with a Sole/Wasser-WP): src/lib/heating/ews.ts + ews-data.ts – simplified
method D.4 (Figur 9 pixel-digitised, Figuren 3 / 12 / 13–21 read at grid points, ±1 %), Volllaststunden Gl. 15–18 (min.
1800 h), Zuschlag Gl. 20, Bodentemperatur C.2 (Gl. 4–10) and iteration Gl. 21/22 (stop at ≤ 5 m), Tabelle 2 R1–R4 with
future neighbour probes 3.5 (Gl. 1–3, Q_H,li = (Q0 + ΔQ·Ath/AE)·1.25, no climate correction of SIA 380/1), hydraulics
Darcy/Colebrook (laminar < 2300 → design +1.5 K), velocities, Verteiler ≤ 15 kPa, pump < 8 %, MAG 3 × ΔV/V0 ≥ 18 l
(compared with the HE301 Sole-MAG, larger wins). «Einfache Anlage» check (≤ 4 EWS, monovalent, Wohnen, no cooling).
Verified: D.4.8.1 111.5 m (norm 111.3), D.4.8.2 146.3 (146.5), D.4.8.4 R2 / 0 °C, D.7.4 0.187 kPa/m (0.19); the D.7.4
Zuleitung values of the norm are 2× the formula (norm doubles the length). cp of the brines not in the norm (Clariant).
Next: Warmwasser / Speicher sizing.
Materialauszug 242 (2026-10-05, last section of the page): src/lib/heating/hydraulics.ts (V̇ = Φ / (ρ·cp·ΔT) per
generator, Sole-/Zwischenkreis, WW-Anschluss, Heizgruppe, Hauptpumpe; DN = smallest Optipress-Therm size with v ≤
0.6 / 0.8 / 1.0 / 1.5 m/s; generator ΔT and every DN editable, data.dn) + src/lib/heating/material.ts + material-data.ts
GENERATED by scripts/gen-heating-material-data.mjs. User decisions: Wärmeerzeuger, Speicher, Wassererwärmer (with
Elektroeinsatz, default 9 kW, sizes its SV), Erdwärmesonden, Brunnen neutral; valves Nussbaum Optipress pressed on
Optipress-Therm (Kugelhahn 82100, Rückflussverhinderer 81163), Entleerung = Therm-T-Stück IG + Füll-/Entleerkugelhahn
55032.54; SV Afriso (IMI DG/Hswiss when the size / pressure is missing), all sized by Tabelle 5 – boilers too (user);
Entleerhahn MT ELV ½" before each SV; MAG Reflex N + SU Kappenventil + Wandhalterung ≤ 25 l + Afriso Manometer;
pumps Biral (PrimAX ≤ 2.5 m³/h, else ModulA RED / GREEN for Sole, head class 6 m – no curves); Siemens VXG44 / VVG44
with SAS61.03, VBI60…L + GLB161.9E as Umschaltventil; IMI STAD; GWF UltraMaXX (else neutral); HakaGerodur SAVE KH+F /
IS+F. Insertion into an LV per group like the Sanitär list. Open: Reflex N connection / pmax per size, pump curves,
MAG of the Zwischenkreis.

KWL-Planung (2026-09-25): the Lüftung tab is a planning dossier by SIA 108 phases 31, 32, 33, 41, 51, 52, 53, 61
(src/lib/kwl/phases.ts: goals + checklists DE/FR/IT with SIA 382/5 / SIA 108 references, conditional on the design
criteria). Calculations/diagrams from SIA 382/5 (src/lib/kwl/sia3825.ts): four-step design flows (5.4.3, Annex F
example verified), base ventilation 0.1 h⁻¹ / 0.3 h⁻¹, CO₂, simple extract system f-factor, Table 4/7 limits,
door gaps (Figure 3 reproduced with Cd 0.7), AUL/FOL distance (Figure 17), acoustics L_H / L_Aeq (Table 1, Annex C),
frost variants (Table 8), commissioning protocol (≤ 10 % balance, measured SPI). Migration
`20260925210000_ventilation_plans.sql` applied. Norm PDFs in `Berechnungsvorlagen/` are licensed SIA documents –
never commit them (repo is public).

Corrections 2026-09-26 (workbook vs. SIA 382/5 / EnDK EN-105 in `Berechnungsvorlagen/Lüftung KWL/`): minimum flow =
base ventilation 0.1 h⁻¹ per supply room and dwelling (was 0.25 m³/h·m², min. 50 m³/h); door gaps per Fig. 3 at
1.5 m/s (was 2 m/s); pressure presets per Table 7 (150 / 100 Pa, was 120/180/240); default IDA 3; steps 3 + 4
(button); duct velocities per EN-105 5.1 (workbook 2.5 m/s values kept as LUPI recommendation); insulation per
EN-105 Table 1 / Figure 1 (was a ΔT-only chart); SPI reference SIA 382/1 5.7.4.1; EN-105/EN-110 checklist items.

Lüftungsanlagen (2026-09-26, replaces the per-dwelling «Druckverlust» tab): /projekte/[id]/lueftung/anlagen, table
ventilation_systems (data jsonb, src/lib/kwl/system-schema.ts). One branched network per system over the whole
building: outdoor chain, supply tree, extract tree, exhaust chain (src/lib/kwl/network.ts); terminals linked to
dwelling rooms (flows from the dwellings, rooms have a «Geschoss»); path Δp cumulative, critical path = external
pressure, throttle per leaf, EN-105 velocities, manufacturer recommended range. Prinzipschema drawn automatically
with SIA 410 symbols and LUPI colours (AUL rgb(0,255,0), ZUL rgb(255,0,0), ABL rgb(255,192,0), FOL rgb(0,0,255); schema-layout.ts), click to edit. Symbols (flow arrow 3.1.7, grilles 3.2.1/2, louvre 3.3.1, damper 3.3.4, silencer 3.3.6, filter G/F/A 3.3.8, coils: ComfoFond heating/cooling 3.3.15/16, ComfoClime cooling 3.3.16, heat recovery 3.3.18, distributor 3.3.19, fan 3.4.1, orifice 3.4.9) are shared primitives in src/lib/kwl/schema-symbols.ts for web and PDF; labels sit above each symbol (its `top`), air names below the lines. Product data:
src/lib/kwl/zehnder-data.ts, GENERATED by scripts/gen-zehnder-data.mjs from the Zehnder CH datasheets digitised to JSON in
`Berechnungsvorlagen/Lüftung KWL/Zehnder Daten/digitalisiert/` (gitignored; vector curves calibrated on the grid),
plus src/lib/kwl/meiertobler-data.ts GENERATED by scripts/gen-meiertobler-data.mjs from the Meier Tobler IGH
catalogue in the DB (spiro pipes à 3 m → LV in pieces, bends, T-pieces, saddles, reducers, joints, caps, dampers,
insulated silencers; no manufacturer Δp data: pipes Darcy–Weisbach steel, fittings ζ reference values). Only these
two manufacturers (2026-09-26, user decision); dropdowns grouped «manufacturer · family», fittings filtered by role
(bend / tee / other). 2026-09-27: element types Leitung, Reduktion (MT reducers), T-Stück, Verteiler, Komponente,
Luftdurchlass – bends only on the duct (old «bend» nodes still work); Komponente = MT Rohrabschluss / Enddeckel,
Rohrschalldämpfer, Absperrklappen, Revisionsdeckel + Zehnder ComfoSilence / ComfoFresh. In the outdoor / exhaust air
also Schmidlin caps and weather protection grilles: src/lib/kwl/schmidlin-data.ts GENERATED by
scripts/gen-schmidlin-data.mjs from the Schmidlin price book PDF (Berechnungsvorlagen/Lüftung KWL/Schmidlin, list
01.2014 × 1.2 from 01.07.2026); `--import` replaces the priced catalogue (catalogs.source 'pricebook'). Round parts
limited to the diameter of the adjacent duct, exhaust-only parts (Regenhut, Säulenhut, WSH) only in the exhaust air;
ζ reference values (no Schmidlin Δp data). Article numbers are made up as code-size-variant-material.
Standardnetz (network-defaults.ts): silencer first on all four strands, one Geschossleitung + distributor per storey;
terminals by room type – 1.1 Zimmer: CSB-P 400/600 + Bilamina; 2.5: ComfoValve Via STC on Spiro DN 125; all others:
CLD breit 2×90 + Genua breit. Quantities add one ComfoSet per ComfoTube connection at an Auslass (short 30 mm in
CSB-P / EBK, L 75 mm otherwise; none for ComfoValve), chapter 3 Regulierung (comfoSetFor in network.ts).
Prinzipschema PDF (2026-09-27): own button + dialog (SIA phase, optional new revision with comment → 
ventilation_systems.schema_plan {phase, revisions[index, initials, date, comment]}), route /api/pdf/kwl-schema/<id>,
src/pdf/kwl-schema-document.tsx: smallest ISO landscape sheet A3…A0 with schema scale ≥ 0.75, frame, legend of the
used symbols (schemaLegend / drawSymbol in schema-symbols.ts), title block rebuilt as vector after
vorlagen/Vorlage_Plankopf.pdf (gitignored scan). projects.parcel = Parzellen-Nr. The Lüftungsanlage PDF no longer
contains the schema.
ComfoAir Q extras (src/lib/kwl/controls.ts, articles from the Zehnder IGH catalogue): filter set (G4/F7 default, G4/G4,
Aktivkohle, Fresh Scent) checked against the dwellings' filter concept (filterConceptWarnings in evaluate.ts; one filter
per side, so two-stage supply requirements always warn), control units ComfoSense CCH / ComfoSwitch CCH / ComfoSense
Feller / RFZ (+ Aufputzgehäuse), sensors RFF / C67 / V67 (UP/AP), interfaces ComfoConnect LAN C / KNX C / Pro; Option
Box added for 0-10 V sensors unless the ComfoFond-L Q (own Option Box). Stored in deviceOptions; schema: filters with ISO
class inside the unit, control row on a dashed line below it (schemaExtras); quantities chapter 3, filter set chapter 0. Product keys are referenced by saved networks, keep them stable (currentProductKey maps old
generic «spiro-D» → Meier Tobler). Devices: only the 7 Zehnder datasheet units (no workbook devices, no Hoval/Helios);
old device ids (…-st) are mapped, unknown ones dropped. No fan Kennlinien, operating points, device diagrams or party flows (2026-09-26, user decision: the
datasheet data of the units is not uniform); the device tab shows the uniform datasheet check only (max. external
pressure per side, power from the measurement table → SPI). Device check from the datasheet (max. external pressure
line; power by least-squares fit SPI = a + b·p + c·q of the measurement table, ≤ 5 % on the table points); its SPI
has priority over the stage power table in the dwelling too.
Device attachments (src/lib/kwl/attachments.ts, data zehnderAttachments in zehnder-data.ts), stored as
data.device.options (dwelling) / deviceOptions (system): enthalpy exchanger (Q, SL, Flex – PHI values; E article of
the Q unit; no Δp data), ComfoFond-L Q (Q only; supply left / right version; Δp with/without filter added to the supply-side external pressure,
pump power shown, not in the SPI), ComfoClime 24 (Q350/Q450) / 36 (Q450/Q600): available pressure = 100 % fan curve
of the combination (not above the device limit), stage table hidden, no power data for the combination; mandatory
EPP adapter kit. Device + attachments go into the LV with the quantities.
Dwellings served by a system take its external pressures. Quantities → LV group (IGH Zehnder / Meier Tobler / Schmidlin price book catalogue positions by
primary article number, else R-positions naming the article; grille/valve of the chosen curve as its own line).
Duct bends: node.bendCounts per angle 15/30/45/60/90 (per duct; old «bends» = 90°). bendFor() picks the fitting of
the duct system and size (Meier Tobler spiro bend, segment bend from DN 224; ComfoPipe Compact/Plus 45°/90°;
ComfoTube Flow / flat 51 / Therm 90°): its curve per piece or ζ; else ζ reference 0.06…0.3 and an R-position in the LV.
Bends go into the LV × parallel ducts.
LV structure «Lüftung» (template Berechnungsvorlagen/Lüftung KWL/Vorlage Leistungsverzeichniss Struktur Lüftung.xlsx):
LV toolbar button «Struktur Lüftung» (src/lib/lv-ventilation-structure.ts, createVentilationStructure) creates BKP 244 with
chapters 0 Geräte … 6 Dämmung in 1 / 2 (LA01 - <Anlage>) / 3 (Los › Anlage) levels as groups with custom_number, texts
in the LV language; refused if a top-level 244 exists. Quantities carry a key and a default chapter (0 devices, 1
ducts / fittings, 2 distributors / silencers / filters / dampers, 4 terminals / grilles); the quantities panel preselects
the chapters below «LAxx - <system name>» (or 244 with one level) and inserts each line into its chosen chapter.
Terminals = Auslass (ComfoCase, node.product) + cover (node.cover: grille / disc valve product, or «case:<name>»
for a combination measured in the case datasheet). Δp: measured combination if chosen, else cover curve (default =
most open setting) + manual Auslass allowance (dpRef/qRef) – the datasheets give no Δp of the case alone. Old
terminals with a grille/valve as product are moved to the cover. Both parts go into the LV; schema shows
«Auslass + cover» under the room.
PDFs: /api/pdf/kwl/<calcId>?variant=flows|full – «flows» = air flows + filter classes (draft before the pressure
drop calculation), «full» = with device, external pressures (source), Table 7, device check, stages; default «full»
once a system serves the dwelling. /api/pdf/kwl-system/<systemId> – system: device + attachments, results and
notices, strands with throttling, Prinzipschema (landscape, src/pdf/kwl-system-document.tsx redraws the layout with
react-pdf primitives), elements per air type, quantities. WinAnsi only: winAnsi() replaces Δ, ζ, ≤, ≥, →.
Old star networks (data.network, pressure.ts) are only kept for the «Sternnetz übernehmen» conversion.

Wärmebedarf: Gebäudeträgheit per room (HeatRoom.inertia / tau / inertiaManual; null = the project site inertia);
θe,0 is computed per room (RoomResult.thetaE0), also for Anhang A and the floor heating link; set in the room
details, θe,0 per room in the PDF room list.

Sanitär (2026-09-30, project tab «Sanitär», table sanitary_systems, src/lib/sanitary/): Trinkwasseranlagen with
Zentrale (Hausanschluss, Wasserzähler, Filter / Redfil, DRV, Enthärtung, Verteilbatterie, Sicherheitsgarnitur,
Wassererwärmer neutral, thermischer Mischer neutral) and a free tree of pipe sections carrying PWC and / or PWH, with
PWH-C «konventionell» (separate Optipress return) or «Rohr an Rohr» (Optiflex return along the steel PWH, one
insulation one size larger); Steigstrang sections (riser) and Apparategruppen (outlets of W3 Tabelle 3).
Optiflex lines use only Optiflex-Flowpress parts (pipes 87153, Schrägsitzventil 86510; no Flowpress RV / Entleerung, so
the threaded RV 15101 and no drain); the PE-RT 1-LU pipe is gone, Rohr an Rohr returns are Flowpress 16–32.
Dimensions are written «NW 22» (Optipress-Aquaplus) and «Pex 16» (Optiflex-Flowpress); the Zentrale texts carry the
entered lengths.
User decisions: all components Nussbaum (IGH catalogue, scripts/gen-nussbaum-data.mjs → catalog-data.ts), pump Biral
(CompAX / ModulA BLUE, suggested by the type head – no curves in IGH), Wassererwärmer always neutral; per Strang
Absperrventil mit Entleerung on PWC / PWH / PWH-C, Rückflussverhinderer, Regulierventil 36030 (thermal) or 24026
(manual) per Strang.
Sizing PWC / PWH: SVGW W3 2013 (Berechnungsvorlagen/Sanitär/SVGW Richtlinie W3.pdf) Tabellen 4.1 / 4.2 / 4.3 by
LU and developed length (floor groups / Verteilleitungen, «mit Wasserzähler»), else by Q_D (Diagramm 1:
0.459·Q_T^0.353, 0.598·Q_T^0.257 with a 0.5 l/s outlet) and the velocity limits 2.1.3; Hausanschluss Tabelle 5.
Zirkulation: heat-loss method of Original_Zirkulation_Berchnung_RN_fam_260929.xlsm (0.12 kWh/(m·d) ×2 L konventionell,
0.15 × L Rohr an Rohr, split by the heat losses behind each branch, +20 % Formstücke, pump head = longest circuit
+ 85 mbar RV + 105 mbar Regulierorgan); R by Darcy–Weisbach / Colebrook at the mean water temperature (matches the
Nussbaum tables); Rohr an Rohr counts PWH steel + Optiflex (user decision; the workbook counts only the Optiflex).
Verified against the workbook: 429.4 l/h (Excel 429.7), 326.9 mbar (Excel 326.7). Excel bug noted: Dimensionierung!I22
uses I21 instead of I12. Insulation: LUPI standard Berechnungsvorlagen/Sanitär/Dämmung_Sanitär.xlsx (replaces SIA 385/1 Tabelle 3, which is
stricter): material PIR or Mineralwolle; konventionell Kaltwasser 30 mm (PIR) / 40 mm (Mineralwolle), Warmwasser / Zirkulation by pipe size
(PIR 30 … 80, Mineralwolle 60 … 100); Rohr an Rohr one insulation from the table «Rohr an Rohr» by the PWH size (fictive
pipe one dimension larger), PWH-C none. Insulated: PWH of circulated sections and of the Verteilung, PWH-C, PWC
Verteil- / Steigleitungen (switchable). Warning above 65 °C (SIA 385/1 4.1.1).
Prinzipschema: Strangschema (schema.ts; symbols after SVGW W3 Anhang 4 / SN EN 806-1, SIA 410 only where W3 has none:
Enthärtung 1.27.1, Wassererwärmer 5.1.19, adjustable arrow of the Regulierventil von Hand; PWC green, PWH red, PWH-C
orange, like the Schemavorlage). Drawn after Berechnungsvorlagen/Sanitär/Schemavorlage_Sanitär.pdf (2026-10-09): Verteilbatterie as a
collector with an Abgang per line (Absperrventil mit Entleerung, Verschraubung) and an Entleerung at its end; each
Apparategruppe as a Verteiler with one outlet per Apparat and
every Apparat (counts expanded, max 16) drawn on its own PWC / PWH line (Waschtisch, WC UP-Spülkasten, Dusche,
Badewanne, Geschirrspüler, Waschautomat, Urinoir, Balkon- / Gartenventil; light blue bodies).
Ausstossleitungen (2026-10-09): an Apparategruppe holds its Apparate as a list (SanNode.outlets; older data with counts per
type is converted on load), order = order along the Verteiler (◀ / ▶ in the editor). Each Apparat has its own Pex line
(Optiflex-Flowpress) for PWC and PWH with length and size (auto: smallest Pex ≤ 4 m/s at the tap flow of W3 Tabelle 3);
the lengths go into the material list. Drawn like the Schemavorlage: down out of the Verteiler, along below it, up to
the Apparat, with size / length / Ausstosszeit under it. Ausstosszeit = PWH water content from the last warmgehaltene
point (end of the circulated sections, else the Wassererwärmer incl. its line in the Zentrale) ÷ tap flow (user
decision; SIA 385/2 with pipe heat-up not available), warning above SIA 385/1 4.3: 10 s with Warmhaltung, 15 s without.
Verteiler per Apparategruppe (2026-10-09, SanNode.distributor, distributor.ts; replaces Wohnungswasserzähler / Unterputz on
the Leitung, older data moved down on load): «PEX-Verteiler im Kasten» (Verteilerkasten 86044, 400–900 by the outlets),
«Aufputz», «hinter WT»; per line PWC / PWH Absperrung, Druckreduzierung, Wasserzähler or Passstück (meter to follow).
Hinter WT, both lines together: only Absperrung + Wasserzähler / Passstück → Unterputz-Waschtischbox 70120 (Messkapsel
Koax 67016 per meter, Blinddeckel for the Passstück, the Waschtisch fed from the box without a Pex line or Verteiler
outlet); only Absperrung + Druckreduzierung → Unterputz-Armaturenbox 70112 + Reduzierpatrone 11050 per line; else single
articles. Single articles: Schrägsitzventil, Druckreduzierventil 11000 (2–6 bar), Rohbauset 67100 (+ Messkapsel 67016
for a meter). W3 Tabellen 4.1 / 4.2 «mit Wasserzähler» when a Verteiler of the group has a meter or Passstück. Web view at a fixed
scale (1.3 px per unit), full height, horizontal slider below to move it + plan PDF /api/pdf/sanitary-schema/<id> (Plankopf / revisions as the Lüftung schema; sheet height 297 / 420 /
594 mm, width a multiple of 210 mm, wide enough for schema and legend).
Insulation drawn as yellow bands with black dotted edges; each Leitung is labelled «KW / WW / ZK: diameter · insulation»
and «Dämmung: PIR / Mineralwolle» (no thickness classes in the legend).
Material list: Nussbaum pipes / valves, Biral pump, insulation as Meier Tobler shells (Mineralwolle ROHHE r.Heat A Alu
kaschiert, PIR swisspor Kisodur PIR Alu glatt; scripts/gen-sanitary-insulation.mjs → insulation-data.ts), shell by
pipe OD (Rohr an Rohr: fictive pipe one size larger) and thickness, next larger size where missing, +20 % for
fittings; inserted into an LV per group (Rohre / Armaturen / Zentrale / Dämmung) like the Lüftung quantities.
Zentrale lines (Hauseinführung → Verteilbatterie, → Verteilung, cold feed, PWH / PWH-C Wassererwärmer → Verteilung) are
insulated and labelled like the Leitungen; with their lengths (central.trunkLength, centralLength, heaterLength)
they add pipes and insulation to the material list.
Fittings (fittings.ts, material list «Rohre», not in Δp): Bogen 90° / 45° entered per Leitung for all its lines;
T-Stücke at branches (reduced where Nussbaum has them, else equal T + Reduktion) and where the PWH-C joins the PWH;
Reduktionen; Übergänge Aquaplus → Flowpress (84234); Muffen per 6 m bar; Flowpress-Verteiler 2/3/4-fach per
Apparategruppe for PWC and PWH with Verteileranschluss (84250) or Aquaplus-Übergang ¾ (80033).
Editor order: Zentrale | Zirkulation | Berechnung; Schema with the Verteilung below it and the element panel (Leitung)
to the right; Materialliste.

243 Heizkörper (2026-10-10): per Anlage (heating_plants.radiators) and Heizgruppe, rooms from the Wärmebedarf with
1..n Heizkörper (load split evenly or by share). Zehnder Charleston / Clinic / Turned / Nova Jet horizontal / vertikal:
Φ50 and n from the technical catalogues, sized by Φ = Φ50 · ((θVL + θRL)/2 − θi) / 50)^n (arithmetic ΔT as Zehnder's
CK table) for the group temperatures, shortest size that covers the load (size by hand possible). Zehnder gives the
output for gleichseitig only – other Anschlüsse via factor f (default 1). Anschluss gleichseitig / wechselseitig /
unten (Ventilheizkörper) / unten beidseitig, VL side, pipe from Boden / Wand / Decke; Oventrop armatures (Meier Tobler
articles): Thermostatventil AQ (default) / AV 9 / Serie A, form proposed from the geometry, Rücklaufverschraubung Combi 3
(drained through it) or Combi 2 + ELV Entleerhahn, Uni LH head, Multiflex F for Ventilheizkörper, Watts RDT/K vent.
Data generated by scripts/gen-radiator-data.mjs (PDFs in Berechnungsvorlagen/Heizung + IGH ZehnderHK / MeierTobler zips,
needs pdftotext) → radiator-data.ts; Zehnder article = head article + length (5 digits). The Strangschema links them
(HeatNode.radiatorId), «n Heizkörper übernehmen» builds a Strang per storey; they are drawn with body, valves, vent and
drain by Anschluss and side, and give the Materialauszug their articles.

Gebäudemodell, Plan-Tracing und SIA 380/1 (planned 2026-10-26; user decisions: tracing option B, 380/1 + 384/2 first, cooling
after SIA 382/2 with the SIA 2024 usage data later, no automatic wall / room recognition). Sources: Berechnungsvorlagen/SIA/
SIA_380-1_2016.pdf (norm wins), Berechnungsvorlagen/Heizung/19_sia_380-1_2016_-win-10_1_12.xlsx (Martinelli + Menti v10.1.12 as
formula reference; hidden sheets «Daten» = Standardnutzungen + shading tables, «Klima» = 77 stations SIA 2028:2010),
SIA_MB_2024_Alle_Nutzungen.pdf, SIA_MB_4028/ (prSIA 4028 draft climate data; final data follows from the user). No completed
380/1 example exists yet – verification against hand-filled Excel cases of our own. Test project 2026-010 Villa Grünenberg
(Umbau, Wädenswil): `Berechnungsvorlagen/Heizung/Test Wärmebedarf/260828_Villa Grünenberg_A1.pdf`, 8 vector pages A1 1:50 with
text layer (room names, BF / FF areas, dimensions), floor plans + sections (storey heights).

Goal: one geometric building model per project, traced over the architect's plans, feeding (1) the envelope areas of SIA 380/1
and SIA 384/2 – both use Aussenmasse after SIA 380 (SIA 384/2 p. 6, 380/1 3.2.2), (2) the net room areas / volumes of 384/2 and
the EBF of 380/1, (3) later the room lists of Lüftung / Heizkörper / FBH and the cooling load.

Tracing (option B): per Geschoss one outer polygon along the external face of the thermal envelope plus one polygon per room
along the inner wall faces. The app assigns each envelope segment to the room whose wall runs parallel behind it within the
matching tolerance (default wall thickness per floor, 0.5 m; override per segment); unmatched segments are flagged and tagged
by hand. Segments carry orientation (segment angle + north arrow, 16 directions for 380/1, 8 + H for 384/2), adjacency
(outside / unheated / ground; default outside), construction and openings (window / door: width from the plan, height from
the floor default or entered, g-value, frame share, shading angles horizon / overhang / fins). Shared edges between rooms
become interior partitions (384/2 «heated» with neighbourMode «room», «unheated» towards passive rooms). Floors / ceilings:
room area against the room matched below / above by polygon overlap, against ground (Anhang B / 380/1 Tabelle 16), outside
(roof) or unheated (attic / cellar). Rule: geometry wins; manual values only in the existing override fields (areaOverride,
nMinOverride …), marked in the UI, regenerated derived values never overwrite them.

Plan files: bucket «plans» (PDF / PNG / JPEG, 50 MB, private, browser upload + signed URLs like «receipts»). One page per
Geschoss; pdfjs-dist moves to dependencies (worker from /public) and rasterises the page once in the browser → PNG snapshot
stored next to the PDF (pan / zoom bitmap, PDF report image; Vercel has no server-side rasteriser). Calibration: two points +
real distance, rotation, north arrow, origin; vector PDFs offer the text layer (room names / printed areas) as suggestions.

Data model: building_plans (id, project_id, floor key, name, storage_path pdf + png, page, px size, scale m/px, rotation,
north angle, origin) and building_models (project_id PK, data jsonb → src/lib/building/schema.ts): floors [key, name, level,
height, wall thickness, plan id], zones [id, name, Gebäudekategorie I–XII, Neubau / Umbau, standard or project Nutzung values,
θi, Regelung, Bauweise / Wärmespeicherfähigkeit], rooms [id, number, name, floor, zone, polygon in plan metres, heated /
passive, θi, height override, SIA 2024 room type (later)], envelope [id, floor, polygon; segments with constructionId,
adjacency, orientation / tolerance override, openings [type, width, height, sill, constructionId (U, g, frame), shading]],
links (segment ↔ room, room ↔ room above / below). The construction catalogue moves from heating_plans.data into the model
(g-value, frame share, Wärmespeicherfähigkeit added; old catalogue copied on load). heating_calcs rooms get modelRoomId,
derived elements a sourceId (segment / opening / slab) and are regenerated from the model; the manual editor stays for
projects without plans.

SIA 380/1 (src/lib/building/sia3801.ts, Excel formulas as test vectors, norm wins): monthly balance per zone. Q_T per element
with b-values (unheated: Tabelle 15 cases; ground: Tabelle 16 by U, A_FG/P_FG, depth; benachbart beheizt by the neighbour θ),
Bauteilheizung correction (Excel: (θi + Regelung − 1) + (θ_HF,max − θi)/4), bridges ψ·l·b and χ·b. Q_V from the flächen-
bezogene Aussenluft-Volumenstrom (Standardnutzung, or effective with WRG η and Lüftungseffektivität), ρ·c of air by altitude
(Excel: (1220 − 0.14·h)/3600). Q_i,el and Q_i,P from the Nutzung. Q_s per window: G(month, orientation) · A · g · 0.9 · frame
share · f_s1 (horizon) · f_s2 (overhang) · f_s3,l · f_s3,r (fins), 16 orientations interpolated between S / O / W / N. γ, τ =
C_R / H, a = 1 + τ/15, η_g, Q_H = Q_T + Q_V − η_g (Q_i + Q_s). Grenz- / Zielwert Q_H,li = (Q_H,li0 + ΔQ_H,li · A_th/A_E) · f_cor,
f_cor = 1 + (9.4 − θ_avg)·0.06, Umbau factor, Einzelbauteilnachweis Tabellen 3 / 4 / 5, Ph,li. Results per month and year, PDF
after the «Drucken» sheet (/api/pdf/sia3801/<projectId>). Climate: monthly θe + G horizontal / S / O / W / N per station; set
«SIA 2028:2010» from the Excel «Klima» sheet (Nachweis), set «SIA 4028» from Tabelle 4 Monatswerte + Tabelle 7 Winterauslegung
(replaces climate.ts for 384/2 too); each calculation records its climate set. Standardnutzung of 380/1 (Excel «Daten» rows
2–13 incl. Ph,li) as default, SIA 2024 values later for the cooling.

App: new project tab «Gebäude» (before Heizung): /projekte/[id]/gebaeude (floors, plan upload + calibration),
/gebaeude/plan/[floor] (tracing editor: select / room polygon / envelope polygon / opening / measure; snapping to vertices and
orthogonal; pan / zoom; undo; room panel name / zone / θi / height; segment panel construction / adjacency / openings),
/gebaeude/zonen (zones, Nutzung, EBF per floor), /gebaeude/sia3801 (results, PDF). Wärmebedarf shows «aus Gebäudemodell»
rooms with their derived elements read-only plus the override fields.

Phases: (A) bucket, upload, calibration, room polygons → area / volume / EBF, heat-load rooms linked. (B) Envelope polygons,
segment ↔ room matching, constructions / adjacency / openings → derived 384/2 elements. (C) Floors / ceilings across storeys,
zones, SIA 380/1 calculation + PDF, climate sets. (D) Plan overlay in the PDFs, text-layer suggestions, SIA 2024 room types.
Expected problems: scale / rotation of exported PDFs, external vs internal mismatch at the segment matching, heights not in
the plan, large vector PDFs (render once), two sources of truth (geometry wins), editor size (own state model, undo).
Phase A built 2026-10-26 (migration `20261026100000_building_model.sql` applied to Zurich by the user the same day; types
regenerated): project tab «Gebäude» (/projekte/[id]/gebaeude,
src/lib/building/: schema.ts, geometry.ts, model.ts, pdf-render.ts, heat-link.ts). Geschosse table (name, level, lichte Höhe,
Aussenwand-Dicke 0.5 m default, plan, rooms, A beheizt; autosaved via usePlan), plan upload per Geschoss (plan-upload.tsx:
PDF page picked from thumbnails and rendered in the browser with pdfjs-dist – now a dependency, worker copied to
public/pdf.worker.min.mjs by scripts/copy-pdf-worker.mjs, eslint-ignored – longest side 7000 px PNG; or PNG / JPEG as is;
original + snapshot in bucket «plans» under <project>/<plan id>/, row in building_plans; replacing a plan keeps the rooms).
Tracing editor /gebaeude/plan/[floor] (plan-editor.tsx): SVG with the snapshot as <image>, pan (middle / right / Alt-drag),
wheel zoom, tools Wählen / Raum (polygon, snap to vertices 10 px, Ortho = axis lock, Shift inverts; close on first point,
double-click or Enter) / Massstab (two points + distance → scale m/px) / Norden (two points → north angle) / Messen; vertex
dragging, undo (state history, Ctrl+Z), room panel (Nr., Name, beheizt / unbeheizt, θi, own height, area / perimeter /
volume), room list with zoom-to. Geometry in snapshot px, metres via scale (model.ts roomMetrics). Wärmebedarf: HeatRoom.
modelRoomId; button «Räume aus Gebäudemodell» imports unlinked rooms, linked rooms are re-synced on page load (geometry
wins: Nr., Name, Geschoss, Art, θi, A, h read-only, Notice + Save enabled when the stored values differed).
Phase B followed the same day (below).
Phase B built 2026-10-26 (same day): thermal envelope per Geschoss (BuildingModel.envelopes, one polygon along the external
face; vertex carries the attributes of the segment starting there: constructionId, adjacency outside / unheated / ground,
orientation override, tolerance override, openings [kind window / door, at (fraction), width, height (null = Geschoss
windowHeight / 2.1 m door), count, constructionId]). Floors got storeyHeight (Geschosshöhe, null = lichte Höhe + 0.3) and
windowHeight. src/lib/building/envelope.ts: evaluateEnvelope – inward normal by point-in-polygon probe, rooms' edges
parallel (≤ 12°) behind the segment within the tolerance (wall thickness) → matches as fractions, then extendToExternal
gives corner / partition gaps ≤ 2 × wall thickness to the adjacent rooms (Aussenmasse; larger gaps stay «uncovered» and
are drawn red), bearing of the outward normal → 8 orientations, openings assigned by their centre; findPartitions –
coincident parallel room edges (tolerance = wall thickness), normal facing away from room A. heat-link.ts deriveElements:
per room walls (length × Geschosshöhe, deduction = openings), openings (width × height × count), partitions only towards
passive rooms or heated rooms at another θ (neighbourMode «room» when the neighbour is linked in the calculation, else its
θ); RoomElement.sourceId (w:<vertex>:<room>:<i>, o:<opening>, p:<a>:<b>:<edge>:a|b) – derived elements are regenerated
on load, keep their ids, are read-only (link icon) and cannot be deleted in the heat editor; manual elements stay.
Editor: tools Hülle (3, only while none exists; delete in the panel) and Öffnung (4, two clicks on a segment), segment
selection (8 px), double-click inserts a vertex, segment panel (length, bearing → orientation, rooms behind with
lengths, uncovered warning, construction from the heating catalogue, adjacency, orientation override, wall thickness,
openings list with kind / width / height / count / construction / position), room panel lists its external walls.
Deviation from the plan text: the construction catalogue stays in heating_plans.data (loaded into the Gebäude pages),
g-value / frame share are added there for 380/1 in phase C. Verified with a synthetic 10 × 6 m two-room model
(scratchpad test: 5.00 / 6.00 m walls, 3.9 m² window deduction, partition O / W).
Phase C followed the same day (below).
Phase C built 2026-10-26 (same day). Data: scripts/gen-sia3801-data.mjs → src/lib/building/sia3801-data.ts (GENERATED, committed):
climate set «sia2028» = 40 stations of the Excel «Klima» sheet (monthly θe, G on S/O/W/N/horizontal in MJ/m², θe,avg,
design θe), «sia4028» = 60 stations of the prSIA 4028 Kompaktdaten (Tabelle 4 Monatswerte, altitude from Tabellen 1 / 2,
design θe = Tabelle 7 «4 Tage kalt», matched by abbreviation; the Monatswerte are stored as text in the xlsx), shading
tables f_s1 / f_s2 / f_s3 (Excel «Daten» rows 101–333, 13 orientation groups), Standardnutzung of the 12 categories
(«Daten» rows 5–16 incl. Q_H,li0 / ΔQ_H,li / Ph,li). Construction got gValue / frameFactor (catalogue columns g, f_F).
Model (schema.ts): zones [category I–XII, Neubau / Umbau, θi override, Regelung 0/1/2 K, Bauweise C_R/A_E 0.15/0.08/
0.03/0.01, airflow override, η WRG, Wärmebrücken % + list ψ·l·b, θ_VL Bodenheizung], room.zoneId (null = the only
zone), climate {set, station}, floors: floorAdjacency / floorConstructionId / ceilingAdjacency / ceilingConstructionId /
slabConstructionId / partitionConstructionId + Tabelle 17 b cases (attic 0.9/0.7, cellarBelow 0.7/0.5, cellarAbove
0.8/0.7, annex 0.8/0.7, glazed 0.9) on floors, vertices and passive rooms; openings: horizon / overhang / finLeft /
finRight angles. stack.ts: plan px → building metres (origin = reference point tool «Referenz», rotation from north),
rooms above / below by grid-sampled polygon overlap (≤ 20 000 cells), slab areas × factor envelope area / Σ room areas
(Aussenmasse), sampling residue < 1 % absorbed. heat-link.ts derives floors / ceilings (slab to rooms of another θ or
passive, remainder to the Geschoss adjacency) besides walls / openings / partitions; the heat load gets them as
areaOverride elements with orientation H. sia3801.ts: monthly balance per zone exactly as the Excel (Q_T with b, Bauteil-
heizung (θ_HF − θi)/4 on floors, Q_V with ρc by altitude, Q_i from the Standardnutzung, Q_s with 16-direction geometric
interpolation and shading factors, γ / τ = C_R/H / a = 1 + τ/15 / η_g, Q_H ≥ 0 per month), A_th, Q_H,li = (Q_H,li0 +
ΔQ_H,li·A_th/A_E)·f_cor, Umbau × 1.5 and Zielwert Neubau 0.7 × li as in the Excel (the norm text of 2.3.10–2.3.12 is
unreadable in the PDF – check against the norm when a readable copy is at hand), EBF-weighted building values, warnings.
UI: Gebäude overview = building-view.tsx (Geschosse, «Decken und Böden», «Nutzungszonen SIA 380/1», «Klima»),
/gebaeude/sia3801 results page (building tiles, per zone facts, monthly table, element list) + PDF /api/pdf/sia3801/<id>
(src/pdf/sia3801-document.tsx). Editor: zone select and b case per room, b case per unheated segment, shading angles per
window, tool «Referenz» (origin). Verified with a synthetic 2-storey 10 × 10 m model (scratchpad test): January Q_T / Q_V /
Q_i / Q_s and the Grenzwert equal the hand formulas (47.9 kWh/m² at A_th/A_E 2.13, Zürich). No real 380/1 example yet.
Phase D followed the same day (below).
Phase D built 2026-10-26 (same day; migration `20261026200000_building_plan_labels.sql` adds building_plans.labels jsonb +
preview_path – to be applied by the user). Plan upload also renders a 2400 px preview (preview-<n>.png) and stores the
PDF text layer as labels [{text, x, y}] in snapshot px (pdf-render.ts labels(); images give none). Editor: when a room is
closed, the labels inside the polygon suggest the name (first alphabetic item) and the printed area (BF / NGF / HNF / NF / GF
… m²); the room panel shows «Plan: <name> · BF x m² (±n %)» with «Namen übernehmen», and a SIA 2024 Raumnutzung select
(src/lib/building/sia2024-data.ts GENERATED by scripts/gen-sia2024-data.mjs from SIA_MB_2024_Alle_Nutzungen.pdf: 45 usages
with code, name, design θ cooling / heating, Personenfläche, person + device heat, hours / days – for the later cooling
load; BuildingRoom.usage). Plan PDF /api/pdf/building/<projectId> (src/pdf/building-plan-document.tsx): one A3 landscape
page per Geschoss with the preview (snapshot for older plans) and a react-pdf SVG overlay in snapshot px (rooms red /
blue with number, name, area; envelope by adjacency; openings; segment orientation + length; north arrow) plus the room
table; button «Plan-PDF» on the Gebäude page. Verified with a synthetic render (scratchpad, 1 × 1 PNG). Fix the same
day: autosave revalidated the whole layout → the editor reloaded the 7000 px snapshot on every save and the tab crashed;
now the editor loads /api/gebaeude/plan/<planId> (redirect to a 5-min signed URL) and the actions revalidate only the
overview page. Open: cooling (SIA 382/2 with SIA 2024 data, needs hourly climate), SIA 380/1 check against a real
example, the Umbau 1.5 / Zielwert 0.7 factors against the printed norm.

Open / ideas for later:
- BKP / eBKP-H lists are only preloaded with main levels + HLKSE details – user should check/complete
  them (Einstellungen → Kostenpläne); eBKP-H element names were entered from memory.
- CSV import for catalogue texts (format from the user still missing).
- Project documents (upload) – together with document management.
- Offer revisions, importing offers (SIA 451), sending letters by e-mail.

## Open points

- [x] Phone number: `079 945 15 89` (from the Excel template)
- [x] Signature image: not used
- [x] GitHub repo: https://github.com/bohdanlupi/bohdansApp · Vercel project created
- [x] Supabase keys in `.env` + migration pushed (Zurich)
- [ ] Existing addresses (CSV import ready – test with the real export) / catalogue texts (format TBD)
