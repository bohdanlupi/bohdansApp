-- Writers that still set unit_price directly (instead of gross_unit_price) enter a new gross price:
-- the value is taken over as gross_unit_price, and the statement trigger then applies the discounts.
-- Nested updates (the net price refresh itself) are left alone.

create function public.lv_nodes_gross_price()
returns trigger language plpgsql set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.gross_unit_price is null then
      new.gross_unit_price := new.unit_price;
    end if;
  elsif new.unit_price is distinct from old.unit_price and new.gross_unit_price is not distinct from old.gross_unit_price then
    new.gross_unit_price := new.unit_price;
  end if;
  return new;
end;
$$;

create trigger lv_nodes_gross_price
  before insert or update on public.lv_nodes
  for each row execute function public.lv_nodes_gross_price();
