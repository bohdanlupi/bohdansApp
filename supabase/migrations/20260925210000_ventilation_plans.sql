-- KWL-Planung per project, structured by the SIA 108 phases (31 Vorprojekt … 61 Betrieb):
-- design criteria, checklist states, inputs of the phase calculations and commissioning measurements.
-- One row per project; the dwelling calculations stay in ventilation_calcs.
--
-- data (jsonb)  validated and interpreted by the app (src/lib/kwl/plan-schema.ts).

create table public.ventilation_plans (
  project_id  uuid primary key references public.projects (id) on delete cascade,
  data        jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid() references public.profiles (id) on delete set null
);

create trigger ventilation_plans_updated_at
  before update on public.ventilation_plans
  for each row execute function public.set_updated_at();

alter table public.ventilation_plans enable row level security;

create policy "ventilation_plans: read for members" on public.ventilation_plans for select to authenticated
  using ((select public.current_app_role()) is not null);
create policy "ventilation_plans: insert for writers" on public.ventilation_plans for insert to authenticated
  with check ((select public.can_write()));
create policy "ventilation_plans: update for writers" on public.ventilation_plans for update to authenticated
  using ((select public.can_write())) with check ((select public.can_write()));
create policy "ventilation_plans: delete for writers" on public.ventilation_plans for delete to authenticated
  using ((select public.can_write()));

revoke all on public.ventilation_plans from anon;
grant select, insert, update, delete on public.ventilation_plans to authenticated;
