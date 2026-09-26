-- Heizungsplanung per project, structured by the SIA 108 phases (31 Vorprojekt … 61 Betrieb):
-- design criteria (Planungsgrundlagen), checklist states and notes per phase. One row per project.
--
-- data (jsonb)  validated and interpreted by the app (src/lib/heating/plan-schema.ts).

create table public.heating_plans (
  project_id  uuid primary key references public.projects (id) on delete cascade,
  data        jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid() references public.profiles (id) on delete set null
);

create trigger heating_plans_updated_at
  before update on public.heating_plans
  for each row execute function public.set_updated_at();

alter table public.heating_plans enable row level security;

create policy "heating_plans: read for members" on public.heating_plans for select to authenticated
  using ((select public.current_app_role()) is not null);
create policy "heating_plans: insert for writers" on public.heating_plans for insert to authenticated
  with check ((select public.can_write()));
create policy "heating_plans: update for writers" on public.heating_plans for update to authenticated
  using ((select public.can_write())) with check ((select public.can_write()));
create policy "heating_plans: delete for writers" on public.heating_plans for delete to authenticated
  using ((select public.can_write()));

revoke all on public.heating_plans from anon;
grant select, insert, update, delete on public.heating_plans to authenticated;
