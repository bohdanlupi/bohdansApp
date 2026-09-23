-- Discounts / surcharges on LV positions and groups (editor only).
--
-- gross_unit_price  the estimate price entered in the editor
-- discounts         up to 4 entries [{ "name": "Projektrabatt", "pct": 10 }, …]; pct > 0 = discount,
--                   pct < 0 = surcharge. A group's discounts apply to every position below it.
-- unit_price        from now on the net price: gross × Π (1 − pct / 100) over the position and all its
--                   groups, rounded to Rappen. It is maintained by the trigger below, so totals, views,
--                   PDFs, KV and the offer comparison keep using unit_price and never see the discounts.

alter table public.lv_nodes
  add column gross_unit_price numeric(14, 2),
  add column discounts jsonb not null default '[]'
    check (jsonb_typeof(discounts) = 'array' and jsonb_array_length(discounts) <= 4);

update public.lv_nodes set gross_unit_price = unit_price;

create function public.lv_discount_factor(p_discounts jsonb)
returns numeric language plpgsql immutable set search_path = '' as $$
declare
  factor numeric := 1;
  entry jsonb;
begin
  for entry in select * from jsonb_array_elements(coalesce(p_discounts, '[]')) loop
    factor := factor * (1 - coalesce((entry ->> 'pct')::numeric, 0) / 100);
  end loop;
  return factor;
end;
$$;

-- Recomputes the net prices of the given LVs; only rows whose price changes are written.
create function public.lv_refresh_prices(p_lv_ids uuid[])
returns void language sql security definer set search_path = '' as $$
  with recursive factors as (
    select n.id, public.lv_discount_factor(n.discounts) as factor
      from public.lv_nodes n
     where n.lv_id = any (p_lv_ids) and n.parent_id is null
    union all
    select c.id, f.factor * public.lv_discount_factor(c.discounts)
      from public.lv_nodes c
      join factors f on c.parent_id = f.id
  )
  update public.lv_nodes n
     set unit_price = round(n.gross_unit_price * f.factor, 2)
    from factors f
   where n.id = f.id
     and n.unit_price is distinct from round(n.gross_unit_price * f.factor, 2);
$$;

create function public.lv_nodes_refresh_prices()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- The refresh itself (and the Vorausmass trigger, which only changes quantities) runs nested: skip.
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  perform public.lv_refresh_prices(array(select distinct lv_id from new_rows));
  return null;
end;
$$;

revoke all on function public.lv_refresh_prices, public.lv_nodes_refresh_prices from public, anon, authenticated;

create trigger lv_nodes_refresh_prices_insert
  after insert on public.lv_nodes
  referencing new table as new_rows
  for each statement execute function public.lv_nodes_refresh_prices();

create trigger lv_nodes_refresh_prices_update
  after update on public.lv_nodes
  referencing new table as new_rows
  for each statement execute function public.lv_nodes_refresh_prices();
