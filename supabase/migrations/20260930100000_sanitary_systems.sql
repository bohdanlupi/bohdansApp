-- Sanitäranlagen of a project: Zentrale (Hausanschluss, Wasserzähler, Filter, Verteilbatterie, Wassererwärmer),
-- the drinking water network (PWC / PWH / PWH-C, Stränge, Apparategruppen) for the SVGW W3 sizing, the
-- Zirkulationsberechnung and the Prinzipschema. schema_plan holds the Plankopf of the Prinzipschema PDF (SIA phase,
-- revisions) like ventilation_systems.schema_plan.
--
-- data (jsonb)  validated and interpreted by the app (src/lib/sanitary/system-schema.ts); results are computed.

create table public.sanitary_systems (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  name         text not null check (btrim(name) <> ''),
  sort         integer not null default 0,
  data         jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  schema_plan  jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null
);

create index sanitary_systems_project_idx on public.sanitary_systems (project_id, sort);

create trigger sanitary_systems_updated_at
  before update on public.sanitary_systems
  for each row execute function public.set_updated_at();

alter table public.sanitary_systems enable row level security;

create policy "sanitary_systems: read for members" on public.sanitary_systems for select to authenticated
  using ((select public.current_app_role()) is not null);
create policy "sanitary_systems: insert for writers" on public.sanitary_systems for insert to authenticated
  with check ((select public.can_write()));
create policy "sanitary_systems: update for writers" on public.sanitary_systems for update to authenticated
  using ((select public.can_write())) with check ((select public.can_write()));
create policy "sanitary_systems: delete for writers" on public.sanitary_systems for delete to authenticated
  using ((select public.can_write()));

revoke all on public.sanitary_systems from anon;
grant select, insert, update, delete on public.sanitary_systems to authenticated;
