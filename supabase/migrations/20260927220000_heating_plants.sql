-- Wärmeerzeugungsanlagen (chapter 242) of a project: generators, domestic hot water, storage, heating groups.
-- Chapter 243 (distribution) refers to them: floor heating systems (heating_systems.data.plantId), radiators,
-- safety equipment. data is described by src/lib/heating/plant-schema.ts.

create table public.heating_plants (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null check (btrim(name) <> ''),
  sort        int not null default 0,
  data        jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null default auth.uid()
);

create index heating_plants_project_idx on public.heating_plants (project_id, sort);

create trigger heating_plants_updated_at
  before update on public.heating_plants
  for each row execute function public.set_updated_at();

alter table public.heating_plants enable row level security;

create policy "heating_plants: read for members" on public.heating_plants for select to authenticated
  using ((select public.current_app_role()) is not null);
create policy "heating_plants: insert for writers" on public.heating_plants for insert to authenticated
  with check ((select public.can_write()));
create policy "heating_plants: update for writers" on public.heating_plants for update to authenticated
  using ((select public.can_write())) with check ((select public.can_write()));
create policy "heating_plants: delete for writers" on public.heating_plants for delete to authenticated
  using ((select public.can_write()));

revoke all on public.heating_plants from anon;
grant select, insert, update, delete on public.heating_plants to authenticated;
