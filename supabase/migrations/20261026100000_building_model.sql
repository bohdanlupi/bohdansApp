-- Gebäudemodell: the architect's plans traced into rooms (and later the thermal envelope) per project, feeding the
-- SIA 384/2 heat load and the SIA 380/1 balance. See PLAN.md «Gebäudemodell, Plan-Tracing und SIA 380/1».
--
-- building_plans   one uploaded plan page per Geschoss: the original file and the PNG snapshot rendered in the browser,
--                  both in the private bucket "plans" (<project id>/<plan id>/…), calibration (scale m/px, rotation,
--                  north, origin) of the snapshot pixel coordinates in which the geometry is drawn.
-- building_models  one row per project; data jsonb (floors, rooms with polygons, zones, envelope …) validated by the app
--                  (src/lib/building/schema.ts).

create table public.building_plans (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  floor          text not null,
  name           text not null default '',
  file_path      text not null,
  snapshot_path  text not null,
  page           integer not null default 1 check (page >= 1),
  width          integer not null check (width > 0),
  height         integer not null check (height > 0),
  scale          double precision check (scale is null or scale > 0),
  rotation       double precision not null default 0,
  north          double precision,
  origin_x       double precision not null default 0,
  origin_y       double precision not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (project_id, floor)
);

create trigger building_plans_updated_at
  before update on public.building_plans
  for each row execute function public.set_updated_at();

alter table public.building_plans enable row level security;

create policy "building_plans: read for members" on public.building_plans for select to authenticated
  using ((select public.current_app_role()) is not null);
create policy "building_plans: insert for writers" on public.building_plans for insert to authenticated
  with check ((select public.can_write()));
create policy "building_plans: update for writers" on public.building_plans for update to authenticated
  using ((select public.can_write())) with check ((select public.can_write()));
create policy "building_plans: delete for writers" on public.building_plans for delete to authenticated
  using ((select public.can_write()));

revoke all on public.building_plans from anon;
grant select, insert, update, delete on public.building_plans to authenticated;

create table public.building_models (
  project_id  uuid primary key references public.projects (id) on delete cascade,
  data        jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid() references public.profiles (id) on delete set null
);

create trigger building_models_updated_at
  before update on public.building_models
  for each row execute function public.set_updated_at();

alter table public.building_models enable row level security;

create policy "building_models: read for members" on public.building_models for select to authenticated
  using ((select public.current_app_role()) is not null);
create policy "building_models: insert for writers" on public.building_models for insert to authenticated
  with check ((select public.can_write()));
create policy "building_models: update for writers" on public.building_models for update to authenticated
  using ((select public.can_write())) with check ((select public.can_write()));
create policy "building_models: delete for writers" on public.building_models for delete to authenticated
  using ((select public.can_write()));

revoke all on public.building_models from anon;
grant select, insert, update, delete on public.building_models to authenticated;

-- Storage: architect plans (PDF, PNG, JPEG up to 50 MB) and their PNG snapshots, uploaded from the browser.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plans', 'plans', false, 52428800, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy "plans bucket: read for members"
  on storage.objects for select to authenticated
  using (bucket_id = 'plans' and public.current_app_role() is not null);

create policy "plans bucket: insert for writers"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'plans' and public.can_write());

create policy "plans bucket: update for writers"
  on storage.objects for update to authenticated
  using (bucket_id = 'plans' and public.can_write());

create policy "plans bucket: delete for writers"
  on storage.objects for delete to authenticated
  using (bucket_id = 'plans' and public.can_write());
