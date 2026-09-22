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

1. Create a project at [supabase.com](https://supabase.com), region **Zurich (eu-central-2)**.
2. **Authentication → Sign In / Providers**: disable "Allow new users to sign up" (the app is invite-only).
3. **Authentication → URL Configuration**: Site URL = your Vercel URL (e.g. `https://lupi-planer.vercel.app`),
   add `http://localhost:3000/**` to the redirect URLs.
4. **Authentication → Emails → Templates**: paste `supabase/templates/invite.html` into *Invite user* and
   `supabase/templates/recovery.html` into *Reset password* (they link to `/auth/confirm` with a token hash).
5. For real use, configure custom SMTP (**Authentication → Emails → SMTP**) – Supabase's built-in mailer is
   limited to a few emails per hour.

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

## Conventions

- Routes and URLs are German (`/projekte`, `/adressen`, …); code identifiers are English.
- UI texts live in `messages/*.json`; `de-CH` is the reference, `npm run check:messages` keeps fr/it in sync.
- Multilingual content (catalogue/LV texts) is stored as jsonb `{ de, fr, it }` → `src/lib/i18n-text.ts`.
- Printed numbers/dates always use Swiss format (`5'000.00`, `22.09.2026`) → `src/pdf/format.ts`.
- Every server action checks the role itself (`assertRole`), RLS enforces it again in the database.
- `vorlagen/` holds the original Office templates (not committed except the logo).
