-- Phase 2 – Eigenkatalog + Leistungsverzeichnis.
--
-- Catalogue and LV trees share one node model:
--   group       heading (Hauptgruppe / Untergruppe), may contain groups, positions and texts
--   position    priced position taken from the catalogue
--   r_position  free position written for this LV only (NPK "R-Position"); not used in catalogues
--   text        unnumbered text block (Vorbemerkungen, notes)
-- Numbers (100, 110, 110.101, …) are assigned by the app (src/lib/tree.ts) after every structural change.
-- Texts are multilingual jsonb { "de": "...", "fr": "...", "it": "..." }.
-- Totals: quantity × unit_price; lump-sum positions use quantity 1. Optional positions
-- (Eventualpositionen) are not part of the total.

create type public.node_kind as enum ('group', 'position', 'r_position', 'text');
create type public.lv_status as enum ('draft', 'tendered', 'awarded');

-- ---------------------------------------------------------------------------
-- Own catalogue
-- ---------------------------------------------------------------------------
create table public.catalogs (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (btrim(name) <> ''),
  trade        text,
  description  text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null
);

create trigger catalogs_updated_at
  before update on public.catalogs
  for each row execute function public.set_updated_at();

create table public.catalog_nodes (
  id          uuid primary key default gen_random_uuid(),
  catalog_id  uuid not null references public.catalogs (id) on delete cascade,
  parent_id   uuid,
  kind        public.node_kind not null check (kind <> 'r_position'),
  number      text,
  short_text  jsonb not null default '{}' check (jsonb_typeof(short_text) = 'object'),
  long_text   jsonb not null default '{}' check (jsonb_typeof(long_text) = 'object'),
  unit        text,
  unit_price  numeric(14, 2),
  price_date  date,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, catalog_id),
  -- The parent must be a node of the same catalogue.
  foreign key (parent_id, catalog_id) references public.catalog_nodes (id, catalog_id) on delete cascade
);

create index catalog_nodes_catalog_idx on public.catalog_nodes (catalog_id, sort);

create trigger catalog_nodes_updated_at
  before update on public.catalog_nodes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Leistungsverzeichnisse
-- ---------------------------------------------------------------------------
create table public.lvs (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects (id) on delete cascade,
  number               text not null check (btrim(number) <> ''),
  title                text not null check (btrim(title) <> ''),
  trade                text,
  -- Language the LV is printed in; defaults to the project's document language.
  language             public.app_language not null default 'de',
  status               public.lv_status not null default 'draft',
  description          text,
  submission_deadline  date,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (project_id, number)
);

create index lvs_project_idx on public.lvs (project_id);

create trigger lvs_updated_at
  before update on public.lvs
  for each row execute function public.set_updated_at();

create table public.lv_nodes (
  id                      uuid primary key default gen_random_uuid(),
  lv_id                   uuid not null references public.lvs (id) on delete cascade,
  parent_id               uuid,
  kind                    public.node_kind not null,
  number                  text,
  short_text              jsonb not null default '{}' check (jsonb_typeof(short_text) = 'object'),
  long_text               jsonb not null default '{}' check (jsonb_typeof(long_text) = 'object'),
  unit                    text,
  quantity                numeric(14, 3),
  unit_price              numeric(14, 2),
  is_optional             boolean not null default false,
  is_lump_sum             boolean not null default false,
  source_catalog_node_id  uuid references public.catalog_nodes (id) on delete set null,
  sort                    integer not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (id, lv_id),
  foreign key (parent_id, lv_id) references public.lv_nodes (id, lv_id) on delete cascade
);

create index lv_nodes_lv_idx on public.lv_nodes (lv_id, sort);

create trigger lv_nodes_updated_at
  before update on public.lv_nodes
  for each row execute function public.set_updated_at();

-- Vorausmass: quantity of a position = Σ count × a × b × c (empty factors count as 1).
create table public.lv_measurements (
  id          uuid primary key default gen_random_uuid(),
  lv_node_id  uuid not null references public.lv_nodes (id) on delete cascade,
  description text,
  count       numeric(14, 3) not null default 1,
  factor_a    numeric(14, 3),
  factor_b    numeric(14, 3),
  factor_c    numeric(14, 3),
  result      numeric(14, 3) generated always as (
                round(count * coalesce(factor_a, 1) * coalesce(factor_b, 1) * coalesce(factor_c, 1), 3)
              ) stored,
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);

create index lv_measurements_node_idx on public.lv_measurements (lv_node_id, sort);

create or replace function public.sync_measured_quantity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  node_id uuid := coalesce(new.lv_node_id, old.lv_node_id);
begin
  -- When the last measurement is removed the quantity keeps its value.
  update public.lv_nodes n
     set quantity = s.total
    from (select sum(result) as total from public.lv_measurements where lv_node_id = node_id) s
   where n.id = node_id and s.total is not null;
  return null;
end;
$$;

create trigger lv_measurements_sync
  after insert or update or delete on public.lv_measurements
  for each row execute function public.sync_measured_quantity();

-- LV list with estimate totals (optional positions excluded).
create view public.lv_list with (security_invoker = true) as
select
  l.*,
  coalesce((
    select sum(round(coalesce(n.quantity, 0) * coalesce(n.unit_price, 0), 2))
      from public.lv_nodes n
     where n.lv_id = l.id and n.kind in ('position', 'r_position') and not n.is_optional
  ), 0)::numeric(14, 2) as estimate_total,
  (select count(*) from public.lv_nodes n where n.lv_id = l.id and n.kind in ('position', 'r_position'))::int
    as position_count
from public.lvs l;

-- ---------------------------------------------------------------------------
-- Row Level Security: members read, admins and planners write
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['catalogs', 'catalog_nodes', 'lvs', 'lv_nodes', 'lv_measurements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "%1$s: read for members" on public.%1$I for select to authenticated
         using (public.current_app_role() is not null)', t);
    execute format(
      'create policy "%1$s: insert for writers" on public.%1$I for insert to authenticated
         with check (public.can_write())', t);
    execute format(
      'create policy "%1$s: update for writers" on public.%1$I for update to authenticated
         using (public.can_write()) with check (public.can_write())', t);
    execute format(
      'create policy "%1$s: delete for writers" on public.%1$I for delete to authenticated
         using (public.can_write())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

revoke all on public.lv_list from anon;
grant select on public.lv_list to authenticated;
