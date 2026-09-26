-- Ventilation systems (Lüftungsanlagen) of a project: device, served dwellings and the branched duct network
-- (outdoor chain, supply tree, extract tree, exhaust chain) for the pressure-drop calculation, the Prinzipschema
-- and the quantities for the Leistungsverzeichnis. A single-family house usually has one system.
--
-- data (jsonb)  validated and interpreted by the app (src/lib/kwl/system-schema.ts); results are computed.

create table public.ventilation_systems (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null check (btrim(name) <> ''),
  sort        integer not null default 0,
  data        jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null
);

create index ventilation_systems_project_idx on public.ventilation_systems (project_id, sort);

create trigger ventilation_systems_updated_at
  before update on public.ventilation_systems
  for each row execute function public.set_updated_at();

alter table public.ventilation_systems enable row level security;

create policy "ventilation_systems: read for members" on public.ventilation_systems for select to authenticated
  using ((select public.current_app_role()) is not null);
create policy "ventilation_systems: insert for writers" on public.ventilation_systems for insert to authenticated
  with check ((select public.can_write()));
create policy "ventilation_systems: update for writers" on public.ventilation_systems for update to authenticated
  using ((select public.can_write())) with check ((select public.can_write()));
create policy "ventilation_systems: delete for writers" on public.ventilation_systems for delete to authenticated
  using ((select public.can_write()));

revoke all on public.ventilation_systems from anon;
grant select, insert, update, delete on public.ventilation_systems to authenticated;
