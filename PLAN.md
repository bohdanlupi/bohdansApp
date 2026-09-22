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

-- Kostenplan
cost_plan_templates id, name (BKP 2017, eBKP-H, own…)
cost_plan_items     id, template_id, parent_id, code (e.g. 250), name (i18n), sort
project_cost_items  id, project_id, cost_plan_item_id | custom code/name, budget, kv_amount (computed)

-- Eigenkatalog
catalogs            id, name, trade, version, active
catalog_nodes       id, catalog_id, parent_id, kind (chapter|section|position),
                    number, short_text (i18n), long_text (i18n), unit, default_price, sort
own_prices          id, catalog_node_id, price, valid_from, source, note

-- Leistungsverzeichnis
lvs                 id, project_id, number, title, trade, cost_plan_item_id, language,
                    status (Entwurf | Ausgeschrieben | Vergeben), catalog_ref
lv_nodes            id, lv_id, parent_id, kind (chapter|section|position|r_position|text),
                    number, short_text (i18n), long_text (i18n), unit, quantity,
                    estimate_price, is_optional (Eventualposition), is_lump_sum,
                    source_catalog_node_id, sort
lv_measurements     id, lv_node_id, description, formula / factors (a × b × c), count, result, sort
                    → quantity = Σ results (Vorausmass)

-- Ausschreibung / Offerten
lv_bidders          id, lv_id, company_id, contact_id, invited_at, status (eingeladen | offeriert | abgesagt)
offers              id, lv_bidder_id, received_at, discount_pct (Rabatt), skonto_pct,
                    other_deductions, vat_pct, notes, revision
offer_prices        offer_id, lv_node_id, unit_price, lump_sum, note
awards              id, lv_id, offer_id, decided_at, justification  (→ Vergabeantrag)

-- Dokumente
documents           id, project_id?, company_id?, storage_path, name, type, uploaded_by
```

All tables get `created_at/updated_at/created_by`. RLS policies: authenticated users of the firm
can read everything; write access by role.

## App structure

```
/login
/projekte                      list + create
/projekte/[id]                 overview, Beteiligte, documents
/projekte/[id]/kostenplan      BKP / KV
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

**Phase 2 – Eigenkatalog + Leistungsverzeichnis**
Catalogue editor; LV editor with tree (drag & drop, auto-numbering), insert positions from the catalogue,
R-positions, Eventualpositionen, Vorausmass, estimate prices from own prices; LV PDF on the firm letterhead.

**Phase 3 – BKP + Kostenvoranschlag**
Load the BKP template, assign LVs/positions to BKP codes, cost estimate with roll-ups, KV PDF.

**Phase 4 – Offerten + Angebotsvergleich**
Invite bidders, manual price entry per position, deductions (Rabatt, Skonto, MwSt), side-by-side
comparison (per position + totals, ranking, deviation from estimate, highlighting of min/max),
Vergabeantrag PDF, Auftragsbestätigung / Absageschreiben letters.

**Later (post-MVP)**
- SIA 451 / IfA18 (`.crbx`) import/export – requires the CRB specification and certification
- NPK import (with CRB licence), suissetec and IGH catalogues
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

Waiting on the user:
1. **SMTP** (own mailbox info@lupi-gmbh.ch or Resend/Brevo) – required to invite colleagues and to use the
   custom templates (free plan blocks templates without SMTP). Then re-run the script with `--templates`.
   Until then, colleagues can be added in Supabase → Authentication → Users (they start as viewer).
2. **Delete the old London project** `upcwquytpfihfpbvulbp`.

Phase 1 done (2026-09-22): migrations `20260922180000_addresses_projects.sql` and
`20260922190000_import_addresses.sql` applied to Zurich; 23 DB/RLS checks and page smoke tests passed.
CSV import: semicolon/comma/tab, UTF-8 or Windows-1252, column mapping with DE/FR/IT header guessing,
atomic via `import_addresses()` RPC. Waiting for the real address export from the user to verify.

Next: **Phase 2 (Eigenkatalog + Leistungsverzeichnis)**.

## Open points

- [x] Phone number: `079 945 15 89` (from the Excel template)
- [x] Signature image: not used
- [x] GitHub repo: https://github.com/bohdanlupi/bohdansApp · Vercel project created
- [x] Supabase keys in `.env` + migration pushed (Zurich)
- [ ] Existing addresses (CSV import ready – test with the real export) / catalogue texts (format TBD)
