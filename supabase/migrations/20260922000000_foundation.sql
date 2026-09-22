-- Phase 0 – Foundation: users/roles, firm settings, storage.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'planer', 'viewer');
create type public.app_language as enum ('de', 'fr', 'it');

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  role        public.app_role not null default 'viewer',
  language    public.app_language not null default 'de',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Role of the calling user (null if not logged in or deactivated).
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid() and active;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'admin', false);
$$;

-- Admins and planners may change project data; viewers are read-only.
create or replace function public.can_write()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() in ('admin', 'planer'), false);
$$;

-- Create a profile for every new auth user. The very first user becomes admin,
-- everyone else starts as viewer until an admin assigns a role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_first boolean;
begin
  select not exists (select 1 from public.profiles) into is_first;

  insert into public.profiles (id, email, full_name, role, language)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    case when is_first then 'admin'::public.app_role else 'viewer'::public.app_role end,
    coalesce(
      (new.raw_user_meta_data ->> 'language')::public.app_language,
      'de'::public.app_language
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Non-admins may only edit their own name and language.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Service role (no auth.uid()) and admins may change everything.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.active is distinct from old.active
     or new.email is distinct from old.email then
    raise exception 'Only admins may change role, status or email';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

alter table public.profiles enable row level security;

create policy "profiles: read for members"
  on public.profiles for select to authenticated
  using (public.current_app_role() is not null);

create policy "profiles: update own or admin"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

-- ---------------------------------------------------------------------------
-- Firm settings (single row): letterhead data, bank details, defaults
-- ---------------------------------------------------------------------------
create table public.firm_settings (
  id                   boolean primary key default true check (id),
  name                 text not null,
  street               text,
  zip                  text,
  city                 text,
  country              text not null default 'CH',
  phone                text,
  email                text,
  website              text,
  uid_number           text,
  bank_name            text,
  iban                 text,
  bic                  text,
  managing_director    text,
  vat_rate             numeric(5, 2) not null default 8.1,
  offer_validity_days  integer not null default 30,
  payment_terms_days   integer not null default 30,
  logo_path            text,
  signature_path       text,
  updated_at           timestamptz not null default now(),
  updated_by           uuid references public.profiles (id)
);

create trigger firm_settings_updated_at
  before update on public.firm_settings
  for each row execute function public.set_updated_at();

alter table public.firm_settings enable row level security;

create policy "firm_settings: read for members"
  on public.firm_settings for select to authenticated
  using (public.current_app_role() is not null);

create policy "firm_settings: update for admins"
  on public.firm_settings for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Values taken from the Offerte templates (vorlagen/).
insert into public.firm_settings (
  name, street, zip, city, phone, email, website, uid_number,
  bank_name, iban, bic, managing_director
) values (
  'LUPI Technik & Planung GmbH', 'Hintermättlistrasse 14b', '5506', 'Mägenwil',
  '079 945 15 89', 'info@lupi-gmbh.ch', 'www.lupi-gmbh.ch', 'CHE-262.091.082',
  'UBS Schweiz AG', 'CH38 0021 1211 1325 1501 H', 'UBSWCHZH80A', 'Bohdan Lupi'
);

-- ---------------------------------------------------------------------------
-- Grants (explicit, so the Data API only exposes what RLS allows)
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.firm_settings from anon;
grant select, update on public.profiles to authenticated;
grant select, update on public.firm_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for logo, signature and other firm assets
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('firm', 'firm', false)
on conflict (id) do nothing;

create policy "firm bucket: read for members"
  on storage.objects for select to authenticated
  using (bucket_id = 'firm' and public.current_app_role() is not null);

create policy "firm bucket: write for admins"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'firm' and public.is_admin());

create policy "firm bucket: update for admins"
  on storage.objects for update to authenticated
  using (bucket_id = 'firm' and public.is_admin());

create policy "firm bucket: delete for admins"
  on storage.objects for delete to authenticated
  using (bucket_id = 'firm' and public.is_admin());
