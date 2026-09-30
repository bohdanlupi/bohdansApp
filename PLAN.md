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
                    → src/lib/heating/plant-schema.ts
```

All tables get `created_at/updated_at/created_by`. RLS policies: authenticated users of the firm
can read everything; write access by role.

## App structure

```
/login
/projekte                      list + create
/projekte/[id]                 overview, Beteiligte, documents
/projekte/[id]/kostenplan      BKP / KV
/projekte/[id]/heizung         redirects to the first checklist (31); checklist PDF /api/pdf/heating-plan/[id]
/projekte/[id]/heizung/[31…61] SIA 108 phase: checklists (SIA 384/1, 384/2, 384/6, 384/7, EN-103, HE301 refs)
/projekte/[id]/heizung/erzeugung/{system,warmwasser,speicher,gruppen,schema}?anlage=  242 Wärmeerzeugung, per Anlage
/projekte/[id]/heizung/verteilung/waermebedarf[/calcId]  243 Wärmebedarf SIA 384/2 (project-wide), PDF /api/pdf/heat-load/[calcId]
/projekte/[id]/heizung/verteilung/{fussbodenheizung[/systemId],heizkoerper,sicherheit,schema}?anlage=  243, per Anlage
/projekte/[id]/lueftung        KWL-Planung: design criteria + phase progress, PDF /api/pdf/kwl-plan/[id]
/projekte/[id]/lueftung/[31…61] SIA 108 phase: checklists (SIA 382/5 refs) + calculations + diagrams
/projekte/[id]/lueftung/wohnungen[/calcId]  dwelling calculations, PDF /api/pdf/kwl/[calcId]
/projekte/[id]/lv/[lvId]       LV editor (tree + detail panel, Vorausmass tab)
/projekte/[id]/lv/[lvId]/offerten        bidders, price entry per offer
/projekte/[id]/lv/[lvId]/vergleich       Angebotsvergleich + Vergabeantrag
/adressen                      companies + contacts
/kataloge                      own catalogue editor (same tree + detail UI as the LV)
/einstellungen                 users, letterhead, MwSt, cost plan templates
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
Prinzipschema: Strangschema (schema.ts; symbols after SIA 410 1.26 / 1.27 / 1.29 / 2.6 / 5, Wasserzähler and
Apparateanschluss after SN EN 806-1 as SIA 410 has none; PWC green, PWH red, PWH-C violet), web view at a fixed
scale (1.3 px per unit), full height, horizontal slider below to move it + plan PDF /api/pdf/sanitary-schema/<id> (Plankopf / revisions as the Lüftung schema; sheet height 297 / 420 /
594 mm, width a multiple of 210 mm, wide enough for schema and legend).
Insulation drawn as yellow bands with black dotted edges; each Leitung is labelled «KW / WW / ZK: diameter · insulation»
and «Dämmung: PIR / Mineralwolle» (no thickness classes in the legend).
Material list in the editor (no LV insertion yet).

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
