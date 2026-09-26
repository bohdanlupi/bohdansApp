-- Heizung «Anlagen»: Konzepte = heat load calculations after SIA 384/2 (one per building / unit, rooms with their
-- building elements); Dimensionierung = heating systems (floor heating per distributor after HAKA Gerodur).
-- Site, climate and the construction catalogue live in heating_plans.data (project level).
--
-- data (jsonb)  validated and interpreted by the app (src/lib/heating/heat-load-schema.ts, floor-schema.ts);
--               all results are computed on the fly, nothing derived is stored.
create table public.heating_calcs (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null check (btrim(name) <> ''),
  sort        integer not null default 0,
  data        jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null
);

create index heating_calcs_project_idx on public.heating_calcs (project_id, sort);

create trigger heating_calcs_updated_at
  before update on public.heating_calcs
  for each row execute function public.set_updated_at();

alter table public.heating_calcs enable row level security;

create policy "heating_calcs: read for members" on public.heating_calcs for select to authenticated
  using ((select public.current_app_role()) is not null);
create policy "heating_calcs: insert for writers" on public.heating_calcs for insert to authenticated
  with check ((select public.can_write()));
create policy "heating_calcs: update for writers" on public.heating_calcs for update to authenticated
  using ((select public.can_write())) with check ((select public.can_write()));
create policy "heating_calcs: delete for writers" on public.heating_calcs for delete to authenticated
  using ((select public.can_write()));

revoke all on public.heating_calcs from anon;
grant select, insert, update, delete on public.heating_calcs to authenticated;

create table public.heating_systems (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null check (btrim(name) <> ''),
  sort        integer not null default 0,
  data        jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null
);

create index heating_systems_project_idx on public.heating_systems (project_id, sort);

create trigger heating_systems_updated_at
  before update on public.heating_systems
  for each row execute function public.set_updated_at();

alter table public.heating_systems enable row level security;

create policy "heating_systems: read for members" on public.heating_systems for select to authenticated
  using ((select public.current_app_role()) is not null);
create policy "heating_systems: insert for writers" on public.heating_systems for insert to authenticated
  with check ((select public.can_write()));
create policy "heating_systems: update for writers" on public.heating_systems for update to authenticated
  using ((select public.can_write())) with check ((select public.can_write()));
create policy "heating_systems: delete for writers" on public.heating_systems for delete to authenticated
  using ((select public.can_write()));

revoke all on public.heating_systems from anon;
grant select, insert, update, delete on public.heating_systems to authenticated;

