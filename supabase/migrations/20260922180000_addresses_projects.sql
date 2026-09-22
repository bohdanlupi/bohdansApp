-- Phase 1 – Adressen + Projekte: companies, contacts, projects, project participants.
--
-- Every address is a company (a private client is entered as a company named after the person);
-- contacts always belong to a company. Categories and trades are stored as text keys validated
-- by the app (src/lib/address-options.ts), so new keys need no migration.

-- ---------------------------------------------------------------------------
-- Companies
-- ---------------------------------------------------------------------------
create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (btrim(name) <> ''),
  name2       text,
  street      text,
  po_box      text,
  zip         text,
  city        text,
  country     text not null default 'CH',
  phone       text,
  email       text,
  website     text,
  uid_number  text,
  language    public.app_language not null default 'de',
  categories  text[] not null default '{}',
  trades      text[] not null default '{}',
  notes       text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null
);

create index companies_name_idx on public.companies (lower(name));
create index companies_categories_idx on public.companies using gin (categories);

create trigger companies_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Contacts (persons at a company)
-- ---------------------------------------------------------------------------
create table public.contacts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  salutation  text check (salutation in ('mr', 'ms')),
  first_name  text,
  last_name   text not null check (btrim(last_name) <> ''),
  function    text,
  phone       text,
  mobile      text,
  email       text,
  language    public.app_language,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  -- Target for the composite key below: a participant's contact must work at its company.
  unique (id, company_id)
);

create index contacts_company_idx on public.contacts (company_id);

create trigger contacts_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
create type public.project_status as enum ('acquisition', 'active', 'on_hold', 'completed', 'archived');

create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  number       text not null unique check (btrim(number) <> ''),
  name         text not null check (btrim(name) <> ''),
  street       text,
  zip          text,
  city         text,
  status       public.project_status not null default 'active',
  -- Language of the documents (LV, letters) printed for this project.
  language     public.app_language not null default 'de',
  start_date   date,
  end_date     date,
  description  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null
);

create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Project participants (Bauherr, Architekt, Unternehmer, …)
-- ---------------------------------------------------------------------------
create table public.project_participants (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  -- Restrict: a company that takes part in a project cannot be deleted (archive it instead).
  company_id  uuid not null references public.companies (id) on delete restrict,
  contact_id  uuid,
  role        text not null,
  note        text,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (project_id, company_id, role),
  foreign key (contact_id, company_id) references public.contacts (id, company_id)
    on delete set null (contact_id)
);

create index project_participants_project_idx on public.project_participants (project_id);
create index project_participants_company_idx on public.project_participants (company_id);

-- ---------------------------------------------------------------------------
-- Search views (security_invoker: the caller's RLS applies)
-- ---------------------------------------------------------------------------
create view public.company_list with (security_invoker = true) as
select
  c.*,
  (select count(*) from public.contacts ct where ct.company_id = c.id)::int as contact_count,
  lower(concat_ws(' ',
    c.name, c.name2, c.street, c.zip, c.city, c.email, c.phone,
    (select string_agg(concat_ws(' ', ct.first_name, ct.last_name, ct.email), ' ')
       from public.contacts ct where ct.company_id = c.id)
  )) as search_text
from public.companies c;

create view public.project_list with (security_invoker = true) as
select
  p.*,
  (select string_agg(c.name, ', ' order by c.name)
     from public.project_participants pp
     join public.companies c on c.id = pp.company_id
    where pp.project_id = p.id and pp.role = 'client') as client_names,
  lower(concat_ws(' ',
    p.number, p.name, p.street, p.zip, p.city,
    (select string_agg(c.name, ' ')
       from public.project_participants pp
       join public.companies c on c.id = pp.company_id
      where pp.project_id = p.id)
  )) as search_text
from public.projects p;

-- ---------------------------------------------------------------------------
-- Row Level Security: members read, admins and planners write
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.projects enable row level security;
alter table public.project_participants enable row level security;

create policy "companies: read for members" on public.companies
  for select to authenticated using (public.current_app_role() is not null);
create policy "companies: insert for writers" on public.companies
  for insert to authenticated with check (public.can_write());
create policy "companies: update for writers" on public.companies
  for update to authenticated using (public.can_write()) with check (public.can_write());
create policy "companies: delete for writers" on public.companies
  for delete to authenticated using (public.can_write());

create policy "contacts: read for members" on public.contacts
  for select to authenticated using (public.current_app_role() is not null);
create policy "contacts: insert for writers" on public.contacts
  for insert to authenticated with check (public.can_write());
create policy "contacts: update for writers" on public.contacts
  for update to authenticated using (public.can_write()) with check (public.can_write());
create policy "contacts: delete for writers" on public.contacts
  for delete to authenticated using (public.can_write());

create policy "projects: read for members" on public.projects
  for select to authenticated using (public.current_app_role() is not null);
create policy "projects: insert for writers" on public.projects
  for insert to authenticated with check (public.can_write());
create policy "projects: update for writers" on public.projects
  for update to authenticated using (public.can_write()) with check (public.can_write());
create policy "projects: delete for writers" on public.projects
  for delete to authenticated using (public.can_write());

create policy "project_participants: read for members" on public.project_participants
  for select to authenticated using (public.current_app_role() is not null);
create policy "project_participants: insert for writers" on public.project_participants
  for insert to authenticated with check (public.can_write());
create policy "project_participants: update for writers" on public.project_participants
  for update to authenticated using (public.can_write()) with check (public.can_write());
create policy "project_participants: delete for writers" on public.project_participants
  for delete to authenticated using (public.can_write());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on public.companies, public.contacts, public.projects, public.project_participants,
  public.company_list, public.project_list from anon;
grant select, insert, update, delete
  on public.companies, public.contacts, public.projects, public.project_participants to authenticated;
grant select on public.company_list, public.project_list to authenticated;
