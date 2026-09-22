-- Phase 4 – Offerten + Angebotsvergleich.
--
-- lv_bidders    invited contractors of an LV together with the header of their offer
--               (received date, Rabatt %, Skonto %, other deductions CHF, VAT %)
-- offer_prices  unit price per bidder and LV position (lump sums: price for quantity 1)
-- lvs.award_*   the award decision (Vergabe) for an LV
--
-- One offer per bidder: a revised offer overwrites the prices.

create type public.bidder_status as enum ('invited', 'offered', 'declined');

create table public.lv_bidders (
  id                uuid primary key default gen_random_uuid(),
  lv_id             uuid not null references public.lvs (id) on delete cascade,
  company_id        uuid not null references public.companies (id) on delete restrict,
  contact_id        uuid,
  status            public.bidder_status not null default 'invited',
  invited_at        date default current_date,
  offer_received_at date,
  offer_reference   text,
  discount_pct      numeric(5, 2) not null default 0 check (discount_pct between 0 and 100),
  skonto_pct        numeric(5, 2) not null default 0 check (skonto_pct between 0 and 100),
  other_deductions  numeric(14, 2) not null default 0,
  vat_pct           numeric(5, 2) not null default 8.1 check (vat_pct between 0 and 100),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (lv_id, company_id),
  unique (id, lv_id),
  foreign key (contact_id, company_id) references public.contacts (id, company_id) on delete set null (contact_id)
);

create index lv_bidders_lv_idx on public.lv_bidders (lv_id);
create index lv_bidders_company_idx on public.lv_bidders (company_id);

create trigger lv_bidders_updated_at
  before update on public.lv_bidders
  for each row execute function public.set_updated_at();

create table public.offer_prices (
  lv_bidder_id  uuid not null,
  lv_node_id    uuid not null,
  lv_id         uuid not null,
  unit_price    numeric(14, 2),
  note          text,
  updated_at    timestamptz not null default now(),
  primary key (lv_bidder_id, lv_node_id),
  -- Bidder and position must belong to the same LV.
  foreign key (lv_bidder_id, lv_id) references public.lv_bidders (id, lv_id) on delete cascade,
  foreign key (lv_node_id, lv_id) references public.lv_nodes (id, lv_id) on delete cascade
);

create index offer_prices_node_idx on public.offer_prices (lv_node_id);

alter table public.lvs
  add column awarded_bidder_id uuid,
  add column award_date date,
  add column award_justification text,
  add constraint lvs_awarded_bidder_fkey
    foreign key (awarded_bidder_id, id) references public.lv_bidders (id, lv_id) on delete set null (awarded_bidder_id);

-- Offer gross totals (non-optional positions), with the number of positions still without a price.
create view public.offer_totals with (security_invoker = true) as
select
  b.id as lv_bidder_id,
  b.lv_id,
  coalesce(sum(round(coalesce(n.quantity, 0) * p.unit_price, 2)) filter (where not n.is_optional), 0)::numeric(14, 2)
    as gross_total,
  count(*) filter (where p.unit_price is null)::int as missing_prices
from public.lv_bidders b
join public.lv_nodes n on n.lv_id = b.lv_id and n.kind in ('position', 'r_position')
left join public.offer_prices p on p.lv_bidder_id = b.id and p.lv_node_id = n.id
group by b.id, b.lv_id;

do $$
declare
  t text;
begin
  foreach t in array array['lv_bidders', 'offer_prices'] loop
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

revoke all on public.offer_totals from anon;
grant select on public.offer_totals to authenticated;

-- lv_list uses l.*: recreate it so it includes the award columns.
drop view public.lv_list;
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

revoke all on public.lv_list from anon;
grant select on public.lv_list to authenticated;
