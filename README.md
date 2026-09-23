# LUPI Planer

Web app for HLKS planning: addresses, projects, cost plans (BKP / eBKP-H), Leistungsverzeichnisse,
offer comparison. Next.js 16 on Vercel, Supabase (Postgres, Auth, Storage). UI and documents in DE/FR/IT.

See [PLAN.md](PLAN.md) for scope, data model and phases.

## Stack

| Part | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack, `src/proxy.ts` instead of middleware) |
| UI | Tailwind 4, shadcn/ui (base-ui), lucide icons |
| i18n | next-intl, locale from cookie / user profile (`de-CH`, `fr-CH`, `it-CH`) — no locale in URL |
| DB / Auth | Supabase, `@supabase/ssr`, Row Level Security, invite-only |
| PDF | `@react-pdf/renderer`, letterhead in `src/pdf/letterhead.tsx` |

## First-time setup

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Add `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` to `.env` (CLI only, not for Vercel).
3. Configure custom SMTP (**Authentication → Emails → SMTP**). Without it, Supabase only sends a few emails
   per hour, only to members of the Supabase organisation, and custom templates are blocked on the free plan.
4. Apply the auth settings (invite-only, password length, Site URL, email templates):
   ```powershell
   node scripts/configure-auth.mjs https://<your-app>.vercel.app --templates   # omit --templates without SMTP
   ```

### 2. Database

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
npm run db:push      # applies supabase/migrations
npm run db:types     # regenerates src/lib/supabase/database.types.ts
```

### 3. Environment

Copy `.env.example` to `.env` (or `.env.local`) and fill in the three values from **Project Settings → API
Keys**. Add the same three variables in Vercel (**Settings → Environment Variables**). No site URL variable is
needed: email links use the Site URL from the Supabase dashboard (step 1.3).

### 4. First admin

Create the first user in Supabase (**Authentication → Users → Add user**, with password). The first user
automatically becomes **Administrator**. Everyone else is invited from **Einstellungen → Benutzer**.

## Development

```powershell
npm install
npm run dev          # http://localhost:3000
npm run check        # messages + typecheck + lint
npx tsx scripts/render-sample-pdf.tsx de   # letterhead PDF without Supabase
```

### IGH supplier catalogues

Download the DataExpert catalogues (`<Supplier>-<no>-de.zip`) from igh.ch into `IGH/` (gitignored – licensed
price lists, the repo is public) and import them into the database from `.env`:

```powershell
node scripts/import-igh.mjs --dry-run IGH\Grundfos-1970-de.zip   # parse only, print counts
node scripts/import-igh.mjs IGH\Grundfos-1970-de.zip IGH\Sanitas-6130-de.zip
```

- One catalogue per file; the supplier register becomes the group tree, articles become positions with
  article number, unit and gross price (Sanitas colour/finish variants: one position per variant).
- Re-importing a newer version replaces the entries of the same catalogue (matched by supplier + catalogue
  number) and keeps its id and name. Entries already copied into LVs are not affected.
- In the app, IGH catalogues are read-only, loaded group by group and searched on the server.
  Copying into an LV adds "Fabrikat: …, Art.-Nr. …" to the long text.
- Free plan: the database may grow to 500 MB. The 14 catalogues imported on 2026-09-23 use ~220 MB;
  Zehnder HK (117k articles) and Debrunner Acifer (123k) were left out for that reason.

## Conventions

- Routes and URLs are German (`/projekte`, `/adressen`, …); code identifiers are English.
- UI texts live in `messages/*.json`; `de-CH` is the reference, `npm run check:messages` keeps fr/it in sync.
- Multilingual content (catalogue/LV texts) is stored as jsonb `{ de, fr, it }` → `src/lib/i18n-text.ts`.
- Printed numbers/dates always use Swiss format (`5'000.00`, `22.09.2026`) → `src/pdf/format.ts`.
- Every server action checks the role itself (`assertRole`), RLS enforces it again in the database.
- `vorlagen/` holds the original Office templates (not committed except the logo).
