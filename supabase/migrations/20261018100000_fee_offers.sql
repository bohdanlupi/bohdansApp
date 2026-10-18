-- Honorarofferten: fee offers after SIA 108 for Heizung, Kälte, Lüftung/Klima and Sanitär, made before a project
-- exists (client + project address). An accepted offer can become a project (project_id).
--
-- data (jsonb)  validated and interpreted by the app (src/lib/fees/offer-schema.ts): fee method, trades with the
--               SIA 108 factors and phases, services per trade and phase, copy of the firm's fee settings.
-- firm_settings.fee_settings  firm-wide defaults (Z1/Z2, Leistungsanteile, rate categories, Nebenkosten)
--               → src/lib/fees/settings-schema.ts.

create table public.fee_offers (
  id           uuid primary key default gen_random_uuid(),
  number       text not null unique check (btrim(number) <> ''),
  title        text not null check (btrim(title) <> ''),
  status       text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined')),
  company_id   uuid references public.companies (id) on delete set null,
  contact_id   uuid references public.contacts (id) on delete set null,
  project_id   uuid references public.projects (id) on delete set null,
  street       text,
  zip          text,
  city         text,
  language     public.app_language not null default 'de',
  offer_date   date not null default current_date,
  valid_until  date,
  data         jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null
);

create index fee_offers_company_idx on public.fee_offers (company_id);
create index fee_offers_project_idx on public.fee_offers (project_id);

create trigger fee_offers_updated_at
  before update on public.fee_offers
  for each row execute function public.set_updated_at();

alter table public.fee_offers enable row level security;

create policy "fee_offers: read for members" on public.fee_offers for select to authenticated
  using ((select public.current_app_role()) is not null);
create policy "fee_offers: insert for writers" on public.fee_offers for insert to authenticated
  with check ((select public.can_write()));
create policy "fee_offers: update for writers" on public.fee_offers for update to authenticated
  using ((select public.can_write())) with check ((select public.can_write()));
create policy "fee_offers: delete for writers" on public.fee_offers for delete to authenticated
  using ((select public.can_write()));

revoke all on public.fee_offers from anon;
grant select, insert, update, delete on public.fee_offers to authenticated;

alter table public.firm_settings
  add column fee_settings jsonb not null default '{}' check (jsonb_typeof(fee_settings) = 'object');
