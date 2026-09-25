-- KWL-Auslegung (kontrollierte Wohnungslüftung) per project: one calculation per dwelling / unit.
--
-- data (jsonb)  rooms with air flows, filter classification, device and pressure drops, notes.
--               Validated and interpreted by the app (src/lib/kwl/schema.ts); all results are computed
--               on the fly (src/lib/kwl/calc.ts), nothing derived is stored.

create table public.ventilation_calcs (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null check (btrim(name) <> ''),
  sort        integer not null default 0,
  data        jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null
);

create index ventilation_calcs_project_idx on public.ventilation_calcs (project_id, sort);

create trigger ventilation_calcs_updated_at
  before update on public.ventilation_calcs
  for each row execute function public.set_updated_at();

alter table public.ventilation_calcs enable row level security;

create policy "ventilation_calcs: read for members" on public.ventilation_calcs for select to authenticated
  using ((select public.current_app_role()) is not null);
create policy "ventilation_calcs: insert for writers" on public.ventilation_calcs for insert to authenticated
  with check ((select public.can_write()));
create policy "ventilation_calcs: update for writers" on public.ventilation_calcs for update to authenticated
  using ((select public.can_write())) with check ((select public.can_write()));
create policy "ventilation_calcs: delete for writers" on public.ventilation_calcs for delete to authenticated
  using ((select public.can_write()));

revoke all on public.ventilation_calcs from anon;
grant select, insert, update, delete on public.ventilation_calcs to authenticated;
